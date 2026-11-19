import { describe, expect, it } from "vitest";
import { readIncomingDocument } from "../src/lib/incoming-document";

const image = {
  format: "jpg" as const,
  dataBase64: "abc",
  width: 280,
  height: 280,
};

describe("readIncomingDocument", () => {
  it("skips an empty attachment", () => {
    expect(readIncomingDocument({}, 0)).toEqual({ status: "skip" });
    expect(readIncomingDocument({ text: "", filename: "" }, 1)).toEqual({
      status: "skip",
    });
  });

  it("rejects a name, text, or image that arrives alone", () => {
    expect(readIncomingDocument({ filename: "notes.txt" }, 0).status).toBe(
      "invalid",
    );
    expect(readIncomingDocument({ text: "hello" }, 0).status).toBe("invalid");
    expect(readIncomingDocument({ image }, 0).status).toBe("invalid");
    expect(readIncomingDocument({ image: { format: "gif" } }, 0)).toMatchObject(
      { status: "invalid" },
    );
    expect(readIncomingDocument(null, 0).status).toBe("invalid");
  });

  it("accepts text, and an image with or without text", () => {
    const text = readIncomingDocument(
      { filename: "notes.txt", text: "hello", id: "doc-1" },
      3,
    );
    expect(text).toMatchObject({
      status: "ready",
      document: {
        id: "doc-1",
        filename: "notes.txt",
        text: "hello",
        charCount: 5,
      },
    });

    const photo = readIncomingDocument(
      { filename: "door.jpg", image, mimeType: "image/jpeg" },
      0,
    );
    expect(photo).toMatchObject({
      status: "ready",
      document: {
        id: "client-1",
        text: "Attached image: door.jpg.",
        image,
      },
    });

    const captioned = readIncomingDocument(
      { filename: "door.jpg", text: "A door.", image },
      0,
    );
    expect(captioned).toMatchObject({
      status: "ready",
      document: { text: "A door.", image },
    });
  });
});
