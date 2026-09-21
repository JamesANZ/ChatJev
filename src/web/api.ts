import type { AskResult, SessionSummary } from "../core/types";

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error || response.statusText;
  } catch {
    return response.statusText;
  }
}

export async function createSession(file: File): Promise<SessionSummary> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/sessions", { method: "POST", body: form });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return (await response.json()) as SessionSummary;
}

export async function askSession(
  sessionId: string,
  question: string,
): Promise<AskResult> {
  const response = await fetch(`/api/sessions/${sessionId}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return (await response.json()) as AskResult;
}
