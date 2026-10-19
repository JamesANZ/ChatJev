import { compileEvaluation } from "./compile";
import { examDrafts, shouldAnswerAsExam } from "./exam";
import type { QuestionDraft, SourceSnippet } from "./types";

export type GatherInput = {
  question: string;
  filename?: string;
  document?: string;
};

export type CompileInput = {
  question: string;
  filename: string;
  document: string;
  sourcesText: string;
  feedback?: string;
};

export type NarrateInput = {
  question: string;
  lines: string[];
  sources: SourceSnippet[];
};

export interface LlmClient {
  gather(input: GatherInput): Promise<SourceSnippet[]>;
  compile(input: CompileInput): Promise<QuestionDraft[]>;
  narrate(input: NarrateInput): Promise<string>;
}

export function createHeuristicLlm(): LlmClient {
  return {
    async gather() {
      return [];
    },
    async compile(input) {
      if (shouldAnswerAsExam(input.question)) return examDrafts(input);
      const request = compileEvaluation(
        input.filename || "evidence",
        input.document,
        input.question,
      );
      return Object.entries(request.questions).map(([key, question]) => ({
        key,
        type: question.type,
        instructions: question.instructions,
        criteria: "criteria" in question ? question.criteria : undefined,
      }));
    },
    async narrate(input) {
      return input.lines.join(" ");
    },
  };
}
