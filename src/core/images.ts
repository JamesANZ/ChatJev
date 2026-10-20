import sharp from "sharp";
import { ChatJevError, type AttachedImage } from "./types";

export const IMAGE_MIN_SIDE = 280;
export const IMAGE_MAX_SIDE = 1568;
export const IMAGE_MIN_PIXELS = 78_400;
export const IMAGE_MAX_PREPARED_BYTES = Math.floor(2.5 * 1024 * 1024);

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".heic",
  ".heif",
]);

const IMAGE_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);

export type PrepareImageInput = {
  buffer: Buffer;
  filename: string;
  mimeType: string;
};

export type FittedImage = {
  width: number;
  height: number;
  padLeft: number;
  padRight: number;
  padTop: number;
  padBottom: number;
};

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot).toLowerCase();
}

function mimeOf(mimeType: string): string {
  return (mimeType || "").split(";")[0].trim().toLowerCase();
}

export function isImageUpload(filename: string, mimeType: string): boolean {
  if (IMAGE_MIMES.has(mimeOf(mimeType))) return true;
  return IMAGE_EXTENSIONS.has(extensionOf(filename));
}

function isHeic(filename: string, mimeType: string): boolean {
  const mime = mimeOf(mimeType);
  if (mime.includes("heic") || mime.includes("heif")) return true;
  const extension = extensionOf(filename);
  return extension === ".heic" || extension === ".heif";
}

function imageReadError(
  filename: string,
  mimeType: string,
): ChatJevError {
  if (isHeic(filename, mimeType)) {
    return new ChatJevError(
      422,
      "invalid_image",
      "ChatJev could not read this HEIC photo. Export it as JPEG or PNG and attach that.",
    );
  }
  return new ChatJevError(
    422,
    "invalid_image",
    `ChatJev could not read ${filename || "this image"}. Attach a JPEG, PNG, WebP, or GIF.`,
  );
}

export function fitImageSize(width: number, height: number): FittedImage {
  if (width < 1 || height < 1) {
    throw new ChatJevError(
      422,
      "invalid_image",
      "ChatJev could not read this image.",
    );
  }

  let nextWidth = width;
  let nextHeight = height;
  const longest = Math.max(nextWidth, nextHeight);
  if (longest > IMAGE_MAX_SIDE) {
    const scale = IMAGE_MAX_SIDE / longest;
    nextWidth = Math.max(1, Math.round(nextWidth * scale));
    nextHeight = Math.max(1, Math.round(nextHeight * scale));
  }

  const shortest = Math.min(nextWidth, nextHeight);
  const area = nextWidth * nextHeight;
  if (shortest < IMAGE_MIN_SIDE || area < IMAGE_MIN_PIXELS) {
    const scale = Math.max(
      IMAGE_MIN_SIDE / shortest,
      Math.sqrt(IMAGE_MIN_PIXELS / area),
    );
    const grownWidth = Math.max(1, Math.round(nextWidth * scale));
    const grownHeight = Math.max(1, Math.round(nextHeight * scale));
    if (Math.max(grownWidth, grownHeight) <= IMAGE_MAX_SIDE) {
      nextWidth = Math.min(IMAGE_MAX_SIDE, grownWidth);
      nextHeight = Math.min(IMAGE_MAX_SIDE, grownHeight);
    }
  }

  const canvasWidth = Math.min(
    IMAGE_MAX_SIDE,
    Math.max(nextWidth, IMAGE_MIN_SIDE),
  );
  const canvasHeight = Math.min(
    IMAGE_MAX_SIDE,
    Math.max(nextHeight, IMAGE_MIN_SIDE),
  );
  const extraWidth = canvasWidth - nextWidth;
  const extraHeight = canvasHeight - nextHeight;
  const padLeft = Math.floor(extraWidth / 2);
  const padTop = Math.floor(extraHeight / 2);
  return {
    width: nextWidth,
    height: nextHeight,
    padLeft,
    padRight: extraWidth - padLeft,
    padTop,
    padBottom: extraHeight - padTop,
  };
}

async function encodeJpeg(
  source: Buffer,
  fitted: FittedImage,
  quality: number,
): Promise<Buffer> {
  let pipeline = sharp(source).resize(fitted.width, fitted.height, {
    fit: "fill",
  });
  if (fitted.padLeft || fitted.padRight || fitted.padTop || fitted.padBottom) {
    pipeline = pipeline.extend({
      left: fitted.padLeft,
      right: fitted.padRight,
      top: fitted.padTop,
      bottom: fitted.padBottom,
      background: { r: 255, g: 255, b: 255 },
    });
  }
  return pipeline
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality, progressive: false, mozjpeg: false })
    .toBuffer();
}

export async function prepareImage(
  input: PrepareImageInput,
): Promise<AttachedImage> {
  let oriented: Buffer;
  let width = 0;
  let height = 0;
  try {
    const result = await sharp(input.buffer, {
      animated: false,
      pages: 1,
      page: 0,
      limitInputPixels: 40_000_000,
    })
      .rotate()
      .toBuffer({ resolveWithObject: true });
    oriented = result.data;
    width = result.info.width;
    height = result.info.height;
  } catch {
    throw imageReadError(input.filename, input.mimeType);
  }

  if (width < 1 || height < 1) {
    throw imageReadError(input.filename, input.mimeType);
  }

  const fitted = fitImageSize(width, height);
  let quality = 90;
  let jpeg = await encodeJpeg(oriented, fitted, quality);
  while (jpeg.length > IMAGE_MAX_PREPARED_BYTES && quality > 40) {
    quality -= 10;
    jpeg = await encodeJpeg(oriented, fitted, quality);
  }
  if (jpeg.length > IMAGE_MAX_PREPARED_BYTES) {
    throw new ChatJevError(
      422,
      "invalid_image",
      `ChatJev could not shrink ${input.filename || "this image"} enough to send to Jev.`,
    );
  }

  const meta = await sharp(jpeg).metadata();
  const outWidth = meta.width ?? 0;
  const outHeight = meta.height ?? 0;
  const pixels = outWidth * outHeight;
  if (
    outWidth < IMAGE_MIN_SIDE ||
    outHeight < IMAGE_MIN_SIDE ||
    outWidth > IMAGE_MAX_SIDE ||
    outHeight > IMAGE_MAX_SIDE ||
    pixels < IMAGE_MIN_PIXELS ||
    pixels > IMAGE_MAX_SIDE * IMAGE_MAX_SIDE
  ) {
    throw new ChatJevError(
      422,
      "invalid_image",
      `ChatJev could not fit ${input.filename || "this image"} within Jev's image size limits.`,
    );
  }

  return {
    format: "jpg",
    dataBase64: jpeg.toString("base64"),
    width: outWidth,
    height: outHeight,
  };
}
