import { describe, expect, it } from "vitest";
import { clipEvidence, validateQuestions } from "../src/core/questions";
import { extractSnippets } from "../src/core/snippets";

describe("validateQuestions", () => {
  it("accepts a noul, a choice, and a score", () => {
    const result = validateQuestions([
      { key: "claim", type: "noul", instructions: "The claim holds." },
      {
        key: "relation",
        type: "choice",
        instructions: "How does the text relate?",
        criteria: { supports: "Supports", contradicts: "Contradicts" },
      },
      {
        key: "strength",
        type: "score",
        instructions: "How strong is the evidence?",
        criteria: ["Weak", "Strong"],
      },
    ]);
    expect(result.ok).toBe(true);
  });

  it("rejects a choice with one label", () => {
    const result = validateQuestions([
      {
        key: "only",
        type: "choice",
        instructions: "Pick one.",
        criteria: { yes: "Yes" },
      },
    ]);
    expect(result.ok).toBe(false);
  });
});

describe("clipEvidence", () => {
  it("reserves room for sources when both are present", () => {
    const clipped = clipEvidence("d".repeat(100), "s".repeat(100), 50);
    expect(
      clipped.document.length + clipped.sources.length,
    ).toBeLessThanOrEqual(50);
    expect(clipped.truncated).toBe(true);
    expect(clipped.sources.length).toBeGreaterThan(0);
  });
});

describe("extractSnippets", () => {
  it("keeps titled http results and drops errors", () => {
    const snippets = extractSnippets([
      {
        toolResults: [
          { output: { error: "rate_limit", message: "slow down" } },
          {
            output: {
              id: "search",
              results: [
                {
                  title: "Study",
                  url: "https://example.com/a",
                  snippet: "A finding.",
                },
                {
                  title: "Bad",
                  url: "ftp://example.com/a",
                  snippet: "Skip.",
                },
                {
                  title: "Page",
                  url: "https://example.com/page",
                  content: "A longer extract.",
                },
              ],
            },
          },
        ],
      },
    ]);
    expect(snippets).toEqual([
      {
        title: "Study",
        url: "https://example.com/a",
        excerpt: "A finding.",
      },
      {
        title: "Page",
        url: "https://example.com/page",
        excerpt: "A longer extract.",
      },
    ]);
  });
});
