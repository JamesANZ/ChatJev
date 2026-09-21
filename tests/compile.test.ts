import { describe, expect, it } from "vitest";
import { compileEvaluation, RELATION_CRITERIA } from "../src/core/compile";
import { STRENGTH_CRITERIA } from "../src/core/types";
import { MEDICAL_QUESTION } from "./helpers";

describe("compileEvaluation", () => {
  it("uses the user question as the noul instructions", () => {
    const request = compileEvaluation(
      "nicotine-heart.txt",
      "synthetic abstract",
      MEDICAL_QUESTION,
    );

    expect(request.state).toEqual({
      filename: "nicotine-heart.txt",
      document: "synthetic abstract",
      user_question: MEDICAL_QUESTION,
    });
    expect(request.questions.proposition).toEqual({
      type: "noul",
      instructions: MEDICAL_QUESTION,
    });
    expect(request.questions.relation).toMatchObject({
      type: "choice",
      criteria: RELATION_CRITERIA,
    });
    expect(request.questions.strength).toMatchObject({
      type: "score",
      criteria: [...STRENGTH_CRITERIA],
    });
  });
});
