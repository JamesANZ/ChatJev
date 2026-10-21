"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import type { ChatTurn, DocumentContext } from "@/core/types";
import { askAttachedDocument, uploadDocument } from "@/lib/client";
import {
  appendMessage,
  deleteChat,
  loadHistory,
  saveChat,
  saveHistory,
  setChatDocument,
  type ChatHistory,
} from "@/lib/chat-history";
import { ChatThread, type ChatItem } from "./ChatThread";
import { AnswerSource } from "./VerdictCard";
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

const EMPTY_HISTORY: ChatHistory = { activeId: null, chats: [] };

function nextId(): string {
  return crypto.randomUUID();
}

function priorTurns(messages: ChatItem[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      const text = message.text.trim();
      if (text) turns.push({ role: "user", text });
      continue;
    }
    const text = message.result.message.trim();
    if (text) turns.push({ role: "assistant", text });
  }
  return turns;
}

function hasFiles(event: DragEvent) {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

function useDesktopLayout() {
  const [desktop, setDesktop] = useState(true);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 641px)");
    const update = () => setDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return desktop;
}

export function ChatApp() {
  const [history, setHistory] = useState<ChatHistory>(EMPTY_HISTORY);
  const [draftDocument, setDraftDocument] = useState<DocumentContext | null>(
    null,
  );
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingChatId, setPendingChatId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [setupNotices, setSetupNotices] = useState<string[]>([]);
  const [askNotice, setAskNotice] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [composerSeed, setComposerSeed] = useState<{
    id: number;
    text: string;
  } | null>(null);
  const desktop = useDesktopLayout();
  const stageRef = useRef<HTMLDivElement>(null);

  const active =
    history.chats.find((chat) => chat.id === history.activeId) ?? null;
  const messages = active?.messages ?? [];
  const document = active ? active.document : draftDocument;

  useEffect(() => {
    setHistory(loadHistory(window.localStorage));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveHistory(history, window.localStorage);
  }, [history, hydrated]);

  useEffect(() => {
    if (!sidebarOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setSidebarOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

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
    if (busy) return;
    const chatId = active?.id ?? null;
    setError(null);
    setBusy(true);
    try {
      const uploaded = await uploadDocument(file);
      if (chatId) {
        setHistory((current) => setChatDocument(current, chatId, uploaded));
      } else {
        setDraftDocument(uploaded);
      }
      setAskNotice(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not attach that document.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onSend(question: string) {
    if (busy) return;
    const chatId = active?.id ?? nextId();
    const attached = document;
    const prior = priorTurns(messages);
    const userMessage: ChatItem = {
      id: nextId(),
      role: "user",
      text: question,
    };
    setError(null);
    setHistory((current) => {
      const open =
        current.chats.find((chat) => chat.id === current.activeId) ?? null;
      return saveChat(current, {
        id: open?.id ?? chatId,
        title: "",
        updatedAt: Date.now(),
        messages: [...(open?.messages ?? []), userMessage],
        document: open ? open.document : attached,
      });
    });
    setDraftDocument(null);
    setPendingChatId(chatId);
    setBusy(true);
    try {
      const result = await askAttachedDocument(attached, question, prior);
      setAskNotice(result.kind === "verdict" ? (result.warning ?? null) : null);
      setHistory((current) =>
        appendMessage(current, chatId, {
          id: nextId(),
          role: "assistant",
          result,
        }),
      );
    } catch (err) {
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
      setBusy(false);
      setPendingChatId((current) => (current === chatId ? null : current));
    }
  }

  function onNewChat() {
    setHistory((current) => ({ ...current, activeId: null }));
    setDraftDocument(null);
    setError(null);
    setAskNotice(null);
    setSidebarOpen(false);
  }

  function onSelectChat(chatId: string) {
    setHistory((current) => ({ ...current, activeId: chatId }));
    setDraftDocument(null);
    setError(null);
    setAskNotice(null);
    setSidebarOpen(false);
  }

  function onDeleteChat(chatId: string) {
    if (history.activeId === chatId) setDraftDocument(null);
    setHistory((current) => deleteChat(current, chatId));
    setError(null);
    setAskNotice(null);
  }

  function onClearDocument() {
    if (active) {
      const chatId = active.id;
      setHistory((current) => setChatDocument(current, chatId, null));
    } else {
      setDraftDocument(null);
    }
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
  const hasHistory = history.chats.length > 0;

  return (
    <main
      className="shell"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {hasHistory ? (
        <>
          {sidebarOpen ? (
            <button
              type="button"
              className="sidebar-backdrop"
              aria-label="Close chat history"
              onClick={() => setSidebarOpen(false)}
            />
          ) : null}
          <aside
            className={sidebarOpen ? "sidebar open" : "sidebar"}
            aria-label="Chat history"
            aria-hidden={!desktop && !sidebarOpen}
            inert={!desktop && !sidebarOpen ? true : undefined}
          >
            <div className="sidebar-head">
              <button
                type="button"
                className="text-btn"
                onClick={onNewChat}
                disabled={busy}
              >
                New chat
              </button>
            </div>
            <div className="chat-list">
              {history.chats.map((chat) => (
                <div
                  key={chat.id}
                  className={
                    chat.id === history.activeId
                      ? "chat-row active"
                      : "chat-row"
                  }
                >
                  <button
                    type="button"
                    className="chat-open"
                    title={chat.title}
                    aria-current={
                      chat.id === history.activeId ? "true" : undefined
                    }
                    onClick={() => onSelectChat(chat.id)}
                  >
                    {chat.title}
                  </button>
                  <button
                    type="button"
                    className="chat-delete"
                    aria-label={`Delete ${chat.title}`}
                    disabled={busy}
                    onClick={() => onDeleteChat(chat.id)}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M3.5 3.5 10.5 10.5M10.5 3.5 3.5 10.5"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </aside>
        </>
      ) : null}

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-side">
            {hasHistory ? (
              <button
                type="button"
                className="text-btn chats-toggle"
                onClick={() => setSidebarOpen(true)}
              >
                Chats
              </button>
            ) : null}
          </div>
          <div className="brand">ChatJev</div>
          <div className="topbar-side end">
            {active ? (
              <button
                type="button"
                className="text-btn"
                onClick={onNewChat}
                disabled={busy}
              >
                New chat
              </button>
            ) : null}
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
              <p className="hero-lead">
                Chat with Jev in plain language. It scores sources instead of
                writing the answer, so it typically cannot invent facts.
              </p>
              <ol className="hero-steps">
                <li>
                  <h2>Ask like a normal chatbot</h2>
                  <p>
                    An LLM and a web scraper turn your question into something
                    Jev can judge.
                  </p>
                </li>
                <li>
                  <h2>Give Jev the sources</h2>
                  <p>
                    If a file is missing an answer, ChatJev looks that part up
                    and shows where each answer came from.
                  </p>
                </li>
                <li>
                  <h2>Read the scores back</h2>
                  <p>ChatJev turns Jev’s result into a reply.</p>
                </li>
              </ol>
              <figure className="gap-example">
                <figcaption>
                  Example. capitals.txt states France and Spain. Italy is not
                  in the file, so that answer is marked from the web.
                </figcaption>
                <ul>
                  <li className="answer-row">
                    <span>The capital of France is Paris.</span>
                    <AnswerSource
                      origin={{ kind: "file", title: "capitals.txt" }}
                    />
                  </li>
                  <li className="answer-row">
                    <span>The capital of Spain is Madrid.</span>
                    <AnswerSource
                      origin={{ kind: "file", title: "capitals.txt" }}
                    />
                  </li>
                  <li className="answer-row">
                    <span>The capital of Italy is Rome.</span>
                    <AnswerSource
                      origin={{
                        kind: "web",
                        title: "Italy",
                        url: "https://example.com/italy",
                      }}
                    />
                  </li>
                </ul>
              </figure>
              <div className="suggestions">
                {SUGGESTIONS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className="suggestion"
                    disabled={busy}
                    onClick={() =>
                      setComposerSeed({ id: Date.now(), text: prompt })
                    }
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
                pending={pendingChatId === active?.id}
              />
            </div>
          )}
        </div>

        <div className="dock">
          <div className="dock-inner">
            {error ? <p className="dock-error">{error}</p> : null}
            <MessageInput
              disabled={busy}
              seed={composerSeed}
              placeholder={
                document?.image
                  ? "Ask about this image"
                  : document
                    ? "Ask about this document"
                    : "Message ChatJev"
              }
              attachment={
                document ? (
                  <FileChip session={document} onClear={onClearDocument} />
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
      </div>

      <DropZone active={dragging} />
    </main>
  );
}
