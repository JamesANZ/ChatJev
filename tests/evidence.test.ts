import { describe, expect, it } from "vitest";
import { askDocument } from "../src/core/ask";
import {
  asksAboutAttachment,
  claimProposition,
  documentCovers,
  listedSubjects,
  missingSubjects,
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
      needsWebEvidence(
        "Is there a dog in this picture?",
        "Attached image: a.jpg.",
        {
          image: true,
        },
      ),
    ).toBe(false);
  });

  it("searches when the file states every answer but one", () => {
    const document = fixture("capitals.txt").toString("utf8");
    const question = "What are the capitals of France, Spain, and Italy?";
    expect(listedSubjects(question)).toEqual(["France", "Spain", "Italy"]);
    expect(missingSubjects(question, document)).toEqual(["Italy"]);
    expect(documentCovers(question, document)).toBe(true);
    expect(needsWebEvidence(question, document)).toBe(true);
    expect(
      needsWebEvidence(question, `${document}\nThe capital of Italy is Rome.`),
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

  it("marks file answers and the web answer that fills the gap", async () => {
    const heuristic = createHeuristicLlm();
    const italy: SourceSnippet = {
      title: "Italy",
      url: "https://example.com/italy",
      excerpt: "The capital of Italy is Rome.",
    };
    const result = await askDocument(
      createDemoJevClient(),
      {
        id: "capitals",
        filename: "capitals.txt",
        mimeType: "text/plain",
        text: fixture("capitals.txt").toString("utf8"),
        charCount: 76,
        truncated: false,
      },
      "What are the capitals of France, Spain, and Italy?",
      {
        ...heuristic,
        async gather() {
          return [italy];
        },
      },
    );

    expect(result.kind).toBe("verdict");
    if (result.kind !== "verdict") return;
    const origins = Object.fromEntries(
      result.judgments.map((item) => [item.key, item.origin]),
    );
    expect(origins.france).toEqual({ kind: "file", title: "capitals.txt" });
    expect(origins.spain).toEqual({ kind: "file", title: "capitals.txt" });
    expect(origins.italy).toEqual({
      kind: "web",
      title: "Italy",
      url: "https://example.com/italy",
    });
    expect(
      result.judgments.find((item) => item.key === "france")?.line,
    ).toContain("The capital of France is Paris.");
    expect(
      result.judgments.find((item) => item.key === "italy")?.line,
    ).toContain("The capital of Italy is Rome.");
  });
});

describe("gatherSystem", () => {
  it("requires a web search for claims the file cannot answer", () => {
    expect(gatherSystem(true)).toMatch(/MUST call web_search/);
    expect(gatherSystem(false)).toMatch(/Do not search/);
  });
});
