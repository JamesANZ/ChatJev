import { describe, expect, it } from "vitest";
import { askDocument } from "../src/core/ask";
import { ingestDocument } from "../src/core/ingest";
import { FORMULATION_ATTEMPTS, type LlmClient } from "../src/core/llm";
import {
  createDemoJevClient,
  FakeJevClient,
  noulAnswer,
} from "../src/core/jev-client";
import {
  ChatJevError,
  type JevAnswer,
  type QuestionDraft,
  type SourceSnippet,
} from "../src/core/types";
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
    expect(
      String((client.calls[0]?.state as { sources?: string }).sources),
    ).toContain("https://example.com/heart");
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
    const result = await askDocument(
      client,
      document,
      MEDICAL_QUESTION,
      llm({
        drafts: [
          {
            key: "claim",
            type: "noul",
            instructions: "The document links nicotine and heart disease.",
          },
        ],
        narration: "This is only 12% settled.",
      }),
    );

    expect(result.kind).toBe("verdict");
    if (result.kind !== "verdict") return;
    expect(result.narration).toBeNull();
    expect(result.message).toContain("90%");
    expect(result.message).not.toContain("12%");
  });

  it("repairs a sloppy question list and scores it once", async () => {
    const document = await ingestDocument({
      buffer: fixture("nicotine-heart.txt"),
      filename: "nicotine-heart.txt",
      mimeType: "text/plain",
    });
    const client = new FakeJevClient((request) => ({
      model: "jev-test",
      usage: { input_tokens: 8, output_tokens: 2 },
      answers: Object.fromEntries(
        Object.keys(request.questions).map((key) => [key, noulAnswer(0.8)]),
      ),
    }));
    let compiles = 0;
    const result = await askDocument(
      client,
      document,
      "Is this about flights?",
      {
        async gather() {
          return [];
        },
        async compile() {
          compiles += 1;
          return [
            {
              key: "Bad Key",
              type: "noul",
              instructions: "The document is about flights. ".repeat(40),
            },
          ];
        },
        async narrate(input) {
          return input.lines.join(" ");
        },
      },
    );

    expect(compiles).toBe(1);
    expect(client.calls).toHaveLength(1);
    const repaired = client.calls[0]?.questions.bad_key;
    expect(repaired?.type).toBe("noul");
    expect(repaired?.instructions.length).toBeLessThanOrEqual(400);
    expect(
      repaired?.instructions.startsWith("The document is about flights."),
    ).toBe(true);
    expect(result.kind).toBe("verdict");
    if (result.kind !== "verdict") return;
    expect(result.message).toContain("80%");
  });

  it("tries another formulation when Jev cannot score the first one", async () => {
    const document = await ingestDocument({
      buffer: fixture("nicotine-heart.txt"),
      filename: "nicotine-heart.txt",
      mimeType: "text/plain",
    });
    const seen: string[] = [];
    const client = new FakeJevClient((request) => {
      const answers: Record<string, JevAnswer> = request.questions.claim
        ? { claim: noulAnswer(0.66) }
        : {};
      return {
        model: "jev-test",
        usage: { input_tokens: 10, output_tokens: 2 },
        answers,
      };
    });
    const result = await askDocument(
      client,
      document,
      "Is this about flights?",
      {
        async gather() {
          return [];
        },
        async compile(input) {
          seen.push(input.strategy ?? "");
          if ((input.attempt ?? 0) === 0) {
            return [
              {
                key: "topic",
                type: "noul",
                instructions: "The document is about flights.",
              },
            ];
          }
          expect(input.feedback).toMatch(/did not return/i);
          expect(input.strategy).toBe("proposition");
          return [
            {
              key: "claim",
              type: "noul",
              instructions: "The document is about flights.",
            },
          ];
        },
        async narrate() {
          return "";
        },
      },
    );

    expect(seen).toEqual(["match", "proposition"]);
    expect(client.calls).toHaveLength(2);
    expect(result.kind).toBe("verdict");
    if (result.kind !== "verdict") return;
    expect(result.message).toContain("66%");
    expect(result.message.toLowerCase()).toContain("flights");
  });

  it("retries when the model returns unreadable output", async () => {
    const document = await ingestDocument({
      buffer: fixture("nicotine-heart.txt"),
      filename: "nicotine-heart.txt",
      mimeType: "text/plain",
    });
    let compiles = 0;
    const client = new FakeJevClient(() => ({
      model: "jev-test",
      usage: { input_tokens: 4, output_tokens: 1 },
      answers: { claim: noulAnswer(0.7) },
    }));
    const result = await askDocument(client, document, MEDICAL_QUESTION, {
      async gather() {
        return [];
      },
      async compile() {
        compiles += 1;
        if (compiles === 1) {
          throw new ChatJevError(
            502,
            "llm_error",
            "The model did not return a JSON object.",
          );
        }
        return [
          {
            key: "claim",
            type: "noul",
            instructions: "The document links nicotine and heart disease.",
          },
        ];
      },
      async narrate() {
        return "";
      },
    });

    expect(compiles).toBe(2);
    expect(client.calls).toHaveLength(1);
    expect(result.kind).toBe("verdict");
  });

  it("stops when Jev or the model cannot be called", async () => {
    const document = await ingestDocument({
      buffer: fixture("nicotine-heart.txt"),
      filename: "nicotine-heart.txt",
      mimeType: "text/plain",
    });
    let compiles = 0;
    const missing = new FakeJevClient(() => {
      throw new ChatJevError(
        503,
        "missing_api_key",
        "TYPESAFE_API_KEY is not set.",
      );
    });
    await expect(
      askDocument(missing, document, "Is this about flights?", {
        async gather() {
          return [];
        },
        async compile() {
          compiles += 1;
          return [
            {
              key: "claim",
              type: "noul",
              instructions: "The document is about flights.",
            },
          ];
        },
        async narrate() {
          return "";
        },
      }),
    ).rejects.toMatchObject({ code: "missing_api_key" });
    expect(compiles).toBe(1);
    expect(missing.calls).toHaveLength(1);

    compiles = 0;
    await expect(
      askDocument(
        new FakeJevClient(() => {
          throw new Error("unused");
        }),
        document,
        MEDICAL_QUESTION,
        {
          async gather() {
            return [];
          },
          async compile() {
            compiles += 1;
            throw new ChatJevError(
              503,
              "llm_error",
              "The model is unavailable.",
            );
          },
          async narrate() {
            return "";
          },
        },
      ),
    ).rejects.toMatchObject({ code: "llm_error" });
    expect(compiles).toBe(1);
  });

  it("falls back to an exam after every formulation comes back empty", async () => {
    const document = await ingestDocument({
      buffer: fixture("nicotine-heart.txt"),
      filename: "nicotine-heart.txt",
      mimeType: "text/plain",
    });
    let compiles = 0;
    const model: LlmClient = {
      async gather() {
        return [];
      },
      async compile(input) {
        compiles += 1;
        expect(input.attempt).toBe(compiles - 1);
        if (compiles > 1) {
          expect(input.feedback).toMatch(/empty list/i);
        }
        return [];
      },
      async narrate() {
        return "";
      },
    };
    const result = await askDocument(
      createDemoJevClient(),
      document,
      "summarize this",
      model,
    );
    expect(compiles).toBe(FORMULATION_ATTEMPTS);
    expect(result.kind).toBe("verdict");
    if (result.kind !== "verdict") return;
    expect(result.judgments[0]?.type).toBe("choice");
    expect(result.message).toMatch(/74%/);
    expect(result.message.toLowerCase()).toContain("nicotine");
  });

  it("keeps earlier turns with a follow-up in the same chat", async () => {
    const history = [
      {
        role: "user" as const,
        text: "Will the coalition win the Victoria state election in 2027?",
      },
      { role: "assistant" as const, text: "Jev puts that at 62% yes." },
    ];
    const client = new FakeJevClient((request) => {
      const state = request.state as { chat?: string; user_question?: string };
      expect(state.user_question).toBe("Can Labor win?");
      expect(state.chat).toContain("Victoria state election in 2027");
      expect(state.chat).toContain("62% yes");
      return {
        model: "jev-test",
        usage: { input_tokens: 12, output_tokens: 2 },
        answers: { claim: noulAnswer(0.4) },
      };
    });
    const result = await askDocument(
      client,
      null,
      "Can Labor win?",
      {
        async gather(input) {
          expect(input.history).toEqual(history);
          expect(input.question).toBe("Can Labor win?");
          return [SOURCE];
        },
        async compile(input) {
          expect(input.history?.[0]?.text).toContain("coalition");
          return [
            {
              key: "claim",
              type: "noul",
              instructions:
                "Labor can win the Victoria state election in 2027.",
            },
          ];
        },
        async narrate(input) {
          expect(input.history).toHaveLength(2);
          return "Jev puts Labor winning that election at 40% yes.";
        },
      },
      history,
    );
    expect(result.kind).toBe("verdict");
    if (result.kind !== "verdict") return;
    expect(result.question).toBe("Can Labor win?");
    expect(result.message).toContain("40%");
  });
});
