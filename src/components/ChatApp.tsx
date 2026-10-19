"use client";

import { useState } from "react";
import type { DocumentContext } from "@/core/types";
import { askAttachedDocument, uploadDocument } from "@/lib/client";
import { ChatThread, type ChatItem } from "./ChatThread";
import { DropZone } from "./DropZone";
import { FileChip } from "./FileChip";
import { MessageInput } from "./MessageInput";

function nextId(): string {
  return crypto.randomUUID();
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
      const result = await askAttachedDocument(document, question);
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

  return (
    <main className="app">
      <header className="masthead">
        <h1>ChatJev</h1>
        <p>
          Ask in plain language. ChatJev turns the question into judgments,
          Jev scores them, and you get a short reading of those scores.
        </p>
      </header>

      {document ? (
        <FileChip
          session={document}
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
        pending={busy && messages.at(-1)?.role === "user"}
      />
      {error ? <p className="error">{error}</p> : null}
      <MessageInput disabled={busy} onSend={onSend} />
    </main>
  );
}
