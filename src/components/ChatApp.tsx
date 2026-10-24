"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import {
  MAX_ATTACHMENTS,
  type ChatTurn,
  type DocumentContext,
} from "@/core/types";
import { askAttachedDocument, uploadDocument } from "@/lib/client";
import {
  appendMessage,
  deleteChat,
  loadHistory,
  saveChat,
  saveHistory,
  setChatDocuments,
  type ChatHistory,
} from "@/lib/chat-history";
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
  const [draftDocuments, setDraftDocuments] = useState<DocumentContext[]>([]);
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
  const documents = active ? active.documents : draftDocuments;

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

  async function onFiles(files: File[]) {
    if (busy || files.length === 0) return;
    const room = MAX_ATTACHMENTS - documents.length;
    if (room <= 0) {
      setError(`Attach up to ${MAX_ATTACHMENTS} files.`);
      return;
    }
    const batch = files.slice(0, room);
    const chatId = active?.id ?? null;
    setError(null);
    setBusy(true);
    const settled = await Promise.allSettled(
      batch.map((file) => uploadDocument(file)),
    );
    const uploaded = settled.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    const failure = settled.find((result) => result.status === "rejected");
    if (uploaded.length > 0) {
      if (chatId) {
        setHistory((current) => {
          const existing =
            current.chats.find((chat) => chat.id === chatId)?.documents ?? [];
          return setChatDocuments(current, chatId, [...existing, ...uploaded]);
        });
      } else {
        setDraftDocuments((current) => [...current, ...uploaded]);
      }
      setAskNotice(null);
    }
    const notes: string[] = [];
    if (files.length > room) {
      notes.push(
        `Attach up to ${MAX_ATTACHMENTS} files. Extra files were left out.`,
      );
    }
    if (failure?.status === "rejected") {
      notes.push(
        failure.reason instanceof Error
          ? failure.reason.message
          : "Could not attach that document.",
      );
    }
    setError(notes.join(" ") || null);
    setBusy(false);
  }

  async function onSend(question: string) {
    if (busy) return;
    const chatId = active?.id ?? nextId();
    const attached = documents;
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
        documents: open ? open.documents : attached,
      });
    });
    setDraftDocuments([]);
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
    setDraftDocuments([]);
    setError(null);
    setAskNotice(null);
    setSidebarOpen(false);
  }

  function onSelectChat(chatId: string) {
    setHistory((current) => ({ ...current, activeId: chatId }));
    setDraftDocuments([]);
    setError(null);
    setAskNotice(null);
    setSidebarOpen(false);
  }

  function onDeleteChat(chatId: string) {
    if (history.activeId === chatId) setDraftDocuments([]);
    setHistory((current) => deleteChat(current, chatId));
    setError(null);
    setAskNotice(null);
  }

  function onRemoveDocument(id: string) {
    if (active) {
      const chatId = active.id;
      setHistory((current) =>
        setChatDocuments(
          current,
          chatId,
          (
            current.chats.find((chat) => chat.id === chatId)?.documents ?? []
          ).filter((item) => item.id !== id),
        ),
      );
    } else {
      setDraftDocuments((current) => current.filter((item) => item.id !== id));
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
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length > 0 && !busy) void onFiles(files);
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
                    Attach one or more files. If they miss an answer, ChatJev
                    looks that part up and shows where each answer came from.
                  </p>
                </li>
                <li>
                  <h2>Read the scores back</h2>
                  <p>ChatJev turns Jev’s result into a reply.</p>
                </li>
              </ol>
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
                documents.length > 1
                  ? "Ask about these files"
                  : documents[0]?.image
                    ? "Ask about this image"
                    : documents[0]
                      ? "Ask about this document"
                      : "Message ChatJev"
              }
              attachment={
                documents.length > 0
                  ? documents.map((item) => (
                      <FileChip
                        key={item.id}
                        session={item}
                        onClear={() => onRemoveDocument(item.id)}
                      />
                    ))
                  : null
              }
              onSend={onSend}
              onFile={onFiles}
            />
          </div>
        </div>
      </div>

      <DropZone active={dragging} />
    </main>
  );
}
