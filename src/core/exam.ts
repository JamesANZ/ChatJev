import type { QuestionDraft } from "./types";

export const ABSTAIN_TEXT =
  "The evidence does not contain enough information to answer.";

const CLOSED_START =
  /^(is|are|was|were|do|does|did|can|could|should|has|have|had|will|would)\b/i;
const OPEN_PHRASE =
  /\b(summarize|summarise|explain|rewrite|describe this|what is this|what's this|what does (this|it) say)\b/i;

export function shouldAnswerAsExam(question: string): boolean {
  const trimmed = question.trim();
  if (!trimmed) return false;
  if (OPEN_PHRASE.test(trimmed)) return true;
  if (CLOSED_START.test(trimmed)) return false;
  return /^(what|who|whom|whose|when|where|why|how|which|list|extract|tell)\b/i.test(
    trimmed,
  );
}

export function isOverviewQuestion(question: string): boolean {
  return /^(what is this|what's this|summarize|summarise|summary|explain this|describe this|rewrite this)\b/i.test(
    question.trim(),
  );
}

function clipLabel(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 80) return cleaned;
  const sliced = cleaned.slice(0, 77);
  const boundary = sliced.lastIndexOf(" ");
  const base = (boundary > 40 ? sliced.slice(0, boundary) : sliced).trim();
  return `${base}…`.slice(0, 80);
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
    .filter((sentence) => sentence.length >= 40)
    .map(clipLabel);
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3);
}

export function examDrafts(input: {
  question: string;
  document: string;
  sourcesText: string;
}): QuestionDraft[] {
  const evidence = `${input.document}\n${input.sourcesText}`.trim();
  const overview = isOverviewQuestion(input.question);
  const wanted = new Set(tokens(input.question));
  const ranked = sentences(evidence).sort((left, right) => {
    if (overview) return right.length - left.length;
    const score = (sentence: string) =>
      tokens(sentence).filter((word) => wanted.has(word)).length;
    return score(right) - score(left) || right.length - left.length;
  });

  const chosen: string[] = [];
  for (const sentence of ranked) {
    if (chosen.some((existing) => existing.toLowerCase() === sentence.toLowerCase())) {
      continue;
    }
    chosen.push(sentence);
    if (chosen.length === 3) break;
  }

  const lead = sentences(evidence)[0];
  if (overview && lead) {
    const index = chosen.findIndex(
      (sentence) => sentence.toLowerCase() === lead.toLowerCase(),
    );
    if (index > 0) {
      const [match] = chosen.splice(index, 1);
      if (match) chosen.unshift(match);
    } else if (index === -1) {
      chosen.unshift(lead);
    }
  }

  const labels = chosen.slice(0, 3);
  if (labels.length < 2) {
    labels.push(
      clipLabel("The evidence states a specific claim that answers the question."),
    );
  }
  if (labels.length < 2) {
    labels.push(clipLabel("The evidence is about a different subject."));
  }

  const criteria: Record<string, string> = {};
  labels.slice(0, 3).forEach((label, index) => {
    criteria[["a", "b", "c"][index] ?? "a"] = label;
  });
  criteria.abstain = ABSTAIN_TEXT;

  return [
    {
      key: "answer",
      type: "choice",
      instructions: input.question.trim().slice(0, 400),
      criteria,
    },
  ];
}
