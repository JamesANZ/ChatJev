import { describe, expect, it } from "vitest";
import {
  classifyQuestion,
  decideJudgment,
  isClosedJudgment,
} from "../src/core/classify";
import {
  MEDICAL_QUESTION,
  openEndedClassification,
  scriptedJev,
} from "./helpers";

describe("classifyQuestion", () => {
  it("accepts a closed judgment about the attached document", async () => {
    const client = scriptedJev({
      model: "jev-test",
      usage: { input_tokens: 10, output_tokens: 2 },
      answers: {
        is_judgment: { type: "noul", noul: 0.93 },
        kind: {
          type: "choice",
          choice: "judgment",
          probabilities: { judgment: 0.93, open_ended: 0.07 },
          confidence: 0.9,
        },
      },
    });

    const result = await classifyQuestion(client, MEDICAL_QUESTION);
    expect(result.kind).toBe("judgment");
    expect(result.decision).toBe("closed");
    expect(result.decision).toBe(decideJudgment(result.kind, result.noul));
    expect(isClosedJudgment(result)).toBe(true);
    expect(client.calls[0]?.state).toEqual({ user_question: MEDICAL_QUESTION });
  });

  it("rejects summarize and rewrite prompts", async () => {
    const client = scriptedJev(openEndedClassification());

    for (const question of [
      "summarize this",
      "rewrite this in plain English",
    ]) {
      const result = await classifyQuestion(client, question);
      expect(result.kind).toBe("open_ended");
      expect(result.decision).toBe("open");
      expect(isClosedJudgment(result)).toBe(false);
    }
  });

  it("rejects a judgment-shaped choice when the noul is below the threshold", async () => {
    const client = scriptedJev({
      model: "jev-test",
      usage: { input_tokens: 10, output_tokens: 2 },
      answers: {
        is_judgment: { type: "noul", noul: 0.41 },
        kind: {
          type: "choice",
          choice: "judgment",
          probabilities: { judgment: 0.55, open_ended: 0.45 },
          confidence: 0.5,
        },
      },
    });

    const result = await classifyQuestion(client, "is this interesting?");
    expect(result.decision).toBe("uncertain");
    expect(isClosedJudgment(result)).toBe(false);
  });

  it("treats the threshold as closed and anything under it as uncertain", () => {
    expect(decideJudgment("judgment", 0.6)).toBe("closed");
    expect(decideJudgment("judgment", 0.59)).toBe("uncertain");
    expect(decideJudgment("open_ended", 0.99)).toBe("open");
  });
});
