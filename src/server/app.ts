import { Hono } from "hono";
import { cors } from "hono/cors";
import { askDocument } from "../core/ask.js";
import { ingestDocument } from "../core/ingest.js";
import { ChatJevError, type JevClient } from "../core/types.js";
import { SessionStore } from "./sessions.js";

export type AppDeps = {
  jev: JevClient;
  sessions?: SessionStore;
};

function errorBody(error: unknown): {
  status: number;
  body: Record<string, string>;
} {
  if (error instanceof ChatJevError) {
    return {
      status: error.status,
      body: { error: error.message, code: error.code },
    };
  }
  const message =
    error instanceof Error ? error.message : "Unexpected server error";
  return { status: 500, body: { error: message, code: "internal_error" } };
}

export function createApp(deps: AppDeps): Hono {
  const sessions = deps.sessions ?? new SessionStore();
  const app = new Hono();

  app.use("/api/*", cors());

  app.get("/api/health", (c) => c.json({ ok: true }));

  app.post("/api/sessions", async (c) => {
    try {
      const body = await c.req.parseBody();
      const file = body.file;
      if (!(file instanceof File)) {
        return c.json(
          {
            error: "Attach a document as the file field.",
            code: "missing_file",
          },
          400,
        );
      }

      const document = await ingestDocument({
        buffer: Buffer.from(await file.arrayBuffer()),
        filename: file.name,
        mimeType: file.type,
      });

      return c.json(sessions.set(document), 201);
    } catch (error) {
      const { status, body } = errorBody(error);
      return c.json(body, status as 400);
    }
  });

  app.get("/api/sessions/:id", (c) => {
    const summary = sessions.summary(c.req.param("id"));
    if (!summary) {
      return c.json({ error: "Session not found.", code: "not_found" }, 404);
    }
    return c.json(summary);
  });

  app.post("/api/sessions/:id/ask", async (c) => {
    try {
      const document = sessions.get(c.req.param("id"));
      if (!document) {
        return c.json(
          {
            error: "Session not found. Attach a document first.",
            code: "not_found",
          },
          404,
        );
      }

      const payload = (await c.req.json().catch(() => ({}))) as {
        question?: unknown;
      };
      if (typeof payload.question !== "string") {
        return c.json(
          {
            error: "Send a JSON body with a question string.",
            code: "invalid_question",
          },
          400,
        );
      }

      return c.json(await askDocument(deps.jev, document, payload.question));
    } catch (error) {
      const { status, body } = errorBody(error);
      return c.json(body, status as 400);
    }
  });

  return app;
}
