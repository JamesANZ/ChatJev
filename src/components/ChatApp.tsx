"use client";

import { useEffect, useState } from "react";
import type { DocumentContext } from "@/core/types";
import { askAttachedDocument, uploadDocument } from "@/lib/client";
import { ChatThread, type ChatItem } from "./ChatThread";
import { DropZone } from "./DropZone";
import { FileChip } from "./FileChip";
import { MessageInput } from "./MessageInput";

const SETUP_CODES = new Set([
  "missing_api_key",
  "missing_llm_key",
  "missing_search_key",
  "missing_evidence",
]);

function nextId(): string {
  return crypto.randomUUID();
}

export function ChatApp() {
  const [document, setDocument] = useState<DocumentContext | null>(null);
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupNotices, setSetupNotices] = useState<string[]>([]);
  const [askNotice, setAskNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/setup")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { issues?: Array<{ message?: string }> } | null) => {
        if (cancelled || !body?.issues) return;
        setSetupNotices(
          body.issues
            .map((issue) => issue.message)
            .filter((message): message is string => Boolean(message)),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

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
      setAskNotice(result.kind === "verdict" ? (result.warning ?? null) : null);
      setMessages((current) => [
        ...current,
        { id: nextId(), role: "assistant", result },
      ]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Jev could not answer that question.";
      const code = err instanceof Error && "code" in err ? String(err.code) : "";
      if (SETUP_CODES.has(code) || /API_KEY|AI Gateway|not set|web evidence/i.test(message)) {
        setAskNotice(message);
        setError(null);
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app">
      <header className="masthead">
        <h1>ChatJev</h1>
        <p>
          ChatJev lets you chat with Jev like a normal chatbot. An LLM and a web
          scraper turn your question into something Jev can judge, then turn
          Jev’s result back into a reply. Because Jev scores the sources instead
          of writing the answer itself, it typically cannot invent facts the way
          a normal chatbot does.
        </p>
        <p>
          Ask in plain language. If a file does not answer, ChatJev looks the
          question up, gives Jev those sources, and reads the scores back.
        </p>
      </header>

      {setupNotices.length > 0 || askNotice ? (
        <div className="setup-warning" role="alert">
          {[...setupNotices, ...(askNotice ? [askNotice] : [])].map((notice) => (
            <p key={notice}>{notice}</p>
          ))}
        </div>
      ) : null}

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
