import { STRENGTH_CRITERIA, type QuestionDraft } from "./types";
import { isOverviewQuestion, isTopicQuestion } from "./exam";

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

export function needsWebEvidence(question: string, document?: string): boolean {
  if (!document?.trim()) return true;
  if (asksAboutAttachment(question)) return false;
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
