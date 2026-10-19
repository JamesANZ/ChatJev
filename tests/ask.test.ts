import { describe, expect, it } from "vitest";
import { askDocument } from "../src/core/ask";
import { ingestDocument } from "../src/core/ingest";
import type { LlmClient } from "../src/core/llm";
import { createDemoJevClient, FakeJevClient, noulAnswer } from "../src/core/jev-client";
import type { QuestionDraft, SourceSnippet } from "../src/core/types";
import { fixture, MEDICAL_QUESTION } from "./helpers";

const SOURCE: SourceSnippet = {
  title: "Heart study",
  url: "https://example.com/heart",
  excerpt: "Nicotine exposure tracked with heart disease.",
};

function llm(options: {
  sources?: SourceSnippet[];
  drafts: QuestionDraft[] | QuestionDraft[][];
  narration?: string;
}): LlmClient {
  const rounds = Array.isArray(options.drafts[0])
    ? (options.drafts as QuestionDraft[][])
    : [options.drafts as QuestionDraft[]];
  let cursor = 0;
  return {
    async gather() {
      return options.sources ?? [];
    },
    async compile() {
      const next = rounds[Math.min(cursor, rounds.length - 1)] ?? [];
      cursor += 1;
      return next;
    },
    async narrate() {
      return options.narration ?? "";
    },
  };
}

describe("askDocument", () => {
  it("judges compiled questions and keeps search excerpts in state", async () => {
    const document = await ingestDocument({
      buffer: fixture("nicotine-heart.txt"),
      filename: "nicotine-heart.txt",
      mimeType: "text/plain",
    });
    const client = new FakeJevClient(() => ({
      model: "jev-test",
      usage: { input_tokens: 20, output_tokens: 4 },
      answers: { claim: noulAnswer(0.9) },
    }));
    const result = await askDocument(
      client,
      document,
      MEDICAL_QUESTION,
      llm({
        sources: [SOURCE],
        drafts: [
          {
            key: "claim",
            type: "noul",
            instructions: "The document links nicotine and heart disease.",
          },
        ],
        narration: "Jev thinks that link is likely, at 90% yes.",
      }),
    );

    expect(result.kind).toBe("verdict");
    if (result.kind !== "verdict") return;
    expect(result.judgments[0]?.noul).toBe(0.9);
    expect(result.narration).toContain("90%");
    expect(result.sources).toEqual([SOURCE]);
    expect(client.calls).toHaveLength(1);
    expect(String((client.calls[0]?.state as { sources?: string }).sources)).toContain(
      "https://example.com/heart",
    );
  });

  it("drops a narration that invents a percentage", async () => {
    const document = await ingestDocument({
      buffer: fixture("nicotine-heart.txt"),
      filename: "nicotine-heart.txt",
      mimeType: "text/plain",
    });
    const client = new FakeJevClient(() => ({
      model: "jev-test",
      usage: { input_tokens: 10, output_tokens: 2 },
      answers: { claim: noulAnswer(0.9) },
    }));
    const result = await askDocument(client, document, MEDICAL_QUESTION, llm({
      drafts: [
        {
          key: "claim",
          type: "noul",
          instructions: "The document links nicotine and heart disease.",
        },
      ],
      narration: "This is only 12% settled.",
    }));

    expect(result.kind).toBe("verdict");
    if (result.kind !== "verdict") return;
    expect(result.narration).toBeNull();
    expect(result.message).toContain("90%");
    expect(result.message).not.toContain("12%");
  });

  it("retries once when the first question list is invalid", async () => {
    const document = await ingestDocument({
      buffer: fixture("nicotine-heart.txt"),
      filename: "nicotine-heart.txt",
      mimeType: "text/plain",
    });
    const client = new FakeJevClient(() => ({
      model: "jev-test",
      usage: { input_tokens: 10, output_tokens: 2 },
      answers: { claim: noulAnswer(0.7) },
    }));
    const result = await askDocument(client, document, MEDICAL_QUESTION, llm({
      drafts: [
        [{ key: "Bad Key", type: "noul", instructions: "A claim." }],
        [
          {
            key: "claim",
            type: "noul",
            instructions: "The document links nicotine and heart disease.",
          },
        ],
      ],
      narration: "Jev leans yes at 70%.",
    }));

    expect(result.kind).toBe("verdict");
    expect(client.calls).toHaveLength(1);
  });

  it("turns an empty compiler result into a scored exam sentence", async () => {
    const document = await ingestDocument({
      buffer: fixture("nicotine-heart.txt"),
      filename: "nicotine-heart.txt",
      mimeType: "text/plain",
    });
    const result = await askDocument(
      createDemoJevClient(),
      document,
      "summarize this",
      llm({ drafts: [] }),
    );
    expect(result.kind).toBe("verdict");
    if (result.kind !== "verdict") return;
    expect(result.judgments[0]?.type).toBe("choice");
    expect(result.message).toMatch(/74%/);
    expect(result.message.toLowerCase()).toContain("nicotine");
  });
});
