"use client";

import { useState } from "react";
import type { DocumentContext } from "@/core/types";
import { askQuestion, uploadDocument } from "@/lib/client";
import { ChatThread, type ChatItem } from "./ChatThread";
import { DropZone } from "./DropZone";
import { FileChip } from "./FileChip";
import { MessageInput } from "./MessageInput";

function nextId(): string {
  return crypto.randomUUID();
}

function pendingLabel(
  busy: boolean,
  last?: ChatItem,
  document?: DocumentContext | null,
): string | undefined {
  if (!busy || last?.role !== "user") return undefined;
  return document
    ? "Jev is judging the document…"
    : "Searching the web, then asking Jev…";
}

export function ChatApp() {
  const [document, setDocument] = useState<DocumentContext | null>(null);
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File) {
    setError(null);
    setBusy(true);
    try {
      setDocument(await uploadDocument(file));
      setMessages([]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not attach that document.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onSend(question: string) {
    setError(null);
    setMessages((current) => [
      ...current,
      { id: nextId(), role: "user", text: question },
    ]);
    setBusy(true);
    try {
      const result = await askQuestion(question, document ?? undefined);
      if (result.kind === "verdict" && result.evidence.origin === "web" && !document) {
        setDocument({
          id: crypto.randomUUID(),
          filename: "Web search",
          mimeType: "text/plain",
          text: result.evidence.text,
          charCount: result.evidence.text.length,
          truncated: result.evidence.truncated,
        });
      }
      setMessages((current) => [
        ...current,
        { id: nextId(), role: "assistant", result },
      ]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Jev could not answer that question.",
      );
    } finally {
      setBusy(false);
    }
  }

  const last = messages.at(-1);

  return (
    <main className="app">
      <header className="masthead">
        <h1>ChatJev</h1>
        <p>
          Ask a closed question the way you would prompt an LLM. ChatJev
          screens the prompt, searches the web if no document is attached, and
          lets Jev return a probability — not an essay. Open-ended prompts fall
          through to an LLM when one is configured.
        </p>
      </header>

      {document ? (
        <FileChip
          session={{
            ...document,
            filename:
              document.filename === "Web search"
                ? "Web search (pinned for follow-ups)"
                : document.filename,
          }}
          onClear={() => {
            setDocument(null);
            setMessages([]);
            setError(null);
          }}
        />
      ) : (
        <DropZone disabled={busy} onFile={onFile} />
      )}

      <ChatThread
        messages={messages}
        pending={pendingLabel(busy, last, document)}
      />
      {error ? <p className="error">{error}</p> : null}
      <MessageInput disabled={busy} onSend={onSend} />

      <details className="howto">
        <summary>How ChatJev decides</summary>
        <ul>
          <li>
            <b>Injection screen.</b> Jev scores whether the prompt is trying to
            override instructions. A single noul is not a security boundary for
            irreversible actions — here it only blocks the chat turn.
          </li>
          <li>
            <b>Jev-first router.</b> Closed judgments stay with Jev. Summaries,
            rewrites, and other prose go to an LLM only if{" "}
            <code>AI_GATEWAY_API_KEY</code> or <code>OPENAI_API_KEY</code> is
            set.
          </li>
          <li>
            <b>Photos and audio.</b> Jev is text-only. Attach a transcript or
            caption; do not upload images or recordings.
          </li>
        </ul>
      </details>
    </main>
  );
}
