import { isOverviewQuestion, isTopicQuestion } from "./exam";
import {
  STRENGTH_CRITERIA,
  type AnswerOrigin,
  type QuestionDraft,
  type SourceSnippet,
} from "./types";

const ATTACHMENT =
  /\b(this|the|attached|uploaded)\b(?:\s+\w+){0,3}\s+(document|file|pdf|attachment|text|paper|contract)\b/i;

const STOP = new Set([
  "this",
  "that",
  "with",
  "from",
  "about",
  "does",
  "have",
  "what",
  "when",
  "where",
  "which",
  "would",
  "could",
  "should",
  "there",
  "their",
  "into",
  "than",
  "then",
  "them",
  "they",
  "your",
  "been",
  "were",
  "also",
  "only",
  "such",
  "some",
  "more",
  "most",
  "very",
  "just",
  "like",
  "name",
  "between",
  "document",
  "file",
  "attached",
  "strongly",
  "suggest",
]);

export function contentTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3 && !STOP.has(word));
}

const WHICH_FILE =
  /\b(?:which|what)\s+(?:of\s+(?:these|those|the|them)\s+)?(?:documents?|files?|attachments?|pdfs?|ones?)\b/i;
const EVERY_FILE =
  /\b(?:each|every|all|both)\s+(?:of\s+)?(?:the\s+)?(?:documents?|files?|attachments?)\b/i;
const COMPARE_FILES =
  /\b(?:compare|comparison|difference between)\b[\s\S]{0,80}\b(?:documents?|files?|attachments?|them|these)\b|\b(?:documents?|files?|attachments?|them|these)\b[\s\S]{0,40}\b(?:compare|comparison|difference between)\b/i;

export function asksToCompareDocuments(question: string): boolean {
  const trimmed = question.trim();
  if (!trimmed) return false;
  return (
    WHICH_FILE.test(trimmed) ||
    EVERY_FILE.test(trimmed) ||
    COMPARE_FILES.test(trimmed)
  );
}

const CLAIM_NOISE =
  /\b(?:in|from|among)\s+(?:it|them|these|those|the\s+(?:documents?|files?|attachments?))\s*$/i;

