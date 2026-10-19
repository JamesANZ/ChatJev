import { describe, expect, it } from "vitest";
import { ABSTAIN_TEXT } from "../src/core/exam";
import { repairDrafts, validateQuestions } from "../src/core/questions";

describe("repairDrafts", () => {
  it("slugs keys and clips instructions before validation", () => {
    const repaired = repairDrafts(
      [
        {
          key: "Bad Key",
          type: "noul",
          instructions: "The document is about flights. ".repeat(40),
        },
      ],
      { fallbackInstructions: "Is this about flights?" },
    );
    const validated = validateQuestions(repaired);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    const question = validated.questions.bad_key;
    expect(question?.type).toBe("noul");
    expect(question?.instructions.length).toBeLessThanOrEqual(400);
    expect(
      question?.instructions.startsWith("The document is about flights."),
    ).toBe(true);
  });

  it("turns a single long choice label into a scorable exam", () => {
    const label = `The document is about scheduled passenger flights between cities. ${"extra ".repeat(20)}`;
    const repaired = repairDrafts(
      [
        {
          key: "Answer",
          type: "multiple-choice",
          instructions: "",
          criteria: { flights: label },
        },
      ],
      { fallbackInstructions: "Is this about flights?" },
    );
    const validated = validateQuestions(repaired);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    const question = validated.questions.answer;
    expect(question?.type).toBe("choice");
    if (question?.type !== "choice") return;
    expect(question.instructions).toBe("Is this about flights?");
    expect(question.criteria.flights?.length).toBeLessThanOrEqual(80);
    expect(question.criteria.abstain).toBe(ABSTAIN_TEXT);
  });

  it("keeps at most six labels and accepts a score written as words", () => {
    const repaired = repairDrafts([
      {
        key: "strength",
        type: "rating",
        instructions: "How strongly does the document mention flights?",
        criteria: [
          "None",
          "Weak",
          "Some",
          "Clear",
          "Strong",
          "Explicit",
          "Extra",
        ],
      },
      {
        key: "strength",
        type: "noul",
        instructions: "Duplicate key should be renamed.",
      },
    ]);
    const validated = validateQuestions(repaired);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    const score = validated.questions.strength;
    expect(score?.type).toBe("score");
    if (score?.type !== "score") return;
    expect(score.criteria).toHaveLength(6);
    expect(score.criteria).not.toContain("Extra");
    expect(validated.questions.strength_2?.type).toBe("noul");
  });

  it("accepts a boolean claim with yes and no labels", () => {
    const repaired = repairDrafts([
      {
        type: "boolean",
        instructions: "The document is about flights.",
        criteria: {
          yes: "It is about flights.",
          no: "It is not about flights.",
        },
      },
    ]);
    const validated = validateQuestions(repaired);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    const claim = validated.questions.claim;
    expect(claim?.type).toBe("noul");
    if (claim?.type !== "noul") return;
    expect(claim.criteria).toEqual({
      true: "It is about flights.",
      false: "It is not about flights.",
    });
  });
});
