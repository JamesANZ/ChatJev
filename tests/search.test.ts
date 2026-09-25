import { describe, expect, it } from "vitest";
import {
  extractUrls,
  filterPassages,
  isPublicHttpUrl,
  packEvidence,
  splitPassages,
} from "../src/core/search";
import { FakeJevClient, noulAnswer } from "../src/core/jev-client";

describe("search helpers", () => {
  it("extracts and rejects private URLs", () => {
    expect(extractUrls("See https://example.org/a and https://evil.test/b.")).toEqual([
      "https://example.org/a",
      "https://evil.test/b",
    ]);
    expect(isPublicHttpUrl("https://example.org/x")).toBe(true);
    expect(isPublicHttpUrl("http://127.0.0.1/secret")).toBe(false);
    expect(isPublicHttpUrl("http://192.168.1.5/x")).toBe(false);
    expect(isPublicHttpUrl("http://169.254.169.254/latest")).toBe(false);
    expect(isPublicHttpUrl("file:///etc/passwd")).toBe(false);
  });

  it("splits pages and keeps relevant non-hostile passages", async () => {
    const passages = splitPassages([
      {
        title: "Review",
        url: "https://example.org/a",
        text: "Nicotine exposure and heart disease are correlated in the pooled review. ".repeat(
          8,
        ),
      },
    ]);
    expect(passages.length).toBeGreaterThan(0);

    const client = new FakeJevClient(() => ({
      model: "jev-test",
      usage: { input_tokens: 10, output_tokens: 2 },
      answers: Object.fromEntries(
        passages.flatMap((_, index) => [
          [`relevant_${index}`, noulAnswer(0.8)],
          [`hostile_${index}`, noulAnswer(0.05)],
        ]),
      ),
    }));

    const kept = await filterPassages(client, "nicotine heart", passages);
    expect(kept).toHaveLength(passages.length);

    const packed = packEvidence("web", "web-search", kept);
    expect(packed.origin).toBe("web");
    expect(packed.sources[0]?.url).toBe("https://example.org/a");
    expect(packed.text).toContain("Nicotine");
  });
});