function cleanClaim(value: string): string {
  return value
    .replace(/[?.!]+$/g, "")
    .replace(CLAIM_NOISE, "")
    .replace(/^["“]+|["”]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function fileClaim(question: string): string | null {
  const patterns = [
    {
      pattern: /\babout\s+(.+)$/i,
      format: (value: string) => `is about ${value}.`,
    },
    {
      pattern:
        /\b(?:has\s+)?(?:references?\s+to|refers\s+to|mentions?|contains?|includes?|names?|discusses?)\s+(.+)$/i,
      format: (value: string) => `mentions ${value}.`,
    },
  ];
  let best: { index: number; claim: string } | null = null;
  for (const item of patterns) {
    const match = item.pattern.exec(question);
    const captured = match?.[1];
    if (!match || match.index < 0 || !captured) continue;
    const cleaned = cleanClaim(captured);
    if (!cleaned) continue;
    if (!best || match.index < best.index) {
      best = { index: match.index, claim: item.format(cleaned) };
    }
  }
  return best?.claim ?? null;
}

export function compareDocumentDrafts(
  question: string,
  files: ReadonlyArray<{ filename: string }>,
): QuestionDraft[] | null {
  if (files.length < 2 || !asksToCompareDocuments(question)) return null;
  const claim = fileClaim(question);
  if (!claim) return null;
  const used = new Set<string>();
  return files.slice(0, 5).map((file) => {
    const filename = file.filename.trim() || "file";
    const stem = filename.replace(/\.[^.]+$/, "") || filename;
    return {
      key: draftKey(stem, used),
      type: "noul" as const,
      instructions: `${filename} ${claim}`.replace(/\s+/g, " ").slice(0, 400),
    };
  });
}

export function asksAboutAttachment(question: string): boolean {
  const trimmed = question.trim();
  if (!trimmed) return false;
  if (isTopicQuestion(trimmed) || isOverviewQuestion(trimmed)) return true;
  if (ATTACHMENT.test(trimmed)) return true;
  if (
    /\b(name|named|called|mention|mentions|include|includes|contain|contains)\b/i.test(
      trimmed,
    ) &&
    contentTokens(trimmed).length < 2
  ) {
    return true;
  }
  return false;
}

export function documentCovers(question: string, document: string): boolean {
  const tokens = contentTokens(question);
  if (tokens.length === 0) return Boolean(document.trim());
  const haystack = document.toLowerCase();
  const hits = tokens.filter((token) => haystack.includes(token)).length;
  return hits / tokens.length >= 0.6;
}

const NAME = /^[A-Za-z][\w'’.-]*$/;

function subjectFromWords(words: string[]): string | undefined {
  const cleaned = words.map((word) => word.replace(/[?.!,;:]+$/g, ""));
  if (cleaned.length === 0 || cleaned.length > 3) return undefined;
  if (!cleaned.every((word) => NAME.test(word))) return undefined;
  const text = cleaned.join(" ");
  if (text.length < 3) return undefined;
  if (
    cleaned.length > 1 &&
    cleaned.some((word) => word[0] !== word[0]?.toUpperCase())
  ) {
    return undefined;
  }
  return text;
}

function listPieces(question: string): string[] {
  const cleaned = question.replace(/[?.!]+$/g, "").trim();
  const commaParts = cleaned
    .split(/\s*,\s*/)
    .map((piece) => piece.trim())
    .filter(Boolean);
  const last = commaParts.at(-1) ?? "";
  const andParts = last
    .split(/\s*\band\b\s+/i)
    .map((piece) => piece.trim())
    .filter(Boolean);
  return [...commaParts.slice(0, -1), ...andParts];
}

export function listedSubjects(question: string): string[] {
  const pieces = listPieces(question);
  if (pieces.length < 2 || pieces.length > 5) return [];

  const lead = pieces[0]?.split(/\s+/) ?? [];
  let head: string | undefined;
  for (let size = Math.min(3, lead.length); size >= 1; size -= 1) {
    const candidate = subjectFromWords(lead.slice(-size));
    if (candidate) {
      head = candidate;
      break;
    }
  }
  if (!head) return [];

  const tail: string[] = [];
  for (const piece of pieces.slice(1)) {
    const subject = subjectFromWords(piece.split(/\s+/));
    if (!subject) return [];
    tail.push(subject);
  }
  return [head, ...tail];
}

export function missingSubjects(question: string, document: string): string[] {
  const haystack = document.toLowerCase();
  return listedSubjects(question).filter(
    (subject) => !haystack.includes(subject.toLowerCase()),
  );
}

function passageAbout(text: string, subject: string): string | undefined {
  const needle = subject.toLowerCase();
  const chunks = text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((chunk) => chunk.replace(/\s+/g, " ").trim())
    .filter(
      (chunk) => chunk && !/^url:/i.test(chunk) && !/^\[\d+\]/.test(chunk),
    );
  return chunks.find((chunk) => {
    if (!chunk.toLowerCase().includes(needle)) return false;
    const rest = chunk
      .toLowerCase()
      .replace(needle, "")
      .replace(/[^a-z0-9]+/g, "");
    return rest.length >= 8;
  });
}

function draftKey(subject: string, used: Set<string>): string {
  const base =
    subject
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^[^a-z]+/, "")
      .slice(0, 40) || "answer";
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  for (let index = 2; index < 20; index += 1) {
    const suffix = `_${index}`;
    const candidate = `${base.slice(0, 40 - suffix.length)}${suffix}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  return base;
}

export function gapFillDrafts(input: {
  question: string;
  document: string;
  sourcesText: string;
}): QuestionDraft[] | null {
  if (asksAboutAttachment(input.question)) return null;
  const subjects = listedSubjects(input.question);
  const missing = new Set(
    missingSubjects(input.question, input.document).map((subject) =>
      subject.toLowerCase(),
    ),
  );
  if (subjects.length < 2 || missing.size === 0) return null;
  if (missing.size === subjects.length) return null;

  const used = new Set<string>();
  const drafts: QuestionDraft[] = [];
  let fromFile = 0;
  let fromWeb = 0;
  for (const subject of subjects) {
    const filePassage = passageAbout(input.document, subject);
    const webPassage = filePassage
      ? undefined
      : passageAbout(input.sourcesText, subject);
    const instructions = (filePassage ?? webPassage)?.slice(0, 400);
    if (!instructions) continue;
    if (filePassage) fromFile += 1;
    else fromWeb += 1;
    drafts.push({
      key: draftKey(subject, used),
      type: "noul",
      instructions,
    });
  }
  if (fromFile === 0 || fromWeb === 0 || drafts.length < 2) return null;
  return drafts;
}

export function attributeAnswer(input: {
  text: string;
  filename?: string;
  document?: string;
  documents?: ReadonlyArray<{ filename: string; text: string }>;
  snippets: SourceSnippet[];
}): AnswerOrigin | undefined {
  const tokens = contentTokens(input.text);
  if (tokens.length === 0) return undefined;
  const score = (haystack: string) => {
    const lower = haystack.toLowerCase();
    const hits = tokens.filter((token) => lower.includes(token)).length;
    return hits / tokens.length;
  };
  const files = input.documents?.length
    ? input.documents
    : input.document
      ? [{ filename: input.filename ?? "your file", text: input.document }]
      : [];
  const named = files.filter(
    (file) => file.filename && input.text.includes(file.filename),
  );
  if (named.length === 1 && named[0]?.filename.trim()) {
    return { kind: "file", title: named[0].filename.trim() };
  }
  let fileScore = 0;
  let fileTitle = input.filename?.trim() || "your file";
  for (const file of files) {
    if (!file.text.trim()) continue;
    const value = score(file.text);
    if (value > fileScore) {
      fileScore = value;
      fileTitle = file.filename.trim() || "your file";
    }
  }
  let bestScore = 0;
  let bestSnippet: SourceSnippet | undefined;
  for (const snippet of input.snippets) {
    const value = score(`${snippet.title}\n${snippet.excerpt}`);
    if (value > bestScore) {
      bestScore = value;
      bestSnippet = snippet;
    }
  }
  if (
    fileScore >= 0.6 &&
    fileScore >= bestScore &&
    files.some((file) => file.text.trim())
  ) {
    return { kind: "file", title: fileTitle };
  }
  if (bestSnippet && bestScore >= 0.6 && bestScore > fileScore) {
    return { kind: "web", title: bestSnippet.title, url: bestSnippet.url };
  }
  return undefined;
}

export function needsWebEvidence(
  question: string,
  document?: string,
  options?: { image?: boolean; fileCount?: number },
): boolean {
  if (options?.image) return false;
  if ((options?.fileCount ?? 0) > 1 && asksToCompareDocuments(question)) {
    return false;
  }
  if (!document?.trim()) return true;
  if (asksAboutAttachment(question)) return false;
  if (missingSubjects(question, document).length > 0) return true;
  return !documentCovers(question, document);
}

export function claimProposition(question: string): string {
  const stripped = question
    .trim()
    .replace(/\?+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const match = stripped.match(/^(is|was)\s+(.+?)\s+(a|an|the)\s+(.+)$/i);
  if (match?.[1] && match[2] && match[3] && match[4]) {
    const sentence = `${match[2].charAt(0).toUpperCase()}${match[2].slice(1)} ${match[1].toLowerCase()} ${match[3].toLowerCase()} ${match[4]}.`;
    return sentence.slice(0, 400);
  }
  return stripped.slice(0, 400);
}

export function webClaimDrafts(question: string): QuestionDraft[] {
  return [
    {
      key: "proposition",
      type: "noul",
      instructions: claimProposition(question),
    },
    {
      key: "relation",
      type: "choice",
      instructions: "How does the evidence relate to the user's proposition?",
      criteria: {
        supported: "The evidence supports it",
        contradicted: "The evidence contradicts it",
        not_mentioned: "The evidence does not address it",
      },
    },
    {
      key: "strength",
      type: "score",
      instructions: "How strong is the evidence for that relation?",
      criteria: [...STRENGTH_CRITERIA],
    },
  ];
}
