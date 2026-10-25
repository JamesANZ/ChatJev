import { ChatJevError, type SourceSnippet } from "./types";

const MONID_BASE = "https://api.monid.ai";
const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 20_000;
const TERMINAL = new Set([
  "COMPLETED",
  "FAILED",
  "BLOCKED",
  "STOPPED",
  "TIME_OUT",
  "TIMED_OUT",
]);

export type TinyFishHit = {
  title: string;
  url: string;
  snippet: string;
};

type MonidRun = {
  runId?: string;
  status?: string;
  output?: unknown;
  providerResponse?: { httpStatus?: number; error?: unknown };
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

async function pollRun(runId: string, apiKey: string): Promise<MonidRun> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const response = await fetch(`${MONID_BASE}/v1/runs/${runId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const body = asRecord(await readJson(response));
    if (!response.ok) {
      throw new ChatJevError(
        502,
        "search_error",
        `TinyFish search status check failed (${response.status}).`,
      );
    }
    const status = typeof body.status === "string" ? body.status : "";
    if (TERMINAL.has(status)) return body as MonidRun;
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
  let result = asRecord(await readJson(response)) as MonidRun;
  if (response.status === 202 && typeof result.runId === "string") {
    result = await pollRun(result.runId, apiKey);
  } else if (!response.ok) {
    throw new ChatJevError(
      502,
      "search_error",
      `TinyFish search failed (${response.status}).`,
    );
  }

  const status = result.status ?? "COMPLETED";
  if (status !== "COMPLETED") {
    throw new ChatJevError(
      502,
      "search_error",
      `TinyFish search ${status.toLowerCase()}.`,
    );
  }
  const httpStatus = result.providerResponse?.httpStatus ?? 200;
  if (httpStatus >= 400) {
    throw new ChatJevError(
      502,
      "search_error",
      `TinyFish search failed (${httpStatus}).`,
    );
  }
  return hitsFromOutput(result.output);
}
