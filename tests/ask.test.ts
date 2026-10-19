import { describe, expect, it } from "vitest";
import { askDocument } from "../src/core/ask";
import { ABSTAIN_TEXT } from "../src/core/exam";
import type { ExamDesigner } from "../src/core/exam-designer";
import { FakeJevClient } from "../src/core/jev-client";
import { ingestDocument } from "../src/core/ingest";
import {
  examEvaluation,
  fixture,
  judgmentClassification,
  MEDICAL_QUESTION,
  medicalEvaluation,
  nicotineExam,
  scriptedJev,
} from "./helpers";

describe("askDocument", () => {
  it("runs classify then evaluate for the nicotine fixture", async () => {
    const document = await ingestDocument({
      buffer: fixture("nicotine-heart.txt"),
      filename: "nicotine-heart.txt",
      mimeType: "text/plain",
    });
    const client = scriptedJev(judgmentClassification(), medicalEvaluation());
    let designs = 0;
    const designer: ExamDesigner = {
      async design() {
        designs += 1;
        throw new Error("Closed questions should not design an exam");
      },
    };
    const result = await askDocument(
      client,
      document,
      MEDICAL_QUESTION,
      designer,
    );

    expect(result.kind).toBe("verdict");
    if (result.kind === "verdict" && result.verdict.mode === "judgment") {
      expect(result.verdict.noul).toBe(0.9);
      expect(result.verdict.relation).toBe("supported");
    }
    expect(designs).toBe(0);
    expect(client.calls).toHaveLength(2);
    expect(client.calls[1]?.questions.proposition).toMatchObject({
      instructions: MEDICAL_QUESTION,
    });
  });

  it("answers an open question from the exam Jev scored", async () => {
    const document = await ingestDocument({
      buffer: fixture("nicotine-heart.txt"),
      filename: "nicotine-heart.txt",
      mimeType: "text/plain",
    });
    const exam = nicotineExam();
    const designer: ExamDesigner = {
      async design() {
        return { ...exam, model: "test-exam" };
      },
    };
    const client = new FakeJevClient(() => examEvaluation());
    const result = await askDocument(
      client,
      document,
      "What is this about?",
      designer,
    );

    expect(result.kind).toBe("verdict");
    if (result.kind === "verdict" && result.verdict.mode === "exam") {
      expect(result.verdict.selectedText).toContain("nicotine");
      expect(result.message).toContain("74%");
      expect(result.examModel).toBe("test-exam");
    }
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]?.questions.answer).toMatchObject({
      type: "choice",
      criteria: {
        a: exam.options[0]?.text,
        abstain: ABSTAIN_TEXT,
      },
    });
  });

  it("turns a low-confidence judgment into an exam instead of refusing", async () => {
    const document = await ingestDocument({
      buffer: fixture("nicotine-heart.txt"),
      filename: "nicotine-heart.txt",
      mimeType: "text/plain",
    });
    const designer: ExamDesigner = {
      async design() {
        return { ...nicotineExam(), model: "test-exam" };
      },
    };
    const client = scriptedJev(
      {
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
      },
      examEvaluation(),
    );
    const result = await askDocument(
      client,
      document,
      "is this interesting?",
      designer,
    );
    expect(result.kind).toBe("verdict");
    if (result.kind === "verdict") {
      expect(result.verdict.mode).toBe("exam");
    }
    expect(client.calls).toHaveLength(2);
  });
});
