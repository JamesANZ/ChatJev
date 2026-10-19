import { createHeuristicLlm, type LlmClient } from "./llm";
import {
  allowedPercents,
  clipEvidence,
  narrationKeepsPercents,
  validateQuestions,
  viewJudgment,
} from "./questions";
import { formatSources } from "./snippets";
import { REFUSAL_MESSAGE } from "./verdict";
import {
  ChatJevError,
  type AskResult,
  type DocumentContext,
  type JevClient,
  type JevQuestion,
} from "./types";

export async function askDocument(
  client: JevClient,
  document: DocumentContext | null,
  question: string,
  llm: LlmClient = createHeuristicLlm(),
): Promise<AskResult> {
  const trimmed = question.trim();
  if (!trimmed) {
    return {
      kind: "refusal",
      question,
      message: "Ask a question for Jev to judge.",
    };
  }

  const snippets = await llm.gather({
    question: trimmed,
    filename: document?.filename,
    document: document?.text,
  });

  if (!document && snippets.length === 0) {
    throw new ChatJevError(
      400,
      "missing_evidence",
      "Attach a document or ask something the web can supply evidence for.",
    );
  }

  const clipped = clipEvidence(document?.text ?? "", formatSources(snippets));
  let feedback: string | undefined;
  let questions: Record<string, JevQuestion> | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let drafts;
    try {
      drafts = await llm.compile({
        question: trimmed,
        filename: document?.filename ?? "",
        document: clipped.document,
        sourcesText: clipped.sources,
        feedback,
      });
    } catch (error) {
      feedback =
        error instanceof Error
          ? error.message.slice(0, 240)
          : "The question list was not valid.";
      continue;
    }

    if (drafts.length === 0) {
      return {
        kind: "refusal",
        question: trimmed,
        message: REFUSAL_MESSAGE,
      };
    }

    const validated = validateQuestions(drafts);
    if (validated.ok) {
      questions = validated.questions;
      break;
    }
    feedback = validated.error;
  }

  if (!questions) {
    return {
      kind: "refusal",
      question: trimmed,
      message: feedback
        ? `ChatJev could not turn that into a closed judgment. ${feedback}`
        : "ChatJev could not turn that into a closed judgment. Try a more specific question.",
    };
  }

  const response = await client.evaluate({
    state: {
      filename: document?.filename ?? "",
      document: clipped.document,
      sources: clipped.sources,
      user_question: trimmed,
    },
    questions,
  });

  const judgments = Object.entries(questions).map(([key, item]) =>
    viewJudgment(key, item, response.answers[key]),
  );
  const fallback = judgments.map((item) => item.line).join(" ");

  let narration: string | null = null;
  try {
    const reading = (
      await llm.narrate({
        question: trimmed,
        lines: judgments.map((item) => item.line),
        sources: snippets,
      })
    ).trim();
    if (
      reading &&
      narrationKeepsPercents(reading, allowedPercents(response.answers))
    ) {
      narration = reading;
    }
  } catch {
    narration = null;
  }

  return {
    kind: "verdict",
    question: trimmed,
    message: narration ?? fallback,
    narration,
    judgments,
    sources: snippets,
    evidenceTruncated: Boolean(document?.truncated) || clipped.truncated,
    model: response.model,
    usage: response.usage,
    answers: response.answers,
  };
}
