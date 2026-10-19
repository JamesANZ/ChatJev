import { describe, expect, it } from "vitest";
import { ingestDocument } from "../src/core/ingest";
import { handleAsk, handleUpload } from "../src/lib/http";
import type { ExamDesigner } from "../src/core/exam-designer";
import {
  examEvaluation,
  fixture,
  judgmentClassification,
  MEDICAL_QUESTION,
  medicalEvaluation,
  nicotineExam,
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
      verdict: { noul: number; relation: string };
    };
    expect(body.kind).toBe("verdict");
    expect(body.verdict.noul).toBe(0.9);
    expect(body.verdict.relation).toBe("supported");
    expect(body.message).toContain("90%");
    expect(body.message).toContain(MEDICAL_QUESTION);
  });

  it("answers open-ended asks as a sentence after a document is attached", async () => {
    const created = await attach(
      "nicotine-heart.txt",
      fixture("nicotine-heart.txt"),
    );
    const document = await created.json();
    const designer: ExamDesigner = {
      async design() {
        return { ...nicotineExam(), model: "test-exam" };
      },
    };

    const asked = await handleAsk(
      new Request("http://localhost/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: "summarize this", document }),
      }),
      scriptedJev(judgmentClassification(), examEvaluation()),
      designer,
    );
    const body = (await asked.json()) as {
      kind: string;
      message: string;
      verdict: { mode: string };
      examModel: string;
    };
    expect(asked.status).toBe(200);
    expect(body.kind).toBe("verdict");
    expect(body.verdict.mode).toBe("exam");
    expect(body.message).toContain("74%");
    expect(body.message.toLowerCase()).toContain("nicotine");
    expect(body.examModel).toBe("test-exam");
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

  it("rejects unsupported and oversized uploads", async () => {
    const png = await attach(
      "scan.png",
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      "image/png",
    );
    expect(png.status).toBe(415);

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
