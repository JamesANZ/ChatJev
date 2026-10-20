import { needsWebEvidence } from "./evidence";
import { examDrafts } from "./exam";
import { MODEL_FALLBACK_WARNING, SEARCH_MISSED_WARNING } from "./setup";
import {
  createHeuristicLlm,
  FORMULATION_ATTEMPTS,
  formulationStrategy,
  type LlmClient,
} from "./llm";
import {
  allowedPercents,
  clipEvidence,
  narrationKeepsPercents,
  repairDrafts,
  validateQuestions,
  viewJudgment,
} from "./questions";
import { formatSources } from "./snippets";
import {
  ChatJevError,
  type AskResult,
  type DocumentContext,
  type JevClient,
  type JevQuestion,
  type SourceSnippet,
} from "./types";

function retryableFormulationError(error: unknown): boolean {
  if (!(error instanceof ChatJevError)) return true;
  if (
    error.code === "missing_api_key" ||
    error.code === "missing_llm_key" ||
    error.status === 401 ||
    error.status === 403
  ) {
    return false;
  }
  if (
    /timeout|unavailable|rate limit|too many requests|overloaded|econn|fetch failed|network/i.test(
      error.message,
    )
  ) {
    return false;
  }
  return error.code === "jev_error" || error.code === "llm_error";
}

function failureNote(reason: string, attempt: number): string {
  const next = formulationStrategy(attempt + 1);
  const clean = reason.replace(/\s+/g, " ").trim().slice(0, 280);
  return `${clean} Reformulate with a different shape (${next}).`;
}

function refusalMessage(error: unknown): string {
  const detail =
    error instanceof Error ? error.message.replace(/\s+/g, " ").trim() : "";
  if (!detail) {
    return "Jev could not score a formulation of that question. Try asking it a different way.";
  }
  return `Jev could not score a formulation of that question. ${detail}`.slice(
    0,
    400,
  );
}

async function finishVerdict(input: {
  client: JevClient;
  llm: LlmClient;
  document: DocumentContext | null;
  trimmed: string;
  clipped: { document: string; sources: string; truncated: boolean };
  questions: Record<string, JevQuestion>;
  snippets: SourceSnippet[];
  imageReading?: string;
  warning?: string;
}): Promise<AskResult> {
  const response = await input.client.evaluate({
    state: {
      filename: input.document?.filename ?? "",
      document: input.clipped.document,
      sources: input.clipped.sources,
      user_question: input.trimmed,
    },
    image: input.document?.image
      ? {
          format: input.document.image.format,
          dataBase64: input.document.image.dataBase64,
        }
      : undefined,
    questions: input.questions,
  });

  const judgments = Object.entries(input.questions).map(([key, item]) =>
    viewJudgment(key, item, response.answers[key]),
  );
  const fallback = judgments.map((item) => item.line).join(" ");

  let narration: string | null = null;
  try {
    const reading = (
      await input.llm.narrate({
        question: input.trimmed,
        lines: judgments.map((item) => item.line),
        sources: input.snippets,
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
    question: input.trimmed,
    message: narration ?? fallback,
    narration,
    judgments,
    sources: input.snippets,
    imageReading: input.imageReading,
    evidenceTruncated:
      Boolean(input.document?.truncated) || input.clipped.truncated,
    model: response.model,
    usage: response.usage,
    answers: response.answers,
    warning: input.warning,
  };
}

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

  const imageAttached = Boolean(document?.image);
  let evidence = document;
  let imageReading: string | undefined;
  let visionWarning: string | undefined;
  if (document?.image && llm.describeImage) {
    try {
      const reading = (
        await llm.describeImage({
          filename: document.filename,
          question: trimmed,
          image: document.image,
        })
      ).trim();
      if (reading) {
        imageReading = reading;
        evidence = {
          ...document,
          text: `Vision-model reading of ${document.filename}. This description is not the picture. The picture is \`photo\`.\n\n${reading}`,
        };
      }
    } catch (error) {
      if (
        error instanceof ChatJevError &&
        (error.code === "missing_llm_key" ||
          error.status === 401 ||
          error.status === 403)
      ) {
        throw error;
      }
      visionWarning =
        "The vision model could not read this image, so the questions were written without a description of it. Jev still received the picture.";
    }
  }
  const snippets = await llm.gather({
    question: trimmed,
    filename: evidence?.filename,
    document: evidence?.text,
    image: imageAttached,
  });

  if (!document && snippets.length === 0) {
    throw new ChatJevError(
      400,
      "missing_evidence",
      "ChatJev could not find web evidence for that question. Check the search key, or attach a document.",
    );
  }

  const clipped = clipEvidence(evidence?.text ?? "", formatSources(snippets));
  const webNeeded = needsWebEvidence(trimmed, evidence?.text, {
    image: imageAttached,
  });
  const searchWarning =
    webNeeded && snippets.length === 0 ? SEARCH_MISSED_WARNING : undefined;
  const askWarning = [visionWarning, searchWarning].filter(Boolean).join(" ");
  let feedback: string | undefined;
  let lastError: unknown;

  for (let attempt = 0; attempt < FORMULATION_ATTEMPTS; attempt += 1) {
    const strategy = formulationStrategy(attempt);
    let drafts;
    try {
      drafts = await llm.compile({
        question: trimmed,
        filename: evidence?.filename ?? "",
        document: clipped.document,
        sourcesText: clipped.sources,
        feedback,
        attempt,
        strategy,
        image: imageAttached,
      });
    } catch (error) {
      if (!retryableFormulationError(error)) throw error;
      lastError = error;
      feedback = failureNote(
        error instanceof Error
          ? error.message
          : "The question list was not valid.",
        attempt,
      );
      continue;
    }

    const validated = validateQuestions(
      repairDrafts(Array.isArray(drafts) ? drafts : [], {
        fallbackInstructions: trimmed,
      }),
    );
    if (!validated.ok || Object.keys(validated.questions).length === 0) {
      feedback = failureNote(
        validated.ok
          ? "Return at least one closed question. An empty list cannot be scored."
          : validated.error,
        attempt,
      );
      continue;
    }

    try {
      return await finishVerdict({
        client,
        llm,
        document: evidence,
        trimmed,
        clipped,
        questions: validated.questions,
        snippets,
        imageReading,
        warning: askWarning || undefined,
      });
    } catch (error) {
      if (!retryableFormulationError(error)) throw error;
      lastError = error;
      feedback = failureNote(
        error instanceof Error
          ? error.message
          : "Jev could not score that formulation.",
        attempt,
      );
    }
  }

  const fallback = validateQuestions(
    repairDrafts(
      examDrafts({
        question: trimmed,
        document: clipped.document,
        sourcesText: clipped.sources,
      }),
      { fallbackInstructions: trimmed },
    ),
  );
  if (fallback.ok && Object.keys(fallback.questions).length > 0) {
    try {
      return await finishVerdict({
        client,
        llm,
        document: evidence,
        trimmed,
        clipped,
        questions: fallback.questions,
        snippets,
        imageReading,
        warning: [MODEL_FALLBACK_WARNING, askWarning].filter(Boolean).join(" "),
      });
    } catch (error) {
      if (!retryableFormulationError(error)) throw error;
      lastError = error;
    }
  }

  return {
    kind: "refusal",
    question: trimmed,
    message: refusalMessage(lastError),
  };
}
