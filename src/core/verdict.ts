import {
  EXAM_CONFIDENT,
  EXAM_SPLIT_GAP,
  type Exam,
} from "./exam";
import { requireChoice, requireNoul, requireScore } from "./jev-client";
import {
  STRENGTH_CRITERIA,
  UNSURE_HIGH,
  UNSURE_LOW,
  type ExamVerdict,
  type JevAnswer,
  type Leaning,
  type Relation,
  type Verdict,
} from "./types";

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function leaningFromNoul(noul: number): Leaning {
  if (noul >= UNSURE_HIGH) return "yes";
  if (noul <= UNSURE_LOW) return "no";
  return "unsure";
}

function strengthLabel(score: number, legend: Record<string, string>): string {
  const index = Math.min(
    STRENGTH_CRITERIA.length - 1,
    Math.max(0, Math.round(score)),
  );
  return (
    legend[String(index)] ?? STRENGTH_CRITERIA[index] ?? STRENGTH_CRITERIA[0]
  );
}

function headlineFor(question: string, noul: number, leaning: Leaning): string {
  const quoted = `“${question.trim()}”`;
  if (leaning === "unsure") {
    return `Jev is unsure (about ${percent(noul)}) about ${quoted}.`;
  }
  if (leaning === "yes") {
    return `Jev thinks yes with a ${percent(noul)} probability for ${quoted}.`;
  }
  return `Jev thinks no with a ${percent(1 - noul)} probability (yes-probability ${percent(noul)}) for ${quoted}.`;
}

function relationSentence(relation: Relation, confidence: number): string {
  const label =
    relation === "supported"
      ? "supports"
      : relation === "contradicted"
        ? "contradicts"
        : "does not mention";
  return `The document ${label} the proposition (confidence ${percent(confidence)}).`;
}

function strengthSentence(label: string, score: number, max: number): string {
  return `Evidence looks ${label.toLowerCase()} (score ${score.toFixed(1)} / ${max}).`;
}

export function formatVerdict(
  question: string,
  answers: Record<string, JevAnswer>,
): Verdict {
  const noul = requireNoul(answers.proposition, "proposition");
  const relation = requireChoice<Relation>(answers.relation, "relation");
  const strength = requireScore(answers.strength, "strength");
  const leaning = leaningFromNoul(noul);
  const strengthMax = STRENGTH_CRITERIA.length - 1;
  const label = strengthLabel(strength.score, strength.legend);

  const headline = headlineFor(question, noul, leaning);
  const details = [
    relationSentence(relation.choice, relation.confidence),
    strengthSentence(label, strength.score, strengthMax),
  ];

  return {
    mode: "judgment",
    headline,
    noul,
    leaning,
    relation: relation.choice,
    relationConfidence: relation.confidence,
    strengthLabel: label,
    strengthScore: strength.score,
    strengthMax,
    details,
  };
}

function examHeadline(
  question: string,
  selected: ExamVerdict["options"][number],
  runnerUp: ExamVerdict["options"][number] | undefined,
  split: boolean,
): string {
  const quoted = `“${question.trim()}”`;
  if (selected.abstain) {
    return `Jev thinks the document is silent on ${quoted} with a ${percent(selected.probability)} probability.`;
  }
  if (split && runnerUp) {
    return `Jev is split on ${quoted}: “${selected.text}” (${percent(selected.probability)}) or “${runnerUp.text}” (${percent(runnerUp.probability)}).`;
  }
  const verb =
    selected.probability >= EXAM_CONFIDENT ? "thinks" : "leans toward";
  return `Jev ${verb} “${selected.text}” with a ${percent(selected.probability)} probability.`;
}

export function formatExamVerdict(
  question: string,
  exam: Exam,
  answer: {
    choice: string;
    probabilities: Record<string, number>;
    confidence: number;
  },
): ExamVerdict {
  const options = exam.options.map((option) => ({
    key: option.key,
    text: option.text,
    abstain: option.abstain,
    probability: answer.probabilities[option.key] ?? 0,
  }));
  const selected = options.find((option) => option.key === answer.choice);
  if (!selected) {
    throw new Error(
      `Expected exam choice "${answer.choice}" to match a designed option`,
    );
  }

  const ranked = [...options].sort(
    (left, right) => right.probability - left.probability,
  );
  const runnerUp = ranked.find((option) => option.key !== selected.key);
  const split = Boolean(
    runnerUp &&
      selected.probability - runnerUp.probability < EXAM_SPLIT_GAP &&
      !selected.abstain,
  );
  const leaning: Leaning =
    selected.abstain || split || selected.probability < EXAM_CONFIDENT
      ? "unsure"
      : "yes";
  const mentioned = new Set([selected.key]);
  if (split && runnerUp) mentioned.add(runnerUp.key);

  return {
    mode: "exam",
    headline: examHeadline(question, selected, runnerUp, split),
    leaning,
    probability: selected.probability,
    selectedKey: selected.key,
    selectedText: selected.text,
    abstain: selected.abstain,
    split,
    options: ranked,
    details: ranked
      .filter((option) => !mentioned.has(option.key))
      .slice(0, 2)
      .map(
        (option) =>
          `Also possible: “${option.text}” (${percent(option.probability)}).`,
      ),
  };
}

export function formatVerdictMessage(verdict: Verdict): string {
  return [verdict.headline, ...verdict.details].join(" ");
}
