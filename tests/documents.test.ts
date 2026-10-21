import { describe, expect, it } from "vitest";
import { bundleDocuments } from "../src/core/documents";

describe("bundleDocuments", () => {
  it("leaves a single file unlabeled", () => {
    expect(
      bundleDocuments([{ filename: "notes.txt", text: "The notes." }]),
    ).toEqual({
      text: "The notes.",
      files: [{ filename: "notes.txt", text: "The notes." }],
      truncated: false,
    });
  });

  it("splits a tight budget across every file", () => {
    const bundled = bundleDocuments(
      [
        { filename: "a.txt", text: "a".repeat(100) },
        { filename: "b.txt", text: "b".repeat(100) },
      ],
      80,
    );
    expect(bundled.text).toContain("===== a.txt =====");
    expect(bundled.text).toContain("===== b.txt =====");
    expect(bundled.truncated).toBe(true);
    expect(bundled.files[0]?.text.length).toBeGreaterThan(0);
    expect(bundled.files[1]?.text.length).toBeGreaterThan(0);
    expect(
      Math.abs(
        (bundled.files[0]?.text.length ?? 0) -
          (bundled.files[1]?.text.length ?? 0),
      ),
    ).toBeLessThanOrEqual(1);
    expect(bundled.text.length).toBeLessThanOrEqual(80);
  });
});
