import { describe, expect, it } from "vitest";
import {
  formatVerdict,
  formatVerdictMessage,
  REFUSAL_MESSAGE,
} from "../src/core/verdict.js";
import { STRENGTH_CRITERIA } from "../src/core/types.js";
import { MEDICAL_QUESTION } from "./helpers.js";

const legend = Object.fromEntries(
  STRENGTH_CRITERIA.map((label, index) => [String(index), label]),
);

describe("formatVerdict", () => {
  it("writes yes-leaning copy for a high noul", () => {
    const verdict = formatVerdict(MEDICAL_QUESTION, {
      proposition: { type: "noul", noul: 0.9 },
      relation: {
        type: "choice",
        choice: "supported",
        probabilities: {
          supported: 0.8,
          contradicted: 0.1,
          not_mentioned: 0.1,
        },
        confidence: 0.82,
      },
      strength: {
        type: "score",
        score: 3,
        legend,
        probabilities: { "3": 1 },
        confidence: 0.8,
      },
    });

    expect(verdict.leaning).toBe("yes");
    expect(verdict.headline).toContain("yes");
    expect(verdict.headline).toContain("90%");
    expect(verdict.headline).toContain(MEDICAL_QUESTION);
    expect(formatVerdictMessage(verdict)).toContain("supports the proposition");
    expect(formatVerdictMessage(verdict)).toContain("strong and explicit");
  });

  it("writes no-leaning copy for a low noul", () => {
    const verdict = formatVerdict("is tea linked to insomnia?", {
      proposition: { type: "noul", noul: 0.1 },
      relation: {
        type: "choice",
        choice: "contradicted",
        probabilities: {
          supported: 0.1,
          contradicted: 0.8,
          not_mentioned: 0.1,
        },
        confidence: 0.77,
      },
      strength: {
        type: "score",
        score: 2.1,
        legend,
        probabilities: { "2": 1 },
        confidence: 0.7,
      },
    });

    expect(verdict.leaning).toBe("no");
    expect(verdict.headline).toContain("no");
    expect(verdict.headline).toContain("90%");
    expect(verdict.headline).toContain("10%");
    expect(verdict.details[1]).toContain("2.1 / 3");
  });

  it("writes unsure copy near 50%", () => {
    const verdict = formatVerdict("does the memo mention a 2025 launch?", {
      proposition: { type: "noul", noul: 0.5 },
      relation: {
        type: "choice",
        choice: "not_mentioned",
        probabilities: {
          supported: 0.2,
          contradicted: 0.2,
          not_mentioned: 0.6,
        },
        confidence: 0.51,
      },
      strength: {
        type: "score",
        score: 0.4,
        legend,
        probabilities: { "0": 1 },
        confidence: 0.4,
      },
    });

    expect(verdict.leaning).toBe("unsure");
    expect(verdict.headline).toMatch(/unsure \(about 50%\)/i);
  });

  it("keeps refusal copy deterministic", () => {
    expect(REFUSAL_MESSAGE).toMatch(/cannot summarize/i);
    expect(REFUSAL_MESSAGE).toMatch(/specific claim/i);
  });
});
