import { describe, expect, it } from "vitest";
import { askDocument } from "../src/core/ask";
import { createHeuristicExamDesigner } from "../src/core/exam-designer";
import { createDemoJevClient } from "../src/core/jev-client";
import { ingestDocument } from "../src/core/ingest";
import { fixture, MEDICAL_QUESTION } from "./helpers";

describe("createDemoJevClient", () => {
  it("answers the medical fixture as a supported yes", async () => {
    const document = await ingestDocument({
      buffer: fixture("nicotine-heart.txt"),
      filename: "nicotine-heart.txt",
      mimeType: "text/plain",
    });
    const result = await askDocument(
      createDemoJevClient(),
      document,
      MEDICAL_QUESTION,
    );
    expect(result.kind).toBe("verdict");
    if (result.kind === "verdict" && result.verdict.mode === "judgment") {
      expect(result.verdict.leaning).toBe("yes");
      expect(result.verdict.relation).toBe("supported");
    }
  });

  it("answers summarize prompts as a sentence about the document", async () => {
    const document = await ingestDocument({
      buffer: fixture("nicotine-heart.txt"),
      filename: "nicotine-heart.txt",
      mimeType: "text/plain",
    });
    const result = await askDocument(
      createDemoJevClient(),
      document,
      "summarize this",
      createHeuristicExamDesigner(),
    );
    expect(result.kind).toBe("verdict");
    if (result.kind === "verdict" && result.verdict.mode === "exam") {
      expect(result.message).toMatch(/74%/);
      expect(result.message.toLowerCase()).toContain("nicotine");
      expect(result.examModel).toBe("heuristic");
    }
  });

  it("says the document is silent when the question is not covered", async () => {
    const document = await ingestDocument({
      buffer: fixture("nicotine-heart.txt"),
      filename: "nicotine-heart.txt",
      mimeType: "text/plain",
    });
    const result = await askDocument(
      createDemoJevClient(),
      document,
      "What is the patient's name?",
      createHeuristicExamDesigner(),
    );
    expect(result.kind).toBe("verdict");
    if (result.kind === "verdict") {
      expect(result.verdict.mode).toBe("exam");
      expect(result.message).toMatch(/silent/i);
    }
  });
});
