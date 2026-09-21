import { describe, expect, it } from "vitest";
import { ingestDocument, truncateToBudget } from "../src/core/ingest.js";
import { ChatJevError, MAX_STATE_CHARS } from "../src/core/types.js";
import { fixture } from "./helpers.js";

describe("ingest", () => {
  it("builds a document context from extracted text", async () => {
    const document = await ingestDocument({
      buffer: fixture("nicotine-heart.txt"),
      filename: "nicotine-heart.txt",
      mimeType: "text/plain",
    });

    expect(document.filename).toBe("nicotine-heart.txt");
    expect(document.truncated).toBe(false);
    expect(document.charCount).toBe(document.text.length);
    expect(document.text).toContain("pooled relative risk");
  });

  it("flags truncation when text exceeds the Jev state budget", () => {
    const long = "abcd".repeat(MAX_STATE_CHARS);
    const clipped = truncateToBudget(long);
    expect(clipped.truncated).toBe(true);
    expect(clipped.text).toHaveLength(MAX_STATE_CHARS);
  });

  it("rejects oversized uploads", async () => {
    await expect(
      ingestDocument(
        {
          buffer: Buffer.from("tiny"),
          filename: "tiny.txt",
          mimeType: "text/plain",
        },
        { maxBytes: 2 },
      ),
    ).rejects.toMatchObject({
      status: 413,
      code: "file_too_large",
    });
  });

  it("rejects empty extracted text", async () => {
    await expect(
      ingestDocument({
        buffer: Buffer.from("   "),
        filename: "empty.txt",
        mimeType: "text/plain",
      }),
    ).rejects.toBeInstanceOf(ChatJevError);
  });
});
