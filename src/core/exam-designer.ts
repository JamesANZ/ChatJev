import {
  ABSTAIN_TEXT,
  buildExamPrompt,
  examDraftSchema,
  isOverviewQuestion,
  normalizeExam,
  type Exam,
  type ExamOption,
} from "./exam";
import { ChatJevError } from "./types";

export const DEFAULT_EXAM_MODEL = "openai/gpt-5.4-mini";
export const GATEWAY_HELP =
  "Open questions need AI Gateway access. Set AI_GATEWAY_API_KEY, or deploy on Vercel so the function can use its OIDC token.";

export type ExamDesignInput = {
  question: string;
  filename: string;
  text: string;
};

export type DesignedExam = Exam & {
  model: string;
};

export interface ExamDesigner {
  design(input: ExamDesignInput): Promise<DesignedExam>;
}

export type ExamGenerator = (prompt: string, model: string) => Promise<unknown>;

const STOP_WORDS = new Set([
  "this",
  "that",
  "with",
  "from",
  "about",
  "what",
  "does",
  "document",
  "please",
  "would",
  "could",
  "should",
  "there",
  "their",
  "which",
  "when",
  "where",
  "have",
  "been",
  "were",
  "into",
  "your",
  "they",
  "them",
  "than",
  "then",
  "also",
  "only",
  "such",
  "more",
  "most",
  "some",
  "very",
  "using",
  "based",
]);

function contentTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3 && !STOP_WORDS.has(word));
}

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) =>
      sentence
        .replace(/^\s*(abstract|summary|introduction)\b[:.\s-]*/i, "")
        .trim(),
    )
    .filter((sentence) => sentence.length >= 40);
}

function overlap(sentence: string, words: Set<string>): number {
  return contentTokens(sentence).filter((word) => words.has(word)).length;
}

function jaccard(left: string, right: string): number {
  const a = new Set(contentTokens(left));
  const b = new Set(contentTokens(right));
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / (a.size + b.size - shared);
}

function asSentence(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  const bounded =
    trimmed.length > 210 ? `${trimmed.slice(0, 200).trim()}…` : trimmed;
  if (/[.!?…]$/.test(bounded)) return bounded;
  return `${bounded}.`;
}

function draftExam(input: ExamDesignInput): { options: ExamOption[] } {
  const overview = isOverviewQuestion(input.question);
  const questionWords = new Set(contentTokens(input.question));
  const parts = sentences(input.text);
  const ranked = [...parts].sort((left, right) => {
    if (overview) return right.length - left.length;
    return (
      overlap(right, questionWords) - overlap(left, questionWords) ||
      right.length - left.length
    );
  });

  const chosen: string[] = [];
  for (const sentence of ranked) {
    if (chosen.some((existing) => jaccard(existing, sentence) > 0.72)) {
      continue;
    }
    chosen.push(sentence);
    if (chosen.length === 3) break;
  }

  const lead = parts[0];
  if (overview && lead) {
    const index = chosen.findIndex((sentence) => jaccard(sentence, lead) > 0.72);
    if (index > 0) {
      const [match] = chosen.splice(index, 1);
      if (match) chosen.unshift(match);
    } else if (index === -1) {
      chosen.unshift(lead);
    }
  }

  const options: ExamOption[] = chosen.slice(0, 3).map((sentence, index) => ({
    key: ["a", "b", "c"][index] ?? "a",
    text: asSentence(sentence),
    abstain: false,
  }));

  if (options.length < 2) {
    options.push({
      key: options.length === 0 ? "a" : "b",
      text: "The document answers the question with a specific claim of its own.",
      abstain: false,
    });
  }
  if (options.length < 2) {
    options.push({
      key: "b",
      text: "The document is about a different subject than the question assumes.",
      abstain: false,
    });
  }

  options.push({ key: "abstain", text: ABSTAIN_TEXT, abstain: true });
  return { options };
}

export function createHeuristicExamDesigner(): ExamDesigner {
  return {
    async design(input) {
      return { ...normalizeExam(draftExam(input)), model: "heuristic" };
    },
  };
}

export function examModelId(): string {
  return process.env.AI_GATEWAY_MODEL?.trim() || DEFAULT_EXAM_MODEL;
}

function gatewayConfigured(): boolean {
  return Boolean(
    process.env.AI_GATEWAY_API_KEY?.trim() ||
      process.env.VERCEL_OIDC_TOKEN?.trim(),
  );
}

function toExamError(error: unknown): ChatJevError {
  if (error instanceof ChatJevError) return error;
  const message = error instanceof Error ? error.message : "";
  if (/api key|authentication|unauthorized|oidc/i.test(message)) {
    return new ChatJevError(503, "missing_gateway_key", GATEWAY_HELP);
  }
  return new ChatJevError(
    502,
    "exam_design_failed",
    "Could not turn that question into a multiple-choice exam.",
  );
}

async function generateExamDraft(
  prompt: string,
  model: string,
): Promise<unknown> {
  if (!gatewayConfigured()) {
    throw new ChatJevError(503, "missing_gateway_key", GATEWAY_HELP);
  }

  const { generateText, Output, APICallError } = await import("ai");
  try {
    const { output } = await generateText({
      model,
      output: Output.object({
        schema: examDraftSchema,
        name: "exam",
        description:
          "Mutually exclusive choices a document judge can score. Do not mark which choice is correct.",
      }),
      prompt,
      temperature: 0.2,
      maxOutputTokens: 900,
      reasoning: "low",
      timeout: 20_000,
    });
    return output;
  } catch (error) {
    if (
      APICallError.isInstance(error) &&
      (error.statusCode === 401 || error.statusCode === 403)
    ) {
      throw new ChatJevError(503, "missing_gateway_key", GATEWAY_HELP);
    }
    throw error;
  }
}

export function createLlmExamDesigner(
  options: { generate?: ExamGenerator; model?: string } = {},
): ExamDesigner {
  const generate = options.generate ?? generateExamDraft;
  const model = options.model ?? examModelId();
  return {
    async design(input) {
      try {
        const draft = await generate(buildExamPrompt(input), model);
        return { ...normalizeExam(draft), model };
      } catch (error) {
        throw toExamError(error);
      }
    },
  };
}
