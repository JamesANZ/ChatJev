import { classifyQuestion, isClosedJudgment } from "./classify";
import { compileEvaluation } from "./compile";
import { compileExam, shouldAnswerAsExam } from "./exam";
import type { ExamDesigner } from "./exam-designer";
import { requireChoice } from "./jev-client";
import type { AskResult, DocumentContext, JevClient } from "./types";
import { formatExamVerdict, formatVerdict, formatVerdictMessage } from "./verdict";

export async function askDocument(
  client: JevClient,
  document: DocumentContext,
  question: string,
  designer?: ExamDesigner,
): Promise<AskResult> {
  const trimmed = question.trim();
  if (!trimmed) {
    return {
      kind: "refusal",
      question,
      message: "Ask a question about the attached document.",
    };
  }

  if (!shouldAnswerAsExam(trimmed)) {
    const classification = await classifyQuestion(client, trimmed);
    if (isClosedJudgment(classification)) {
      const request = compileEvaluation(
        document.filename,
        document.text,
        trimmed,
      );
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
  }

  if (!designer) {
    throw new Error(
      "Open questions need an exam designer before Jev can score them.",
    );
  }

  const exam = await designer.design({
    question: trimmed,
    filename: document.filename,
    text: document.text,
  });
  const request = compileExam(
    document.filename,
    document.text,
    trimmed,
    exam,
  );
  const response = await client.evaluate(request);
  const choice = requireChoice(response.answers.answer, "answer");
  const verdict = formatExamVerdict(trimmed, exam, choice);

  return {
    kind: "verdict",
    question: trimmed,
    message: formatVerdictMessage(verdict),
    verdict,
    model: response.model,
    usage: response.usage,
    answers: response.answers,
    examModel: exam.model,
  };
}
