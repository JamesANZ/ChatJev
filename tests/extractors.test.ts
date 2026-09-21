import { describe, expect, it } from "vitest";
import {
  createExtractors,
  extractText,
  getExtractor,
  resolveMimeType,
} from "../src/core/extractors.js";
import { ChatJevError } from "../src/core/types.js";
import { fixture } from "./helpers.js";

describe("extractors", () => {
  it("reads plain text, markdown, csv, and json", async () => {
    const txt = await extractText({
      buffer: fixture("nicotine-heart.txt"),
      filename: "nicotine-heart.txt",
      mimeType: "text/plain",
    });
    expect(txt.text).toContain("nicotine exposure and heart disease");

    const md = await extractText({
      buffer: Buffer.from("# Title\n\nA claim."),
      filename: "note.md",
      mimeType: "",
    });
    expect(md.mimeType).toBe("text/markdown");
    expect(md.text).toContain("A claim.");

    const csv = await extractText({
      buffer: Buffer.from("a,b\n1,2"),
      filename: "table.csv",
      mimeType: "text/csv",
    });
    expect(csv.text).toBe("a,b\n1,2");

    const json = await extractText({
      buffer: fixture("sample.json"),
      filename: "sample.json",
      mimeType: "application/json",
    });
    expect(json.text).toContain('"claim"');
    expect(json.text).toContain("Revenue grew 12%");
  });

  it("strips scripts and tags from HTML", async () => {
    const html = await extractText({
      buffer: fixture("sample.html"),
      filename: "sample.html",
      mimeType: "text/html",
    });
    expect(html.text).toContain("no association between tea and sleep quality");
    expect(html.text).not.toContain("alert");
    expect(html.text).not.toContain("<p>");
  });

  it("uses injected PDF and DOCX extractors", async () => {
    const extractors = createExtractors({
      extractPdf: async () => "PDF body text",
      extractDocx: async () => "DOCX body text",
    });

    const pdf = await extractText(
      {
        buffer: Buffer.from("%PDF"),
        filename: "paper.pdf",
        mimeType: "application/pdf",
      },
      extractors,
    );
    expect(pdf.text).toBe("PDF body text");

    const docx = await extractText(
      {
        buffer: Buffer.from("PK"),
        filename: "memo.docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
      extractors,
    );
    expect(docx.text).toBe("DOCX body text");
  });

  it("rejects images and unknown binaries", () => {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(() => getExtractor("scan.png", "image/png")).toThrow(ChatJevError);
    expect(() => getExtractor("scan.png", "image/png")).toThrow(/cannot read/i);
    expect(resolveMimeType("scan.png", "image/png")).toBe("image/png");
    expect(png[0]).toBe(137);
  });
});
