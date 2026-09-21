import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  choiceAnswer,
  FakeJevClient,
  noulAnswer,
  scoreAnswer,
} from "../src/core/jev-client";
import {
  STRENGTH_CRITERIA,
  type JevRequest,
  type JevResponse,
} from "../src/core/types";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

export function fixture(name: string): Buffer {
  return readFileSync(join(fixturesDir, name));
}

export const MEDICAL_QUESTION =
  "does this medical document strongly suggest a correlation between nicotine and heart disease?";

const STRENGTH_LEGEND = Object.fromEntries(
  STRENGTH_CRITERIA.map((label, index) => [String(index), label]),
);

export function judgmentClassification(noul = 0.92): JevResponse {
  return {
    model: "jev-test",
    usage: { input_tokens: 40, output_tokens: 8 },
    answers: {
      is_judgment: noulAnswer(noul),
      kind: choiceAnswer(
        "judgment",
        { judgment: 0.94, open_ended: 0.06 },
        0.91,
      ),
    },
  };
}

export function openEndedClassification(): JevResponse {
  return {
    model: "jev-test",
    usage: { input_tokens: 36, output_tokens: 8 },
    answers: {
      is_judgment: noulAnswer(0.12),
      kind: choiceAnswer(
        "open_ended",
        { judgment: 0.08, open_ended: 0.92 },
        0.88,
      ),
    },
  };
}

export function medicalEvaluation(): JevResponse {
  return {
    model: "jev-test",
    usage: { input_tokens: 220, output_tokens: 18 },
    answers: {
      proposition: noulAnswer(0.9),
      relation: choiceAnswer(
        "supported",
        { supported: 0.84, contradicted: 0.06, not_mentioned: 0.1 },
        0.82,
      ),
      strength: scoreAnswer(
        3,
        STRENGTH_LEGEND,
        { "0": 0.02, "1": 0.06, "2": 0.18, "3": 0.74 },
        0.8,
      ),
    },
  };
}

export function scriptedJev(
  classify: JevResponse,
  evaluate?: JevResponse,
): FakeJevClient {
  return new FakeJevClient((request: JevRequest) => {
    if (
      "user_question" in (request.state as object) &&
      !("document" in (request.state as object))
    ) {
      return classify;
    }
    if (!evaluate) {
      throw new Error("Unexpected evaluation call");
    }
    return evaluate;
  });
}
