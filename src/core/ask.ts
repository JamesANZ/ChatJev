import { classifyQuestion, isClosedJudgment } from "./classify";
import { compileEvaluation } from "./compile";
import {
  formatVerdict,
  formatVerdictMessage,
  REFUSAL_MESSAGE,
} from "./verdict";
import type { AskResult, DocumentContext, JevClient } from "./types";

export async function askDocument(
  client: JevClient,
  document: DocumentContext,
  question: string,
): Promise<AskResult> {
  const trimmed = question.trim();
  if (!trimmed) {
    return {
      kind: "refusal",
      question,
      message: "Ask a closed question about the attached document.",
    };
  }

  const classification = await classifyQuestion(client, trimmed);
  if (!isClosedJudgment(classification)) {
    return {
      kind: "refusal",
      question: trimmed,
      message: REFUSAL_MESSAGE,
    };
  }

  const request = compileEvaluation(document.filename, document.text, trimmed);
  const response = await client.evaluate(request);
  const verdict = formatVerdict(trimmed, response.answers);

  return {
    kind: "verdict",
    question: trimmed,
    message: formatVerdictMessage(verdict),
    verdict,
    model: response.model,
    usage: response.usage,
    answers: response.answers,
  };
}
