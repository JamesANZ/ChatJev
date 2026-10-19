import { compileEvaluation } from "./compile";
import { claimProposition, needsWebEvidence, webClaimDrafts } from "./evidence";
import {
  examDrafts,
  isTopicQuestion,
  shouldAnswerAsExam,
  topicProposition,
} from "./exam";
import type { QuestionDraft, SourceSnippet } from "./types";

export type GatherInput = {
  question: string;
  filename?: string;
  document?: string;
};

export const FORMULATION_ATTEMPTS = 4;

export const FORMULATION_STRATEGIES = [
  "match",
  "proposition",
  "exam",
  "simple",
] as const;

export type FormulationStrategy = (typeof FORMULATION_STRATEGIES)[number];

export function formulationStrategy(attempt: number): FormulationStrategy {
  const index = Math.min(
    Math.max(attempt, 0),
    FORMULATION_STRATEGIES.length - 1,
  );
  return FORMULATION_STRATEGIES[index] ?? "simple";
}

export function formulationGuidance(strategy: FormulationStrategy): string {
  switch (strategy) {
    case "match":
      return "Match the user's question. If it is a yes/no claim, including a vague topic question such as whether the document is about something, use one noul whose instructions restate that claim. Otherwise use one choice question whose labels are possible answers, including abstain when the evidence may not say.";
    case "proposition":
      return 'Ignore the previous shape. Write one noul. The instructions are a single proposition the evidence can support or contradict, at most 400 characters. For "Is this about flights?" the proposition is "The document is about flights."';
    case "exam":
      return "Ignore the previous shape. Write one choice question with key answer. Use 3 to 5 mutually exclusive labels of at most 80 characters, plus abstain for when the evidence does not contain enough information. Do not mark the correct label.";
    case "simple":
      return 'Use the smallest scorable question. One choice with keys a, b, and abstain. Labels are at most 80 characters: two concrete possibilities, plus "The evidence does not contain enough information to answer."';
  }
}

export type CompileInput = {
  question: string;
  filename: string;
  document: string;
  sourcesText: string;
  feedback?: string;
  attempt?: number;
  strategy?: FormulationStrategy;
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
      const strategy = input.strategy ?? "match";
      if (strategy === "exam" || strategy === "simple")
        return examDrafts(input);
      if (strategy === "proposition") {
        const instructions = isTopicQuestion(input.question)
          ? topicProposition(input.question)
          : needsWebEvidence(input.question, input.document)
            ? claimProposition(input.question)
            : input.question.trim().slice(0, 400);
        return [
          {
            key: "claim",
            type: "noul",
            instructions,
          },
        ];
      }
      if (isTopicQuestion(input.question)) {
        return [
          {
            key: "claim",
            type: "noul",
            instructions: topicProposition(input.question),
          },
        ];
      }
      if (needsWebEvidence(input.question, input.document)) {
        if (shouldAnswerAsExam(input.question)) return examDrafts(input);
        return webClaimDrafts(input.question);
      }
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
