import { describe, expect, it } from "vitest";
import { askDocument } from "../src/core/ask";
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
    if (result.kind === "verdict") {
      expect(result.verdict.leaning).toBe("yes");
      expect(result.verdict.relation).toBe("supported");
    }
  });

  it("refuses summarize prompts", async () => {
    const document = await ingestDocument({
      buffer: fixture("nicotine-heart.txt"),
      filename: "nicotine-heart.txt",
      mimeType: "text/plain",
    });
    const result = await askDocument(
      createDemoJevClient(),
      document,
      "summarize this",
    );
    expect(result.kind).toBe("refusal");
  });
});
