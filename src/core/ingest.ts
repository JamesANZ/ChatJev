import { randomUUID } from "node:crypto";
import { extractText, type Extractor, type ExtractorInput } from "./extractors";
import {
  ChatJevError,
  MAX_STATE_CHARS,
  MAX_UPLOAD_BYTES,
  type DocumentContext,
} from "./types";

export type IngestOptions = {
  extractors?: Record<string, Extractor>;
  maxBytes?: number;
  maxChars?: number;
  id?: string;
};

export function truncateToBudget(
  text: string,
  maxChars = MAX_STATE_CHARS,
): {
  text: string;
  truncated: boolean;
} {
  if (text.length <= maxChars) {
    return { text, truncated: false };
  }
  return { text: text.slice(0, maxChars), truncated: true };
}

export async function ingestDocument(
  input: ExtractorInput,
  options: IngestOptions = {},
): Promise<DocumentContext> {
  const maxBytes = options.maxBytes ?? MAX_UPLOAD_BYTES;
  if (input.buffer.byteLength > maxBytes) {
    throw new ChatJevError(
      413,
      "file_too_large",
      `File exceeds the ${Math.round(maxBytes / (1024 * 1024))} MB upload limit.`,
    );
  }

  const { text, mimeType } = await extractText(input, options.extractors);
  const clipped = truncateToBudget(text, options.maxChars ?? MAX_STATE_CHARS);

  return {
    id: options.id ?? randomUUID(),
    filename: input.filename,
    mimeType,
    text: clipped.text,
    charCount: clipped.text.length,
    truncated: clipped.truncated,
  };
}
