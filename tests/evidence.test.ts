import { describe, expect, it } from "vitest";
import { askDocument } from "../src/core/ask";
import {
  asksAboutAttachment,
  claimProposition,
  needsWebEvidence,
} from "../src/core/evidence";
import { gatherSystem } from "../src/core/gateway-llm";
import { createDemoJevClient } from "../src/core/jev-client";
import { createHeuristicLlm } from "../src/core/llm";
import type { SourceSnippet } from "../src/core/types";
import { fixture } from "./helpers";

const CARCINOGEN: SourceSnippet = {
  title: "Nicotine and cancer risk",
  url: "https://example.com/nicotine-carcinogen",
  excerpt:
    "Nicotine is a carcinogen according to several public health reviews.",
};

describe("needsWebEvidence", () => {
  it("searches when nothing is attached", () => {
    expect(needsWebEvidence("Is nicotine a carcinogen?")).toBe(true);
  });

  it("searches when the file does not cover the claim", () => {
    expect(
      needsWebEvidence(
        "Is nicotine a carcinogen?",
        "This ticket is a flight from Barcelona to London.",
      ),
    ).toBe(true);
  });

  it("stays on the file when the question is about that file", () => {
    const document = fixture("nicotine-heart.txt").toString("utf8");
    expect(
      needsWebEvidence(
        "does this medical document strongly suggest a correlation between nicotine and heart disease?",
        document,
      ),
    ).toBe(false);
    expect(asksAboutAttachment("name James?")).toBe(true);
    expect(needsWebEvidence("name James?", document)).toBe(false);
    expect(needsWebEvidence("Is this about flights?", document)).toBe(false);
    expect(
      needsWebEvidence("Is there a dog in this picture?", "Attached image: a.jpg.", {
        image: true,
      }),
    ).toBe(false);
  });
});

describe("claimProposition", () => {
  it("turns a yes/no question into a statement", () => {
    expect(claimProposition("Is nicotine a carcinogen?")).toBe(
      "Nicotine is a carcinogen.",
    );
  });
});

describe("web evidence answers", () => {
  it("scores a claim from web sources when no file is attached", async () => {
    const heuristic = createHeuristicLlm();
    const result = await askDocument(
      createDemoJevClient(),
      null,
      "Is nicotine a carcinogen?",
      {
        gather: async () => [CARCINOGEN],
        compile: (input) => heuristic.compile(input),
        narrate: (input) => heuristic.narrate(input),
      },
    );

    expect(result.kind).toBe("verdict");
    if (result.kind !== "verdict") return;
    expect(result.sources).toEqual([CARCINOGEN]);
    expect(
      result.judgments.find((item) => item.key === "proposition")?.instructions,
    ).toBe("Nicotine is a carcinogen.");
    expect(result.message).toContain("95%");
    expect(result.message).toContain("The evidence supports it");
    expect(result.message).not.toMatch(/cannot summarize|specific claim/i);
  });

  it("uses web sources when the attachment does not answer", async () => {
    const heuristic = createHeuristicLlm();
    const result = await askDocument(
      createDemoJevClient(),
      {
        id: "ticket",
        filename: "ticket.txt",
        mimeType: "text/plain",
        text: "Flight BCN to LHR on 26 June. Passenger seat 14A.",
        charCount: 48,
        truncated: false,
      },
      "Is nicotine a carcinogen?",
      {
        gather: async (input) => {
          expect(input.document).toContain("Flight BCN");
          expect(input.question).toBe("Is nicotine a carcinogen?");
          return [CARCINOGEN];
        },
        compile: (input) => heuristic.compile(input),
        narrate: (input) => heuristic.narrate(input),
      },
    );

    expect(result.kind).toBe("verdict");
    if (result.kind !== "verdict") return;
    expect(result.message).toContain("Nicotine is a carcinogen.");
    expect(result.message).toContain("95%");
    expect(result.sources[0]?.url).toBe(CARCINOGEN.url);
  });
});

describe("gatherSystem", () => {
  it("requires a web search for claims the file cannot answer", () => {
    expect(gatherSystem(true)).toMatch(/MUST call web_search/);
    expect(gatherSystem(false)).toMatch(/Do not search/);
  });
});
