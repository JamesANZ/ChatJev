import { compileEvaluation } from "./compile";
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

const OPEN_ENDED = /\b(summarize|explain|rewrite|what does it say)\b/i;

export function createHeuristicLlm(): LlmClient {
  return {
    async gather() {
      return [];
    },
    async compile(input) {
      if (OPEN_ENDED.test(input.question)) return [];
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
