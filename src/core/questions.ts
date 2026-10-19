import { truncateToBudget } from "./ingest";
import {
  MAX_STATE_CHARS,
  UNSURE_HIGH,
  UNSURE_LOW,
  type JevAnswer,
  type JevQuestion,
  type JudgmentView,
  type Leaning,
  type QuestionDraft,
} from "./types";

const MAX_QUESTIONS = 5;
const MAX_INSTRUCTION = 400;
const MAX_LABEL = 80;
const KEY_PATTERN = /^[a-z][a-z0-9_]{0,40}$/;

export type QuestionValidation =
  | { ok: true; questions: Record<string, JevQuestion> }
  | { ok: false; error: string };

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function leaningFromNoul(noul: number): Leaning {
  if (noul >= UNSURE_HIGH) return "yes";
  if (noul <= UNSURE_LOW) return "no";
  return "unsure";
}

function cleanLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const label = value.trim();
  if (!label || label.length > MAX_LABEL) return null;
  return label;
}

export function validateQuestions(drafts: QuestionDraft[]): QuestionValidation {
  if (drafts.length > MAX_QUESTIONS) {
    return { ok: false, error: `Use at most ${MAX_QUESTIONS} questions.` };
  }

  const questions: Record<string, JevQuestion> = {};

  for (const draft of drafts) {
    if (!KEY_PATTERN.test(draft.key)) {
      return {
        ok: false,
        error: `Question key "${draft.key}" must be a short identifier.`,
      };
    }
    if (questions[draft.key]) {
      return { ok: false, error: `Question key "${draft.key}" is duplicated.` };
    }

    const instructions = draft.instructions.trim();
    if (!instructions || instructions.length > MAX_INSTRUCTION) {
      return {
        ok: false,
        error: `Instructions for "${draft.key}" must be 1–${MAX_INSTRUCTION} characters.`,
      };
    }

    if (draft.type === "noul") {
      const question: JevQuestion = { type: "noul", instructions };
      if (draft.criteria && typeof draft.criteria === "object") {
        const criteria = draft.criteria as { true?: unknown; false?: unknown };
        const yes = cleanLabel(criteria.true);
        const no = cleanLabel(criteria.false);
        if (yes && no) question.criteria = { true: yes, false: no };
      }
      questions[draft.key] = question;
      continue;
    }

    if (draft.type === "choice") {
      if (
        !draft.criteria ||
        typeof draft.criteria !== "object" ||
        Array.isArray(draft.criteria)
      ) {
        return {
          ok: false,
          error: `Choice "${draft.key}" needs 2–6 labels.`,
        };
      }
      const criteria: Record<string, string> = {};
      for (const [key, value] of Object.entries(draft.criteria)) {
        if (!KEY_PATTERN.test(key)) {
          return {
            ok: false,
            error: `Choice label "${key}" must be a short identifier.`,
          };
        }
        const label = cleanLabel(value);
        if (!label) {
          return {
            ok: false,
            error: `Choice "${draft.key}" has an empty label.`,
          };
        }
        criteria[key] = label;
      }
      const count = Object.keys(criteria).length;
      if (count < 2 || count > 6) {
        return {
          ok: false,
          error: `Choice "${draft.key}" needs 2–6 labels.`,
        };
      }
      questions[draft.key] = { type: "choice", instructions, criteria };
      continue;
    }

    if (draft.type === "score") {
      if (!Array.isArray(draft.criteria)) {
        return {
          ok: false,
          error: `Score "${draft.key}" needs 2–6 ordered labels.`,
        };
      }
      const criteria = draft.criteria.map(cleanLabel);
      if (
        criteria.length < 2 ||
        criteria.length > 6 ||
        criteria.some((label) => !label)
      ) {
        return {
          ok: false,
          error: `Score "${draft.key}" needs 2–6 ordered labels.`,
        };
      }
      questions[draft.key] = {
        type: "score",
        instructions,
        criteria: criteria as string[],
      };
      continue;
    }

    return { ok: false, error: `Unknown question type for "${draft.key}".` };
  }

  return { ok: true, questions };
}

export function clipEvidence(
  document: string,
  sources: string,
  maxChars = MAX_STATE_CHARS,
): { document: string; sources: string; truncated: boolean } {
  if (!sources) {
    const clipped = truncateToBudget(document, maxChars);
    return {
      document: clipped.text,
      sources: "",
      truncated: clipped.truncated,
    };
  }
  if (!document) {
    const clipped = truncateToBudget(sources, maxChars);
    return {
      document: "",
      sources: clipped.text,
      truncated: clipped.truncated,
    };
  }

  const sourceReserve = Math.min(sources.length, Math.floor(maxChars * 0.35));
  const docClip = truncateToBudget(document, maxChars - sourceReserve);
  const srcClip = truncateToBudget(sources, maxChars - docClip.text.length);
  return {
    document: docClip.text,
    sources: srcClip.text,
    truncated: docClip.truncated || srcClip.truncated,
  };
}

export function viewJudgment(
  key: string,
  question: JevQuestion,
  answer: JevAnswer | undefined,
): JudgmentView {
  if (!answer || answer.type !== question.type) {
    throw new Error(`Jev did not return a ${question.type} answer for "${key}".`);
  }

  if (answer.type === "noul") {
    const leaning = leaningFromNoul(answer.noul);
    return {
      key,
      instructions: question.instructions,
      type: "noul",
      leaning,
      noul: answer.noul,
      line: `Jev puts “${question.instructions}” at ${percent(answer.noul)} yes (${leaning}).`,
    };
  }

  if (answer.type === "choice") {
    return {
      key,
      instructions: question.instructions,
      type: "choice",
      choice: answer.choice,
      confidence: answer.confidence,
      line: `Jev chooses ${answer.choice} for “${question.instructions}” (${percent(answer.confidence)} confidence).`,
    };
  }

  const max = question.type === "score" ? question.criteria.length - 1 : 0;
  const index = Math.min(max, Math.max(0, Math.round(answer.score)));
  const label =
    answer.legend[String(index)] ??
    (question.type === "score" ? question.criteria[index] : "") ??
    "";
  return {
    key,
    instructions: question.instructions,
    type: "score",
    score: answer.score,
    scoreMax: max,
    label,
    confidence: answer.confidence,
    line: `Jev scores “${question.instructions}” as ${label} (${answer.score.toFixed(1)} / ${max}).`,
  };
}

export function allowedPercents(
  answers: Record<string, JevAnswer>,
): Set<number> {
  const allowed = new Set<number>();
  for (const answer of Object.values(answers)) {
    if (answer.type === "noul") {
      allowed.add(Math.round(answer.noul * 100));
      allowed.add(Math.round((1 - answer.noul) * 100));
    } else {
      allowed.add(Math.round(answer.confidence * 100));
      for (const value of Object.values(answer.probabilities)) {
        allowed.add(Math.round(value * 100));
      }
    }
  }
  return allowed;
}

export function narrationKeepsPercents(
  message: string,
  allowed: Set<number>,
): boolean {
  const found = [...message.matchAll(/(\d{1,3}(?:\.\d+)?)\s*%/g)].map((match) =>
    Math.round(Number(match[1])),
  );
  return found.every((value) => allowed.has(value));
}
