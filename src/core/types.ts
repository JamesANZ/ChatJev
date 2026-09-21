export const STATE_TOKEN_BUDGET = 32_000;
export const CHARS_PER_TOKEN = 4;
export const MAX_STATE_CHARS = STATE_TOKEN_BUDGET * CHARS_PER_TOKEN;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const JUDGMENT_NOUL_THRESHOLD = 0.6;
export const UNSURE_LOW = 0.4;
export const UNSURE_HIGH = 0.6;

export type DocumentContext = {
  id: string;
  filename: string;
  mimeType: string;
  text: string;
  charCount: number;
  truncated: boolean;
};

export type SessionSummary = {
  id: string;
  filename: string;
  mimeType: string;
  charCount: number;
  truncated: boolean;
};

export type Relation = "supported" | "contradicted" | "not_mentioned";
export type QuestionKind = "judgment" | "open_ended";
export type Leaning = "yes" | "no" | "unsure";

export type JevUsage = {
  input_tokens: number;
  output_tokens: number;
};

export type NoulAnswer = {
  type: "noul";
  noul: number;
};

export type ChoiceAnswer<T extends string = string> = {
  type: "choice";
  choice: T;
  probabilities: Record<string, number>;
  confidence: number;
};

export type ScoreAnswer = {
  type: "score";
  score: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
  confidence: number;
};

export type JevAnswer = NoulAnswer | ChoiceAnswer | ScoreAnswer;

export type NoulQuestion = {
  type: "noul";
  instructions: string;
  criteria?: { true: string; false: string };
};

export type ChoiceQuestion = {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
};

export type ScoreQuestion = {
  type: "score";
  instructions: string;
  criteria: string[];
};

export type JevQuestion = NoulQuestion | ChoiceQuestion | ScoreQuestion;

export type JevRequest = {
  state: unknown;
  questions: Record<string, JevQuestion>;
};

export type JevResponse = {
  model: string;
  answers: Record<string, JevAnswer>;
  usage: JevUsage;
};

export interface JevClient {
  evaluate(request: JevRequest): Promise<JevResponse>;
}

export type Classification = {
  isJudgment: boolean;
  kind: QuestionKind;
  noul: number;
  model: string;
  usage: JevUsage;
};

export const STRENGTH_CRITERIA = [
  "None or off-topic",
  "Indirect or weak",
  "Moderate, with gaps",
  "Strong and explicit",
] as const;

export type Verdict = {
  headline: string;
  noul: number;
  leaning: Leaning;
  relation: Relation;
  relationConfidence: number;
  strengthLabel: string;
  strengthScore: number;
  strengthMax: number;
  details: string[];
};

export type AskResult =
  | {
      kind: "verdict";
      question: string;
      message: string;
      verdict: Verdict;
      model: string;
      usage: JevUsage;
      answers: Record<string, JevAnswer>;
    }
  | {
      kind: "refusal";
      question: string;
      message: string;
    };

export class ChatJevError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ChatJevError";
    this.status = status;
    this.code = code;
  }
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}
