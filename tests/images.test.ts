import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { askDocument } from "../src/core/ask";
import { createHeuristicLlm } from "../src/core/llm";
import { ingestDocument } from "../src/core/ingest";
import {
  IMAGE_MAX_SIDE,
  IMAGE_MIN_PIXELS,
  IMAGE_MIN_SIDE,
  fitImageSize,
} from "../src/core/images";
import {
  FakeJevClient,
  choiceAnswer,
  noulAnswer,
  scoreAnswer,
} from "../src/core/jev-client";
import type { JevAnswer, JevQuestion } from "../src/core/types";

function answerFor(question: JevQuestion): JevAnswer {
  if (question.type === "noul") return noulAnswer(0.82);
  if (question.type === "choice") {
    const choice = Object.keys(question.criteria)[0] ?? "abstain";
    return choiceAnswer(choice, { [choice]: 0.82 }, 0.82);
  }
  return scoreAnswer(
    1,
    Object.fromEntries(
      question.criteria.map((label, index) => [String(index), label]),
    ),
    Object.fromEntries(
      question.criteria.map((_, index) => [
        String(index),
        index === 1 ? 0.8 : 0.1,
      ]),
    ),
  );
}

describe("image attachments", () => {
  it("pads a panorama and enlarges a tiny image into Jev's pixel bounds", () => {
    const wide = fitImageSize(2000, 20);
    expect(wide.width + wide.padLeft + wide.padRight).toBeLessThanOrEqual(
      IMAGE_MAX_SIDE,
    );
    expect(wide.height + wide.padTop + wide.padBottom).toBeGreaterThanOrEqual(
      IMAGE_MIN_SIDE,
    );
    expect(wide.height + wide.padTop + wide.padBottom).toBe(IMAGE_MIN_SIDE);

    const tiny = fitImageSize(16, 16);
    expect(tiny.width).toBe(IMAGE_MIN_SIDE);
    expect(tiny.height).toBe(IMAGE_MIN_SIDE);
    expect(tiny.padLeft + tiny.padTop).toBe(0);
  });

  it("prepares a photo as an upright JPEG and sends it beside the question", async () => {
    const sideways = await sharp({
      create: {
        width: 400,
        height: 300,
        channels: 3,
        background: { r: 180, g: 40, b: 40 },
      },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const document = await ingestDocument({
      buffer: sideways,
      filename: "door.jpg",
      mimeType: "image/jpeg",
    });

    expect(document.mimeType).toBe("image/jpeg");
    expect(document.image?.format).toBe("jpg");
    expect(document.image?.width).toBeGreaterThanOrEqual(IMAGE_MIN_SIDE);
    expect(document.image?.height).toBeGreaterThanOrEqual(IMAGE_MIN_SIDE);
    expect(document.image?.width).toBeLessThanOrEqual(IMAGE_MAX_SIDE);
    expect(document.image?.height).toBeLessThanOrEqual(IMAGE_MAX_SIDE);
    const pixels = (document.image?.width ?? 0) * (document.image?.height ?? 0);
    expect(pixels).toBeGreaterThanOrEqual(IMAGE_MIN_PIXELS);
    expect(document.image?.height).toBeGreaterThan(document.image?.width ?? 0);
    expect(document.text).toContain("door.jpg");
    expect(Buffer.from(document.image?.dataBase64 ?? "", "base64")[0]).toBe(
      0xff,
    );

    const wide = await sharp({
      create: {
        width: 2000,
        height: 20,
        channels: 3,
        background: { r: 10, g: 20, b: 30 },
      },
    })
      .png()
      .toBuffer();
    const panorama = await ingestDocument({
      buffer: wide,
      filename: "strip.png",
      mimeType: "image/png",
    });
    expect(panorama.image?.width).toBeLessThanOrEqual(IMAGE_MAX_SIDE);
    expect(panorama.image?.height).toBeGreaterThanOrEqual(IMAGE_MIN_SIDE);

    const client = new FakeJevClient((request) => ({
      model: "jev-demo",
      usage: { input_tokens: 12, output_tokens: 4 },
      answers: Object.fromEntries(
        Object.entries(request.questions).map(([key, question]) => [
          key,
          answerFor(question),
        ]),
      ),
    }));
    const reading = "A red rectangle. No person is visible.";
    const result = await askDocument(
      client,
      document,
      "Is there a person in this picture?",
      {
        ...createHeuristicLlm(),
        async describeImage() {
          return reading;
        },
      },
    );

    expect(result.kind).toBe("verdict");
    if (result.kind === "verdict") {
      expect(result.imageReading).toBe(reading);
    }
    const sent = client.calls[0];
    const state = sent?.state as { document?: string };
    expect(state.document).toContain(reading);
    expect(state.document).toContain("not the picture");
    expect(sent?.image).toEqual({
      format: "jpg",
      dataBase64: document.image?.dataBase64,
    });
    expect(JSON.stringify(sent?.state)).not.toContain(
      document.image?.dataBase64.slice(0, 24),
    );
    expect(
      Object.values(sent?.questions ?? {}).some((question) =>
        question.instructions.includes("`photo`"),
      ),
    ).toBe(true);
  });

  it("rejects a damaged image and an unreadable HEIC file", async () => {
    await expect(
      ingestDocument({
        buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        filename: "scan.png",
        mimeType: "image/png",
      }),
    ).rejects.toMatchObject({ status: 422, code: "invalid_image" });

    await expect(
      ingestDocument({
        buffer: Buffer.from("not a photo"),
        filename: "phone.heic",
        mimeType: "image/heic",
      }),
    ).rejects.toThrow(/JPEG or PNG/);
  });
});
