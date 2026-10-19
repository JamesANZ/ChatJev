import type { SourceSnippet } from "./types";

type ToolStep = {
  toolResults?: Array<{ output?: unknown }>;
};

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function extractSnippets(steps: ToolStep[]): SourceSnippet[] {
  const found: SourceSnippet[] = [];
  const seen = new Set<string>();

  for (const step of steps) {
    for (const result of step.toolResults ?? []) {
      const output = result.output;
      if (!output || typeof output !== "object" || "error" in output) continue;
      const results = (output as { results?: unknown }).results;
      if (!Array.isArray(results)) continue;

      for (const item of results) {
        if (!item || typeof item !== "object") continue;
        const row = item as {
          title?: unknown;
          url?: unknown;
          snippet?: unknown;
          excerpt?: unknown;
          content?: unknown;
        };
        const excerpt =
          typeof row.snippet === "string"
            ? row.snippet
            : typeof row.excerpt === "string"
              ? row.excerpt
              : typeof row.content === "string"
                ? row.content
                : "";
        if (
          typeof row.url !== "string" ||
          !excerpt.trim() ||
          !isHttpUrl(row.url)
        ) {
          continue;
        }
        if (seen.has(row.url)) continue;
        seen.add(row.url);
        found.push({
          title:
            typeof row.title === "string" && row.title.trim()
              ? row.title.trim()
              : row.url,
          url: row.url,
          excerpt: excerpt.trim(),
        });
        if (found.length >= 5) return found;
      }
    }
  }

  return found;
}

export function formatSources(sources: SourceSnippet[]): string {
  return sources
    .map(
      (source, index) =>
        `[${index + 1}] ${source.title}\nURL: ${source.url}\n${source.excerpt}`,
    )
    .join("\n\n");
}
