import { requireChoice, requireNoul } from "./jev-client";
import {
  JUDGMENT_NOUL_THRESHOLD,
  type Classification,
  type JevClient,
  type QuestionKind,
} from "./types";

export const CLASSIFY_IS_JUDGMENT =
  "Is the user asking whether the attached document supports, contradicts, or is silent on a specific claim or proposition?";

export const CLASSIFY_KIND = "What kind of request is this user question?";

export const CLASSIFY_KIND_CRITERIA = {
  judgment:
    "A closed question that can be judged as yes/no, supported/contradicted/not mentioned, or scored against the document.",
  open_ended:
    "A request to summarize, explain, rewrite, extract free-form text, or otherwise generate prose.",
} as const;

export type JudgmentDecision = "closed" | "uncertain" | "open";

export function decideJudgment(
  kind: QuestionKind,
  noul: number,
): JudgmentDecision {
  if (kind !== "judgment") return "open";
  if (noul >= JUDGMENT_NOUL_THRESHOLD) return "closed";
  return "uncertain";
}

export function isClosedJudgment(
  classification: Pick<Classification, "kind" | "noul">,
): boolean {
  return decideJudgment(classification.kind, classification.noul) === "closed";
}

export async function classifyQuestion(
  client: JevClient,
  question: string,
): Promise<Classification> {
  const response = await client.evaluate({
    state: { user_question: question },
    questions: {
      is_judgment: {
        type: "noul",
        instructions: CLASSIFY_IS_JUDGMENT,
      },
      kind: {
        type: "choice",
        instructions: CLASSIFY_KIND,
        criteria: { ...CLASSIFY_KIND_CRITERIA },
      },
    },
  });

  const noul = requireNoul(response.answers.is_judgment, "is_judgment");
  const kind = requireChoice<QuestionKind>(response.answers.kind, "kind");

  return {
    decision: decideJudgment(kind.choice, noul),
    kind: kind.choice,
    noul,
    model: response.model,
    usage: response.usage,
  };
}
