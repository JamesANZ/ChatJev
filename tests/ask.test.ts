import { describe, expect, it } from "vitest";
import { askDocument } from "../src/core/ask";
import { ingestDocument } from "../src/core/ingest";
import {
  fixture,
  judgmentClassification,
  MEDICAL_QUESTION,
  medicalEvaluation,
  openEndedClassification,
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
    const result = await askDocument(client, document, MEDICAL_QUESTION);

    expect(result.kind).toBe("verdict");
    if (result.kind === "verdict") {
      expect(result.verdict.noul).toBe(0.9);
      expect(result.verdict.relation).toBe("supported");
    }
    expect(client.calls).toHaveLength(2);
    expect(client.calls[1]?.questions.proposition).toMatchObject({
      instructions: MEDICAL_QUESTION,
    });
  });

  it("returns a refusal without evaluating the document", async () => {
    const document = await ingestDocument({
      buffer: fixture("nicotine-heart.txt"),
      filename: "nicotine-heart.txt",
      mimeType: "text/plain",
    });
    const client = scriptedJev(openEndedClassification());
    const result = await askDocument(client, document, "summarize this");
    expect(result.kind).toBe("refusal");
    expect(client.calls).toHaveLength(1);
  });
});
