import type { DocumentContext, SessionSummary } from "../core/types.js";

export class SessionStore {
  private readonly sessions = new Map<string, DocumentContext>();

  set(document: DocumentContext): SessionSummary {
    this.sessions.set(document.id, document);
    return toSummary(document);
  }

  get(id: string): DocumentContext | undefined {
    return this.sessions.get(id);
  }

  summary(id: string): SessionSummary | undefined {
    const document = this.sessions.get(id);
    return document ? toSummary(document) : undefined;
  }
}

export function toSummary(document: DocumentContext): SessionSummary {
  return {
    id: document.id,
    filename: document.filename,
    mimeType: document.mimeType,
    charCount: document.charCount,
    truncated: document.truncated,
  };
}
