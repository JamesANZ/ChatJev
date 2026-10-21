import { askDocument } from "@/core/ask";
import { normalizeChatHistory } from "@/core/conversation";
import { ingestDocument } from "@/core/ingest";
import { createHeuristicLlm, type LlmClient } from "@/core/llm";
import {
  ChatJevError,
  MAX_ATTACHMENTS,
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

function invalidDocument(message: string): Response {
  return json({ error: message, code: "invalid_document" }, 400);
}

function parseAskDocument(
  value: unknown,
  index: number,
): DocumentContext | null | Response {
  if (!value || typeof value !== "object") {
    return invalidDocument("Send both the document text and filename.");
  }
  const item = value as Partial<DocumentContext>;
  const text = item.text;
  const filename = item.filename;
  const rawImage = item.image;
  const image = rawImage == null ? undefined : parseAttachedImage(rawImage);
  if (rawImage != null && !image) {
    return invalidDocument("Send a prepared JPEG or PNG with the document.");
  }
  const hasText = typeof text === "string" && text.length > 0;
  const hasName = typeof filename === "string" && filename.length > 0;
  const hasImage = Boolean(image);
  if (!hasText && !hasName && !hasImage) return null;
  if (
    (hasText && !hasName) ||
    (hasImage && !hasName) ||
    (!hasText && !hasImage && hasName)
  ) {
    return invalidDocument("Send both the document text and filename.");
  }
  const documentText = hasText ? text : `Attached image: ${filename}.`;
  return {
    id: item.id ?? `client-${index + 1}`,
    filename: filename ?? "",
    mimeType: item.mimeType ?? (hasImage ? "image/jpeg" : "text/plain"),
    text: documentText,
    charCount: documentText.length,
    truncated: Boolean(item.truncated),
    image,
  };
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
      documents?: unknown;
      history?: unknown;
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

    const listed = Array.isArray(payload.documents)
      ? payload.documents
      : payload.document != null
        ? [payload.document]
        : [];
    if (listed.length > MAX_ATTACHMENTS) {
      return json(
        {
          error: `Attach at most ${MAX_ATTACHMENTS} files.`,
          code: "too_many_files",
        },
        400,
      );
    }

    const documents: DocumentContext[] = [];
    for (const [index, item] of listed.entries()) {
      const parsed = parseAskDocument(item, index);
      if (parsed instanceof Response) return parsed;
      if (parsed) documents.push(parsed);
    }

    return json(
      await askDocument(
        jev,
        documents.length > 0 ? documents : null,
        payload.question,
        llm,
        normalizeChatHistory(payload.history),
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
