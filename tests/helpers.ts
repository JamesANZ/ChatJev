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
      route: choiceAnswer(
        "jev",
        { jev: 0.9, llm: 0.07, media: 0.03 },
        0.9,
      ),
      is_injection: noulAnswer(0.07),
      injection_kind: choiceAnswer(
        "clean",
        { clean: 0.93, injection: 0.04, jailbreak: 0.03 },
        0.9,
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
      route: choiceAnswer(
        "llm",
        { jev: 0.08, llm: 0.88, media: 0.04 },
        0.86,
      ),
      is_injection: noulAnswer(0.09),
      injection_kind: choiceAnswer(
        "clean",
        { clean: 0.9, injection: 0.06, jailbreak: 0.04 },
        0.84,
      ),
    },
  };
}

export function injectionClassification(): JevResponse {
  return {
    model: "jev-test",
    usage: { input_tokens: 30, output_tokens: 8 },
    answers: {
      is_judgment: noulAnswer(0.2),
      kind: choiceAnswer(
        "open_ended",
        { judgment: 0.2, open_ended: 0.8 },
        0.7,
      ),
      route: choiceAnswer(
        "llm",
        { jev: 0.1, llm: 0.8, media: 0.1 },
        0.7,
      ),
      is_injection: noulAnswer(0.93),
      injection_kind: choiceAnswer(
        "jailbreak",
        { clean: 0.04, injection: 0.18, jailbreak: 0.78 },
        0.88,
      ),
    },
  };
}

export function mediaClassification(): JevResponse {
  return {
    model: "jev-test",
    usage: { input_tokens: 28, output_tokens: 8 },
    answers: {
      is_judgment: noulAnswer(0.11),
      kind: choiceAnswer(
        "open_ended",
        { judgment: 0.1, open_ended: 0.9 },
        0.8,
      ),
      route: choiceAnswer(
        "media",
        { jev: 0.05, llm: 0.1, media: 0.85 },
        0.86,
      ),
      is_injection: noulAnswer(0.06),
      injection_kind: choiceAnswer(
        "clean",
        { clean: 0.94, injection: 0.04, jailbreak: 0.02 },
        0.9,
      ),
    },
  };
}

export function relevantPassages(count: number, noul = 0.82): JevResponse {
  const answers: JevResponse["answers"] = {};
  for (let i = 0; i < count; i += 1) {
    answers[`relevant_${i}`] = noulAnswer(noul);
    answers[`hostile_${i}`] = noulAnswer(0.07);
  }
  return {
    model: "jev-test",
    usage: { input_tokens: 50, output_tokens: 12 },
    answers,
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
  passages?: JevResponse,
): FakeJevClient {
  return new FakeJevClient((request: JevRequest) => {
    const keys = Object.keys(request.questions);
    if (keys.some((key) => key.startsWith("relevant_"))) {
      if (passages) return passages;
      const answers: JevResponse["answers"] = {};
      keys
        .filter((key) => key.startsWith("relevant_") || key.startsWith("hostile_"))
        .forEach((key) => {
          answers[key] = {
            type: "noul",
            noul: key.startsWith("hostile_") ? 0.08 : 0.8,
          };
        });
      return {
        model: "jev-test",
        usage: { input_tokens: 40, output_tokens: 8 },
        answers,
      };
    }
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
