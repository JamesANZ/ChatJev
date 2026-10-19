import { ABSTAIN_TEXT } from "./exam";
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

type LooseDraft = {
  key?: unknown;
  type?: unknown;
  instructions?: unknown;
  criteria?: unknown;
};

const CHOICE_KEYS = ["a", "b", "c", "d", "e", "f"] as const;

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function clipText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  const sliced = cleaned.slice(0, max - 1);
  const boundary = sliced.lastIndexOf(" ");
  const base = (
    boundary >= Math.floor(max * 0.6) ? sliced.slice(0, boundary) : sliced
  ).trim();
  return `${base}…`.slice(0, max);
}

function slugKey(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[^a-z]+/, "")
    .slice(0, 41);
  return KEY_PATTERN.test(slug) ? slug : "";
}

function uniqueKey(raw: unknown, used: Set<string>, fallback: string): string {
  const base = slugKey(typeof raw === "string" ? raw : "") || fallback;
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  for (let index = 2; index < 30; index += 1) {
    const suffix = `_${index}`;
    const candidate = `${base.slice(0, 41 - suffix.length)}${suffix}`;
    if (KEY_PATTERN.test(candidate) && !used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  return base;
}

function normalizeType(
  draft: LooseDraft,
): "noul" | "choice" | "score" | null {
  const raw = String(draft.type ?? "")
    .toLowerCase()
    .replace(/[^a-z]+/g, "");
  if (["noul", "boolean", "yesno", "proposition", "claim"].includes(raw)) {
    return "noul";
  }
  if (["choice", "select", "exam", "multiplechoice"].includes(raw)) {
    return "choice";
  }
  if (["score", "rating", "scale"].includes(raw)) return "score";
  if (Array.isArray(draft.criteria) && typeof draft.criteria[0] === "string") {
    return "score";
  }
  if (draft.criteria && typeof draft.criteria === "object") return "choice";
  if (typeof draft.instructions === "string" && draft.instructions.trim()) {
    return "noul";
  }
  return null;
}

function choiceEntries(criteria: unknown): Array<[string, string]> {
  if (Array.isArray(criteria)) {
    return criteria.map((item, index) => {
      if (typeof item === "string") return [`option_${index + 1}`, item];
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        const key = typeof record.key === "string" ? record.key : "";
        const label =
          typeof record.label === "string"
            ? record.label
            : typeof record.text === "string"
              ? record.text
              : "";
        return [key || `option_${index + 1}`, label];
      }
      return ["", ""];
    });
  }
  if (criteria && typeof criteria === "object") {
    return Object.entries(criteria).map(([key, value]) => [
      key,
      typeof value === "string" ? value : "",
    ]);
  }
  return [];
}

function repairChoice(
  draft: LooseDraft,
  instructions: string,
  used: Set<string>,
): QuestionDraft | null {
  const built: Array<[string, string]> = [];
  const local = new Set<string>();
  for (const [rawKey, rawLabel] of choiceEntries(draft.criteria)) {
    const label = clipText(rawLabel, MAX_LABEL);
    if (!label) continue;
    let option = slugKey(rawKey);
    if (!option || local.has(option)) {
      option = CHOICE_KEYS.find((key) => !local.has(key)) ?? "";
    }
    if (!option || local.has(option)) continue;
    local.add(option);
    built.push([option, label]);
  }

  let selected = built;
  if (selected.length > 6) {
    const abstain = selected.find(([key]) => key === "abstain");
    const rest = selected
      .filter(([key]) => key !== "abstain")
      .slice(0, abstain ? 5 : 6);
    selected = abstain ? [...rest, abstain] : rest;
  }
  if (selected.length === 1 && selected[0]?.[0] !== "abstain") {
    selected = [...selected, ["abstain", ABSTAIN_TEXT]];
  }
  if (selected.length < 2) return null;

  return {
    key: uniqueKey(draft.key, used, "answer"),
    type: "choice",
    instructions,
    criteria: Object.fromEntries(selected),
  };
}

function scoreLabels(criteria: unknown): string[] {
  if (Array.isArray(criteria)) {
    return criteria.map((item) => (typeof item === "string" ? item : ""));
  }
  if (criteria && typeof criteria === "object") {
    return Object.values(criteria).map((item) =>
      typeof item === "string" ? item : "",
    );
  }
  return [];
}

function repairScore(
  draft: LooseDraft,
  instructions: string,
  used: Set<string>,
): QuestionDraft | null {
  const criteria = scoreLabels(draft.criteria)
    .map((label) => clipText(label, MAX_LABEL))
    .filter(Boolean)
    .slice(0, 6);
  if (criteria.length < 2) return null;
  return {
    key: uniqueKey(draft.key, used, "rating"),
    type: "score",
    instructions,
    criteria,
  };
}

function noulCriteria(
  criteria: unknown,
): { true: string; false: string } | undefined {
  if (!criteria || typeof criteria !== "object" || Array.isArray(criteria)) {
    return undefined;
  }
  const record = criteria as Record<string, unknown>;
  const yes = clipText(record.true ?? record.True ?? record.yes, MAX_LABEL);
  const no = clipText(record.false ?? record.False ?? record.no, MAX_LABEL);
  if (!yes || !no) return undefined;
  return { true: yes, false: no };
}

function repairOne(
  draft: LooseDraft,
  fallbackInstructions: string,
  used: Set<string>,
): QuestionDraft | null {
  const type = normalizeType(draft);
  if (!type) return null;
  const instructions = clipText(
    typeof draft.instructions === "string" && draft.instructions.trim()
      ? draft.instructions
      : fallbackInstructions,
    MAX_INSTRUCTION,
  );
  if (!instructions) return null;
  if (type === "choice") return repairChoice(draft, instructions, used);
  if (type === "score") return repairScore(draft, instructions, used);

  const criteria = noulCriteria(draft.criteria);
  const question: QuestionDraft = {
    key: uniqueKey(draft.key, used, "claim"),
    type: "noul",
    instructions,
  };
  if (criteria) question.criteria = criteria;
  return question;
}

export function repairDrafts(
  drafts: readonly LooseDraft[],
  options?: { fallbackInstructions?: string },
): QuestionDraft[] {
  const fallback = clipText(
    options?.fallbackInstructions ?? "Judge the attached evidence.",
    MAX_INSTRUCTION,
  );
  const used = new Set<string>();
  const repaired: QuestionDraft[] = [];
  for (const draft of drafts.slice(0, 20)) {
    if (repaired.length >= MAX_QUESTIONS) break;
    if (!draft || typeof draft !== "object" || Array.isArray(draft)) continue;
    const next = repairOne(draft, fallback, used);
    if (next) repaired.push(next);
  }
  return repaired;
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

  if (answer.type === "choice" && question.type === "choice") {
    const label = question.criteria[answer.choice] ?? answer.choice;
    const probability =
      answer.probabilities[answer.choice] ?? answer.confidence;
    const runnerUp = Object.entries(answer.probabilities)
      .filter(([option]) => option !== answer.choice)
      .sort((left, right) => right[1] - left[1])[0];
    const silent =
      answer.choice === "abstain" ||
      /does not contain enough information/i.test(label);
    const split = Boolean(
      runnerUp && probability - runnerUp[1] < 0.12 && !silent,
    );
    const other = runnerUp
      ? (question.criteria[runnerUp[0]] ?? runnerUp[0])
      : "";
    const line = silent
      ? `Jev thinks the evidence is silent on “${question.instructions}” with a ${percent(probability)} probability.`
      : split
        ? `Jev is split on “${question.instructions}”: “${label}” (${percent(probability)}) or “${other}” (${percent(runnerUp?.[1] ?? 0)}).`
        : probability >= UNSURE_HIGH
          ? `Jev thinks “${label}” with a ${percent(probability)} probability.`
          : `Jev leans toward “${label}” with a ${percent(probability)} probability.`;
    return {
      key,
      instructions: question.instructions,
      type: "choice",
      choice: answer.choice,
      confidence: probability,
      leaning: silent || split || probability < UNSURE_HIGH ? "unsure" : "yes",
      label,
      line,
    };
  }

  if (answer.type !== "score" || question.type !== "score") {
    throw new Error(`Jev did not return a score answer for "${key}".`);
  }

  const max = question.criteria.length - 1;
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
