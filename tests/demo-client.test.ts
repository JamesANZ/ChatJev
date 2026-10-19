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
      expect(result.judgments.find((item) => item.key === "proposition")?.leaning).toBe(
        "yes",
      );
      expect(result.judgments.find((item) => item.key === "relation")?.choice).toBe(
        "supported",
      );
    }
  });

  it("answers a vague topic question instead of refusing it", async () => {
    const document = await ingestDocument({
      buffer: fixture("nicotine-heart.txt"),
      filename: "nicotine-heart.txt",
      mimeType: "text/plain",
    });
    const result = await askDocument(
      createDemoJevClient(),
      document,
      "Is this about flights?",
    );
    expect(result.kind).toBe("verdict");
    if (result.kind !== "verdict") return;
    expect(result.judgments).toHaveLength(1);
    expect(result.message).toContain("The document is about flights.");
    expect(result.message).toContain("15%");
    expect(result.message).not.toMatch(
      /cannot summarize|specific claim|could not turn/i,
    );
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
    );
    expect(result.kind).toBe("verdict");
    if (result.kind === "verdict") {
      expect(result.message).toMatch(/74%/);
      expect(result.message.toLowerCase()).toContain("nicotine");
    }
  });
});
