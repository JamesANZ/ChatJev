import { describe, expect, it } from "vitest";
import { createDemoJevClient } from "../src/core/jev-client";
import { ingestDocument } from "../src/core/ingest";
import type { LlmClient } from "../src/core/llm";
import { handleAsk, handleUpload } from "../src/lib/http";
import {
  fixture,
  judgmentClassification,
  MEDICAL_QUESTION,
  medicalEvaluation,
  scriptedJev,
} from "./helpers";

async function attach(filename: string, buffer: Buffer, type = "text/plain") {
  const form = new FormData();
  form.append("file", new File([new Uint8Array(buffer)], filename, { type }));
  return handleUpload(
    new Request("http://localhost/api/sessions", {
      method: "POST",
      body: form,
    }),
  );
}

describe("HTTP routes", () => {
  it("attaches a document then answers the medical fixture question", async () => {
    const created = await attach(
      "nicotine-heart.txt",
      fixture("nicotine-heart.txt"),
    );
    expect(created.status).toBe(201);
    const document = (await created.json()) as {
      filename: string;
      text: string;
      truncated: boolean;
    };
    expect(document.truncated).toBe(false);
    expect(document.text).toContain("nicotine");

    const asked = await handleAsk(
      new Request("http://localhost/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: MEDICAL_QUESTION, document }),
      }),
      scriptedJev(judgmentClassification(), medicalEvaluation()),
    );
    expect(asked.status).toBe(200);
    const body = (await asked.json()) as {
      kind: string;
      message: string;
      judgments: Array<{ key: string; noul?: number; choice?: string }>;
    };
    expect(body.kind).toBe("verdict");
    expect(
      body.judgments.find((item) => item.key === "proposition")?.noul,
    ).toBe(0.9);
    expect(body.judgments.find((item) => item.key === "relation")?.choice).toBe(
      "supported",
    );
    expect(body.message).toContain("90%");
    expect(body.message).toContain(MEDICAL_QUESTION);
  });

  it("answers open-ended asks as a sentence after a document is attached", async () => {
    const created = await attach(
      "nicotine-heart.txt",
      fixture("nicotine-heart.txt"),
    );
    const document = await created.json();

    const asked = await handleAsk(
      new Request("http://localhost/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: "What is this about?", document }),
      }),
      createDemoJevClient(),
    );
    const body = (await asked.json()) as { kind: string; message: string };
    expect(asked.status).toBe(200);
    expect(body.kind).toBe("verdict");
    expect(body.message).toMatch(/74%/);
    expect(body.message.toLowerCase()).toContain("nicotine");
  });

  it("returns 400 when asking without a document", async () => {
    const asked = await handleAsk(
      new Request("http://localhost/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: MEDICAL_QUESTION }),
      }),
      scriptedJev(judgmentClassification()),
    );
    expect(asked.status).toBe(400);
  });

  it("passes earlier chat turns through to the next question", async () => {
    let seen: unknown;
    const model: LlmClient = {
      async gather(input) {
        seen = input.history;
        return [
          {
            title: "Victorian poll",
            url: "https://example.com/poll",
            excerpt:
              "The 2027 Victorian election is contested by Labor and the Coalition.",
          },
        ];
      },
      async compile() {
        return [
          {
            key: "claim",
            type: "noul",
            instructions: "Labor can win the Victoria state election in 2027.",
          },
        ];
      },
      async narrate() {
        return "Jev puts that at 40% yes.";
      },
    };
    const asked = await handleAsk(
      new Request("http://localhost/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: "Can Labor win?",
          history: [
            {
              role: "user",
              text: "Will the coalition win the Victoria state election in 2027?",
            },
            { role: "assistant", text: "Jev puts that at 62% yes." },
            { role: "system", text: "drop me" },
            { role: "user", text: "   " },
          ],
        }),
      }),
      createDemoJevClient(),
      model,
    );
    expect(asked.status).toBe(200);
    expect(seen).toEqual([
      {
        role: "user",
        text: "Will the coalition win the Victoria state election in 2027?",
      },
      { role: "assistant", text: "Jev puts that at 62% yes." },
    ]);
  });

  it("rejects unsupported and oversized uploads", async () => {
    const png = await attach(
      "scan.png",
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      "image/png",
    );
    expect(png.status).toBe(422);
    const body = (await png.json()) as { code?: string };
    expect(body.code).toBe("invalid_image");

    const huge = await ingestDocument(
      {
        buffer: fixture("nicotine-heart.txt"),
        filename: "nicotine-heart.txt",
        mimeType: "text/plain",
      },
      { maxBytes: 1 },
    ).catch((error: { status: number }) => error);
    expect(huge).toMatchObject({ status: 413 });
  });
});
