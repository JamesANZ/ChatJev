import { describe, expect, it } from "vitest";
import { judgmentMeter } from "../src/core/judgment-meter";
import { readChoice, viewJudgment } from "../src/core/questions";
import type { JudgmentView } from "../src/core/types";

describe("choice readings", () => {
  it("keeps silence, a split, a confident pick, and a lean exclusive", () => {
    expect(
      readChoice({
        choice: "abstain",
        label: "Not enough",
        probability: 0.7,
        runnerUp: { label: "Paris", probability: 0.65 },
      }).kind,
    ).toBe("silent");
    expect(
      readChoice({
        choice: "a",
        label: "The evidence does not contain enough information to answer.",
        probability: 0.8,
      }).kind,
    ).toBe("silent");
    expect(
      readChoice({
        choice: "paris",
        label: "Paris",
        probability: 0.52,
        runnerUp: { label: "Lyon", probability: 0.44 },
      }).kind,
    ).toBe("split");
    expect(
      readChoice({ choice: "paris", label: "Paris", probability: 0.81 }).kind,
    ).toBe("confident");
    expect(
      readChoice({ choice: "paris", label: "Paris", probability: 0.5 }).kind,
    ).toBe("leaning");
  });

  it("writes one sentence for the reading", () => {
    const view = viewJudgment(
      "answer",
      {
        type: "choice",
        instructions: "Which city?",
        criteria: { paris: "Paris", lyon: "Lyon" },
      },
      {
        type: "choice",
        choice: "paris",
        probabilities: { paris: 0.52, lyon: 0.44 },
        confidence: 0.52,
      },
    );
    expect(view.line).toContain("split");
    expect(view.leaning).toBe("unsure");
    expect(view.label).toBe("Paris");
  });
});

describe("judgment meter", () => {
  const noul: JudgmentView = {
    key: "claim",
    instructions: "Nicotine is a carcinogen.",
    type: "noul",
    line: "90%",
    leaning: "yes",
    noul: 0.9,
  };

  it("uses yes, no, or unsure for a noul", () => {
    expect(judgmentMeter([noul])).toEqual({
      kind: "noul",
      tone: "yes",
      percent: 90,
      caption: "Yes",
    });
    expect(
      judgmentMeter([{ ...noul, leaning: "no", noul: 0.1 }]),
    ).toMatchObject({ caption: "No", percent: 10, tone: "no" });
  });

  it("names a confident choice instead of calling it yes", () => {
    const choice: JudgmentView = {
      key: "answer",
      instructions: "Which city?",
      type: "choice",
      line: "Paris",
      leaning: "yes",
      confidence: 0.8,
      label: "Paris",
      choice: "paris",
    };
    expect(judgmentMeter([choice])).toEqual({
      kind: "choice",
      tone: "yes",
      percent: 80,
      caption: "Paris",
    });
    expect(
      judgmentMeter([{ ...choice, leaning: "unsure", label: "Paris" }]),
    ).toMatchObject({ caption: "Unsure", tone: "unsure" });
  });

  it("prefers the noul when a choice is also present", () => {
    expect(
      judgmentMeter([
        noul,
        {
          key: "relation",
          instructions: "Relation",
          type: "choice",
          line: "supports",
          leaning: "yes",
          confidence: 0.4,
          label: "Supports",
        },
      ]).kind,
    ).toBe("noul");
  });

  it("hides the meter when nothing was scored", () => {
    expect(
      judgmentMeter([
        {
          key: "rating",
          instructions: "Strength",
          type: "score",
          line: "strong",
        },
      ]),
    ).toEqual({ kind: "none" });
  });
});
