import type { AskResult, DocumentContext } from "@/core/types";

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error || response.statusText;
  } catch {
    return response.statusText;
  }
}

export async function uploadDocument(file: File): Promise<DocumentContext> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/sessions", { method: "POST", body: form });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return (await response.json()) as DocumentContext;
}

export async function askQuestion(
  question: string,
  document?: Pick<
    DocumentContext,
    "id" | "filename" | "mimeType" | "text" | "truncated"
  >,
): Promise<AskResult> {
  const response = await fetch("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, document }),
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return (await response.json()) as AskResult;
}

export async function askAttachedDocument(
  document: Pick<
    DocumentContext,
    "id" | "filename" | "mimeType" | "text" | "truncated"
  >,
  question: string,
): Promise<AskResult> {
  return askQuestion(question, document);
}
