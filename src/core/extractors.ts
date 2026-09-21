import { ChatJevError } from "./types.js";

export type ExtractorInput = {
  buffer: Buffer;
  filename: string;
  mimeType: string;
};

export type Extractor = (input: ExtractorInput) => Promise<string>;

export type ExtractorDeps = {
  extractPdf?: (buffer: Buffer) => Promise<string>;
  extractDocx?: (buffer: Buffer) => Promise<string>;
};

const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".json",
  ".html",
  ".htm",
]);

const MIME_ALIASES: Record<string, string> = {
  "text/plain": "text/plain",
  "text/markdown": "text/markdown",
  "text/csv": "text/csv",
  "application/json": "application/json",
  "text/html": "text/html",
  "application/pdf": "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot).toLowerCase();
}

function decodeUtf8(buffer: Buffer): string {
  return buffer.toString("utf8").replace(/^\uFEFF/, "");
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function formatJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

async function defaultPdf(buffer: Buffer): Promise<string> {
  const mod = await import("pdf-parse");
  const pdfParse =
    (mod as { default?: (buf: Buffer) => Promise<{ text: string }> }).default ??
    (mod as unknown as (buf: Buffer) => Promise<{ text: string }>);
  const result = await pdfParse(buffer);
  return result.text.trim();
}

async function defaultDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return result.value.trim();
}

export function resolveMimeType(filename: string, mimeType: string): string {
  const normalized = (mimeType || "").split(";")[0].trim().toLowerCase();
  if (
    normalized &&
    normalized !== "application/octet-stream" &&
    MIME_ALIASES[normalized]
  ) {
    return MIME_ALIASES[normalized];
  }

  switch (extensionOf(filename)) {
    case ".txt":
      return "text/plain";
    case ".md":
    case ".markdown":
      return "text/markdown";
    case ".csv":
      return "text/csv";
    case ".json":
      return "application/json";
    case ".html":
    case ".htm":
      return "text/html";
    case ".pdf":
      return "application/pdf";
    case ".docx":
    case ".doc":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    default:
      return normalized || "application/octet-stream";
  }
}

export function isSupportedUpload(filename: string, mimeType: string): boolean {
  const resolved = resolveMimeType(filename, mimeType);
  if (resolved in MIME_ALIASES) return true;
  return TEXT_EXTENSIONS.has(extensionOf(filename));
}

export function createExtractors(
  deps: ExtractorDeps = {},
): Record<string, Extractor> {
  const extractPdf = deps.extractPdf ?? defaultPdf;
  const extractDocx = deps.extractDocx ?? defaultDocx;

  const text: Extractor = async ({ buffer }) => decodeUtf8(buffer).trim();
  const markdown: Extractor = text;
  const csv: Extractor = text;
  const json: Extractor = async ({ buffer }) => formatJson(decodeUtf8(buffer));
  const html: Extractor = async ({ buffer }) => stripHtml(decodeUtf8(buffer));
  const pdf: Extractor = async ({ buffer }) => extractPdf(buffer);
  const docx: Extractor = async ({ buffer }) => extractDocx(buffer);

  return {
    "text/plain": text,
    "text/markdown": markdown,
    "text/csv": csv,
    "application/json": json,
    "text/html": html,
    "application/pdf": pdf,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      docx,
  };
}

const defaultExtractors = createExtractors();

export function getExtractor(
  filename: string,
  mimeType: string,
  extractors: Record<string, Extractor> = defaultExtractors,
): Extractor {
  const resolved = resolveMimeType(filename, mimeType);
  const extractor = extractors[resolved];
  if (!extractor) {
    throw new ChatJevError(
      415,
      "unsupported_type",
      `ChatJev cannot read ${filename || "this file"}. Attach text, Markdown, CSV, JSON, HTML, PDF, or DOCX.`,
    );
  }
  return extractor;
}

export async function extractText(
  input: ExtractorInput,
  extractors?: Record<string, Extractor>,
): Promise<{ text: string; mimeType: string }> {
  const mimeType = resolveMimeType(input.filename, input.mimeType);
  const extractor = getExtractor(input.filename, mimeType, extractors);
  const text = (await extractor({ ...input, mimeType })).trim();
  if (!text) {
    throw new ChatJevError(
      422,
      "empty_document",
      `No extractable text was found in ${input.filename}. Scanned images and empty files are not supported.`,
    );
  }
  return { text, mimeType };
}
