import { describe, expect, it } from "vitest";
import { ingestDocument } from "../src/core/ingest.js";
import { createApp } from "../src/server/app.js";
import { SessionStore } from "../src/server/sessions.js";
import {
  fixture,
  judgmentClassification,
  MEDICAL_QUESTION,
  medicalEvaluation,
  openEndedClassification,
  scriptedJev,
} from "./helpers.js";

async function attach(
  app: ReturnType<typeof createApp>,
  filename: string,
  buffer: Buffer,
  type = "text/plain",
) {
  const form = new FormData();
  form.append("file", new File([new Uint8Array(buffer)], filename, { type }));
  return app.request("/api/sessions", { method: "POST", body: form });
}

describe("HTTP routes", () => {
  it("attaches a document then answers the medical fixture question", async () => {
    const app = createApp({
      jev: scriptedJev(judgmentClassification(), medicalEvaluation()),
    });
    const created = await attach(
      app,
      "nicotine-heart.txt",
      fixture("nicotine-heart.txt"),
    );
    expect(created.status).toBe(201);
    const session = (await created.json()) as {
      id: string;
      truncated: boolean;
    };
    expect(session.truncated).toBe(false);

    const asked = await app.request(`/api/sessions/${session.id}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: MEDICAL_QUESTION }),
    });
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

  it("refuses open-ended asks after a document is attached", async () => {
    const app = createApp({ jev: scriptedJev(openEndedClassification()) });
    const created = await attach(
      app,
      "nicotine-heart.txt",
      fixture("nicotine-heart.txt"),
    );
    const session = (await created.json()) as { id: string };

    const asked = await app.request(`/api/sessions/${session.id}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "summarize this" }),
    });
    const body = (await asked.json()) as { kind: string; message: string };
    expect(body.kind).toBe("refusal");
    expect(body.message).toMatch(/cannot summarize/i);
  });

  it("returns 404 when asking without a session", async () => {
    const app = createApp({ jev: scriptedJev(judgmentClassification()) });
    const asked = await app.request("/api/sessions/missing/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: MEDICAL_QUESTION }),
    });
    expect(asked.status).toBe(404);
  });

  it("rejects unsupported and oversized uploads", async () => {
    const app = createApp({ jev: scriptedJev(judgmentClassification()) });
    const png = await attach(
      app,
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

  it("does not return full document text from GET /api/sessions/:id", async () => {
    const sessions = new SessionStore();
    const app = createApp({
      jev: scriptedJev(judgmentClassification()),
      sessions,
    });
    const created = await attach(
      app,
      "nicotine-heart.txt",
      fixture("nicotine-heart.txt"),
    );
    const session = (await created.json()) as { id: string };
    const fetched = await app.request(`/api/sessions/${session.id}`);
    const body = (await fetched.json()) as Record<string, unknown>;
    expect(body.filename).toBe("nicotine-heart.txt");
    expect(body.text).toBeUndefined();
  });
});
