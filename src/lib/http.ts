import { askDocument } from "@/core/ask";
import { ingestDocument } from "@/core/ingest";
import { createHeuristicLlm, type LlmClient } from "@/core/llm";
import {
  ChatJevError,
  parseAttachedImage,
  type DocumentContext,
  type JevClient,
} from "@/core/types";

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ChatJevError) {
    return json({ error: error.message, code: error.code }, error.status);
  }
  const message =
    error instanceof Error ? error.message : "Unexpected server error";
  return json({ error: message, code: "internal_error" }, 500);
}

export async function handleUpload(request: Request): Promise<Response> {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return json(
        { error: "Attach a document as the file field.", code: "missing_file" },
        400,
      );
    }

    const document = await ingestDocument({
      buffer: Buffer.from(await file.arrayBuffer()),
      filename: file.name,
      mimeType: file.type,
    });

    return json(document, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleAsk(
  request: Request,
  jev: JevClient,
  llm: LlmClient = createHeuristicLlm(),
): Promise<Response> {
  try {
    const payload = (await request.json().catch(() => ({}))) as {
      question?: unknown;
      document?: Partial<DocumentContext> | null;
    };

    if (typeof payload.question !== "string") {
      return json(
        {
          error: "Send a JSON body with a question string.",
          code: "invalid_question",
        },
        400,
      );
    }

    const text = payload.document?.text;
    const filename = payload.document?.filename;
    const rawImage = payload.document?.image;
    const image = rawImage == null ? undefined : parseAttachedImage(rawImage);
    if (rawImage != null && !image) {
      return json(
        {
          error: "Send a prepared JPEG or PNG with the document.",
          code: "invalid_document",
        },
        400,
      );
    }
    const hasText = typeof text === "string" && text.length > 0;
    const hasName = typeof filename === "string" && filename.length > 0;
    const hasImage = Boolean(image);
    if ((hasText && !hasName) || (hasImage && !hasName) || (!hasText && !hasImage && hasName)) {
      return json(
        {
          error: "Send both the document text and filename.",
          code: "invalid_document",
        },
        400,
      );
    }

    const documentText = hasText
      ? text
      : `Attached image: ${filename}.`;
    const document: DocumentContext | null =
      hasName && (hasText || hasImage)
        ? {
            id: payload.document?.id ?? "client",
            filename,
            mimeType:
              payload.document?.mimeType ??
              (hasImage ? "image/jpeg" : "text/plain"),
            text: documentText,
            charCount: documentText.length,
            truncated: Boolean(payload.document?.truncated),
            image,
          }
        : null;

    return json(await askDocument(jev, document, payload.question, llm));
  } catch (error) {
    return errorResponse(error);
  }
}
