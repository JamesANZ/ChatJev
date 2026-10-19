"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
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

const SUGGESTIONS = [
  "Is this claim supported by recent sources?",
  "What does the evidence actually say?",
  "How confident should I be in this answer?",
];

function nextId(): string {
  return crypto.randomUUID();
}

function hasFiles(event: DragEvent) {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

export function ChatApp() {
  const [document, setDocument] = useState<DocumentContext | null>(null);
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupNotices, setSetupNotices] = useState<string[]>([]);
  const [askNotice, setAskNotice] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const request = useRef(0);

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

  useEffect(() => {
    const node = stageRef.current;
    if (!node || messages.length === 0) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function onFile(file: File) {
    const id = ++request.current;
    setError(null);
    setBusy(true);
    try {
      const uploaded = await uploadDocument(file);
      if (request.current !== id) return;
      setDocument(uploaded);
      setMessages([]);
      setAskNotice(null);
    } catch (err) {
      if (request.current !== id) return;
      setError(
        err instanceof Error ? err.message : "Could not attach that document.",
      );
    } finally {
      if (request.current === id) setBusy(false);
    }
  }

  async function onSend(question: string) {
    const id = ++request.current;
    setError(null);
    setMessages((current) => [
      ...current,
      { id: nextId(), role: "user", text: question },
    ]);
    setBusy(true);
    try {
      const result = await askAttachedDocument(document, question);
      if (request.current !== id) return;
      setAskNotice(result.kind === "verdict" ? (result.warning ?? null) : null);
      setMessages((current) => [
        ...current,
        { id: nextId(), role: "assistant", result },
      ]);
    } catch (err) {
      if (request.current !== id) return;
      const message =
        err instanceof Error
          ? err.message
          : "Jev could not answer that question.";
      const code =
        err instanceof Error && "code" in err ? String(err.code) : "";
      if (
        SETUP_CODES.has(code) ||
        /API_KEY|AI Gateway|not set|web evidence/i.test(message)
      ) {
        setAskNotice(message);
        setError(null);
      } else {
        setError(message);
      }
    } finally {
      if (request.current === id) setBusy(false);
    }
  }

  function onNewChat() {
    request.current += 1;
    setBusy(false);
    setMessages([]);
    setError(null);
    setAskNotice(null);
  }

  function onDragEnter(event: DragEvent<HTMLElement>) {
    if (!hasFiles(event)) return;
    event.preventDefault();
    setDragging(true);
  }

  function onDragOver(event: DragEvent<HTMLElement>) {
    if (!hasFiles(event)) return;
    event.preventDefault();
  }

  function onDragLeave(event: DragEvent<HTMLElement>) {
    if (!hasFiles(event)) return;
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    setDragging(false);
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    if (!hasFiles(event)) return;
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file && !busy) void onFile(file);
  }

  const notices = [...setupNotices, ...(askNotice ? [askNotice] : [])];
  const empty = messages.length === 0;

  return (
    <main
      className="shell"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <header className="topbar">
        <div className="topbar-side" />
        <div className="brand">ChatJev</div>
        <div className="topbar-side end">
          {empty ? null : (
            <button
              type="button"
              className="text-btn"
              onClick={onNewChat}
              disabled={busy}
            >
              New chat
            </button>
          )}
        </div>
      </header>

      {notices.length > 0 ? (
        <div className="banner-wrap">
          <div className="setup-warning" role="alert">
            {notices.map((notice) => (
              <p key={notice}>{notice}</p>
            ))}
          </div>
        </div>
      ) : null}

      <div className="stage" ref={stageRef}>
        {empty ? (
          <div className="hero">
            <h1>What should Jev judge?</h1>
            <p>
              ChatJev lets you chat with Jev like a normal chatbot. An LLM and a
              web scraper turn your question into something Jev can judge, then
              turn Jev’s result back into a reply. Because Jev scores the
              sources instead of writing the answer itself, it typically cannot
              invent facts the way a normal chatbot does.
            </p>
            <p>
              Ask in plain language. If a file does not answer, ChatJev looks
              the question up, gives Jev those sources, and reads the scores
              back.
            </p>
            <div className="suggestions">
              {SUGGESTIONS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="suggestion"
                  disabled={busy}
                  onClick={() => onSend(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="stage-inner">
            <ChatThread
              messages={messages}
              pending={busy && messages.at(-1)?.role === "user"}
            />
          </div>
        )}
      </div>

      <div className="dock">
        <div className="dock-inner">
          {error ? <p className="dock-error">{error}</p> : null}
          <MessageInput
            disabled={busy}
            placeholder={
              document ? "Ask about this document" : "Message ChatJev"
            }
            attachment={
              document ? (
                <FileChip
                  session={document}
                  onClear={() => {
                    request.current += 1;
                    setBusy(false);
                    setDocument(null);
                    setMessages([]);
                    setError(null);
                    setAskNotice(null);
                  }}
                />
              ) : null
            }
            onSend={onSend}
            onFile={onFile}
          />
          <p className="fineprint">
            Jev scores sources. It does not invent the answer.
          </p>
        </div>
      </div>

      <DropZone active={dragging} />
    </main>
  );
}
