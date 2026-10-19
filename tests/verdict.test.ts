import { describe, expect, it } from "vitest";
import { nicotineExam } from "./helpers";
import {
  formatExamVerdict,
  formatVerdict,
  formatVerdictMessage,
} from "../src/core/verdict";
import { STRENGTH_CRITERIA } from "../src/core/types";
import { MEDICAL_QUESTION } from "./helpers";

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

  it("reads a confident exam choice as a sentence", () => {
    const verdict = formatExamVerdict(
      "What is this about?",
      nicotineExam(),
      {
        choice: "a",
        probabilities: { a: 0.74, b: 0.16, abstain: 0.1 },
        confidence: 0.8,
      },
    );

    expect(verdict.mode).toBe("exam");
    expect(verdict.leaning).toBe("yes");
    expect(verdict.headline).toBe(
      "Jev thinks “The document reviews cohort studies linking nicotine exposure with heart disease.” with a 74% probability.",
    );
    expect(formatVerdictMessage(verdict)).toContain("Also possible");
    expect(verdict.options[0]?.key).toBe("a");
  });

  it("says the document is silent when abstain wins", () => {
    const verdict = formatExamVerdict("What is the patient's name?", nicotineExam(), {
      choice: "abstain",
      probabilities: { a: 0.2, b: 0.14, abstain: 0.66 },
      confidence: 0.7,
    });

    expect(verdict.abstain).toBe(true);
    expect(verdict.leaning).toBe("unsure");
    expect(verdict.headline).toContain("silent");
    expect(verdict.headline).toContain("66%");
    expect(verdict.headline).toContain("What is the patient's name?");
  });

  it("names both leaders when the exam is a close call", () => {
    const verdict = formatExamVerdict("What is this about?", nicotineExam(), {
      choice: "a",
      probabilities: { a: 0.42, b: 0.36, abstain: 0.22 },
      confidence: 0.4,
    });

    expect(verdict.split).toBe(true);
    expect(verdict.leaning).toBe("unsure");
    expect(verdict.headline).toContain("split");
    expect(verdict.headline).toContain("42%");
    expect(verdict.headline).toContain("36%");
    expect(verdict.headline).not.toContain("Also possible");
  });
});
