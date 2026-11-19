import {
  parseAttachedImage,
  type DocumentContext,
} from "@/core/types";

const INVALID = "Send both the document text and filename.";
const BAD_IMAGE = "Send a prepared JPEG or PNG with the document.";

export type IncomingDocument =
  | { status: "skip" }
  | { status: "invalid"; message: string }
  | { status: "ready"; document: DocumentContext };

function ready(
  item: Partial<DocumentContext>,
  index: number,
  filename: string,
  text: string,
  image: DocumentContext["image"],
): IncomingDocument {
  return {
    status: "ready",
    document: {
      id: item.id ?? `client-${index + 1}`,
      filename,
      mimeType: item.mimeType ?? (image ? "image/jpeg" : "text/plain"),
      text,
      charCount: text.length,
      truncated: Boolean(item.truncated),
      ...(image ? { image } : {}),
    },
  };
}

export function readIncomingDocument(
  value: unknown,
  index: number,
): IncomingDocument {
  if (!value || typeof value !== "object") {
    return { status: "invalid", message: INVALID };
  }
  const item = value as Partial<DocumentContext>;
  const text = typeof item.text === "string" ? item.text : "";
  const filename = typeof item.filename === "string" ? item.filename : "";
  if (item.image != null) {
    const image = parseAttachedImage(item.image);
    if (!image) return { status: "invalid", message: BAD_IMAGE };
    if (!filename) return { status: "invalid", message: INVALID };
    return ready(
      item,
      index,
      filename,
      text.length > 0 ? text : `Attached image: ${filename}.`,
      image,
    );
  }
  const hasText = text.length > 0;
  const hasName = filename.length > 0;
  if (!hasText && !hasName) return { status: "skip" };
  if (hasText && hasName) return ready(item, index, filename, text, undefined);
  return { status: "invalid", message: INVALID };
}
