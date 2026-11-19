import { ChatJevError, type SourceSnippet } from "./types";

const MONID_BASE = "https://api.monid.ai";
const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 20_000;
const FAILURE = new Set([
  "FAILED",
  "BLOCKED",
  "STOPPED",
  "TIME_OUT",
  "TIMED_OUT",
]);

const OPEN = new Set(["RUNNING", "PENDING", "ACCEPTED", "QUEUED"]);

type FailedRun = {
  phase: "failed";
  status: string;
  providerStatus?: number;
};

export type TinyFishPhase =
  | { phase: "accepted"; runId: string }
  | { phase: "running"; runId: string }
  | { phase: "completed"; output: unknown }
  | FailedRun
  | { phase: "rejected"; httpStatus: number }
  | { phase: "invalid" };

export type PolledRun =
  | { phase: "pending" }
  | { phase: "completed"; output: unknown }
  | FailedRun
  | { phase: "rejected"; httpStatus: number };

export type TinyFishHit = {
  title: string;
  url: string;
  snippet: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text.slice(0, 200) };
  }
}

function hitsFromOutput(output: unknown): TinyFishHit[] {
  const record = asRecord(output);
  const rows = Array.isArray(record.results)
    ? record.results
    : Array.isArray(output)
      ? output
      : [];
  const hits: TinyFishHit[] = [];
  for (const row of rows) {
    const item = asRecord(row);
    const url = typeof item.url === "string" ? item.url : "";
    const title = typeof item.title === "string" ? item.title : url;
    const snippet =
      typeof item.snippet === "string"
        ? item.snippet
        : typeof item.content === "string"
          ? item.content
          : "";
    if (!url || !title) continue;
    hits.push({ title, url, snippet });
    if (hits.length >= 5) break;
  }
  return hits;
}

function runStatus(body: Record<string, unknown>): string {
  return typeof body.status === "string" ? body.status.trim().toUpperCase() : "";
}

function runIdOf(body: Record<string, unknown>): string {
  return typeof body.runId === "string" ? body.runId : "";
}

function providerStatus(body: Record<string, unknown>): number | undefined {
  const provider = asRecord(body.providerResponse);
  return typeof provider.httpStatus === "number" ? provider.httpStatus : undefined;
}

function completedOrProviderFailure(
  body: Record<string, unknown>,
): Extract<TinyFishPhase, { phase: "completed" | "failed" }> {
  const httpStatus = providerStatus(body) ?? 200;
  if (httpStatus >= 400) {
    return { phase: "failed", status: "FAILED", providerStatus: httpStatus };
  }
  return { phase: "completed", output: body.output };
}

export function readSubmittedRun(
  httpStatus: number,
  body: unknown,
): TinyFishPhase {
  if (httpStatus >= 400) return { phase: "rejected", httpStatus };
  const record = asRecord(body);
  const status = runStatus(record);
  const runId = runIdOf(record);
  if (runId && (httpStatus === 202 || OPEN.has(status))) {
    return status === "RUNNING" || status === "PENDING"
      ? { phase: "running", runId }
      : { phase: "accepted", runId };
  }
  if (status === "COMPLETED" || (status === "" && httpStatus !== 202)) {
    return completedOrProviderFailure(record);
  }
  if (FAILURE.has(status)) return { phase: "failed", status };
  return { phase: "invalid" };
}

export function readPolledRun(httpStatus: number, body: unknown): PolledRun {
  if (httpStatus >= 400) return { phase: "rejected", httpStatus };
  const record = asRecord(body);
  const status = runStatus(record);
  if (status === "COMPLETED") {
    const settled = completedOrProviderFailure(record);
    return settled.phase === "completed"
      ? { phase: "completed", output: settled.output }
      : settled;
  }
  if (FAILURE.has(status)) return { phase: "failed", status };
  return { phase: "pending" };
}

function searchFailure(phase: TinyFishPhase | PolledRun): ChatJevError {
  if (phase.phase === "rejected") {
    return new ChatJevError(
      502,
      "search_error",
      `TinyFish search failed (${phase.httpStatus}).`,
    );
  }
  if (phase.phase === "failed") {
    const detail =
      phase.providerStatus != null && phase.providerStatus >= 400
        ? `failed (${phase.providerStatus})`
        : phase.status.toLowerCase();
    return new ChatJevError(
      502,
      "search_error",
      `TinyFish search ${detail}.`,
    );
  }
  return new ChatJevError(
    502,
    "search_error",
    "TinyFish search did not return a run.",
  );
}

async function pollRun(runId: string, apiKey: string): Promise<PolledRun> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const response = await fetch(`${MONID_BASE}/v1/runs/${runId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const body = await readJson(response);
    const phase = readPolledRun(response.status, body);
    if (phase.phase === "rejected") {
      throw new ChatJevError(
        502,
        "search_error",
        `TinyFish search status check failed (${response.status}).`,
      );
    }
    if (phase.phase !== "pending") return phase;
  }
  throw new ChatJevError(
    502,
    "search_error",
    "TinyFish search did not finish in time.",
  );
}

export async function lookupWeb(query: string): Promise<SourceSnippet[]> {
  if (!process.env.MONID_API_KEY) return [];
  const hits = await searchTinyFish(query);
  return hits.map((hit) => ({
    title: hit.title,
    url: hit.url,
    excerpt: hit.snippet,
  }));
}

export async function searchTinyFish(query: string): Promise<TinyFishHit[]> {
  const apiKey = process.env.MONID_API_KEY;
  if (!apiKey) {
    throw new ChatJevError(
      503,
      "missing_search_key",
      "MONID_API_KEY is not set, so ChatJev cannot look up web evidence.",
    );
  }

  const response = await fetch(`${MONID_BASE}/v1/run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      provider: "tinyfish",
      endpoint: "/free/search",
      input: { queryParams: { query, domain_type: "web" } },
    }),
  });
  const phase = readSubmittedRun(response.status, await readJson(response));
  if (phase.phase === "accepted" || phase.phase === "running") {
    const polled = await pollRun(phase.runId, apiKey);
    if (polled.phase === "completed") return hitsFromOutput(polled.output);
    throw searchFailure(polled);
  }
  if (phase.phase === "completed") return hitsFromOutput(phase.output);
  throw searchFailure(phase);
}
