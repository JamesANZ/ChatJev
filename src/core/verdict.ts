import { requireChoice, requireNoul, requireScore } from "./jev-client.js";
import {
  STRENGTH_CRITERIA,
  UNSURE_HIGH,
  UNSURE_LOW,
  type JevAnswer,
  type Leaning,
  type Relation,
  type Verdict,
} from "./types.js";

export const REFUSAL_MESSAGE =
  "Jev cannot summarize, explain, or rewrite a document. Ask whether the attached document supports, contradicts, or is silent on a specific claim.";

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

export function formatVerdictMessage(verdict: Verdict): string {
  return [verdict.headline, ...verdict.details].join(" ");
}
