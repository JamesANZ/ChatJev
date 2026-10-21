import { truncateToBudget } from "./ingest";
import { MAX_STATE_CHARS } from "./types";

export type BundledFile = {
  filename: string;
  text: string;
};

export type BundledDocuments = {
  text: string;
  files: BundledFile[];
  truncated: boolean;
};

function fileHeader(filename: string): string {
  return `===== ${filename} =====\n`;
}

export function bundleDocuments(
  files: readonly BundledFile[],
  maxChars = MAX_STATE_CHARS,
): BundledDocuments {
  if (files.length === 0) return { text: "", files: [], truncated: false };
  const only = files[0];
  if (files.length === 1 && only) {
    const clipped = truncateToBudget(only.text, Math.max(0, maxChars));
    return {
      text: clipped.text,
      files: [{ filename: only.filename, text: clipped.text }],
      truncated: clipped.truncated,
    };
  }

  const overhead = files.reduce((sum, file, index) => {
    return sum + fileHeader(file.filename).length + (index === 0 ? 0 : 2);
  }, 0);
  const budget = Math.max(0, maxChars - overhead);
  const shares = files.map(() => 0);
  let left = budget;
  while (left > 0) {
    const open = files.filter(
      (file, index) => file.text.length > shares[index]!,
    ).length;
    if (open === 0) break;
    const share = Math.max(1, Math.floor(left / open));
    let used = 0;
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      if (!file || shares[index]! >= file.text.length) continue;
      const take = Math.min(
        file.text.length - shares[index]!,
        share,
        left - used,
      );
      if (take <= 0) continue;
      shares[index] = shares[index]! + take;
      used += take;
    }
    if (used === 0) break;
    left -= used;
  }

  const clippedFiles = files.map((file, index) => ({
    filename: file.filename,
    text: file.text.slice(0, shares[index] ?? 0),
  }));
  const truncated = files.some(
    (file, index) => file.text.length > (shares[index] ?? 0),
  );
  const text = clippedFiles
    .map((file) => `${fileHeader(file.filename)}${file.text}`)
    .join("\n\n");
  if (text.length <= maxChars) return { text, files: clippedFiles, truncated };
  return {
    text: truncateToBudget(text, maxChars).text,
    files: clippedFiles,
    truncated: true,
  };
}
