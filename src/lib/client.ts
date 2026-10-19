import type { AskResult, DocumentContext } from "@/core/types";

export class AskError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "AskError";
    this.code = code;
  }
}

async function readError(response: Response): Promise<AskError> {
  try {
    const body = (await response.json()) as { error?: string; code?: string };
    return new AskError(body.error || response.statusText, body.code);
  } catch {
    return new AskError(response.statusText);
  }
}

export async function uploadDocument(file: File): Promise<DocumentContext> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/sessions", { method: "POST", body: form });
  if (!response.ok) {
    throw await readError(response);
  }
  return (await response.json()) as DocumentContext;
}

export async function askAttachedDocument(
  document: Pick<
    DocumentContext,
    "id" | "filename" | "mimeType" | "text" | "truncated"
  > | null,
  question: string,
): Promise<AskResult> {
  const response = await fetch("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, document }),
  });
  if (!response.ok) {
    throw await readError(response);
  }
  return (await response.json()) as AskResult;
}
