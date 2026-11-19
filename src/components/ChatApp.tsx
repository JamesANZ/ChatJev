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
  commitHistory,
  deleteChat,
  loadHistory,
  saveChat,
  setChatDocuments,
  type ChatHistory,
} from "@/lib/chat-history";
import {
  beginAsk,
  beginUpload,
  composerBusy,
  dragEnter,
  dragLeave,
  dragReset,
  finishActivity,
  keepDraftAttachments,
  showPending,
  sidebarMode,
  type ChatActivity,
  type DragPhase,
} from "@/lib/chat-session";
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
  const [activity, setActivity] = useState<ChatActivity>({ status: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [setupNotices, setSetupNotices] = useState<string[]>([]);
  const [askNotice, setAskNotice] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragPhase>({ status: "idle" });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const desktop = useDesktopLayout();
  const stageRef = useRef<HTMLDivElement>(null);
  const activityRef = useRef<ChatActivity>({ status: "idle" });
  const dragRef = useRef<DragPhase>({ status: "idle" });

  const active =
    history.chats.find((chat) => chat.id === history.activeId) ?? null;
  const messages = active?.messages ?? [];
  const documents = active ? active.documents : draftDocuments;
  const busy = composerBusy(activity);
  const sidebar = sidebarMode({
    hasHistory: history.chats.length > 0,
    desktop,
    drawer: sidebarOpen ? "open" : "closed",
  });

  function commitActivity(next: ChatActivity) {
    activityRef.current = next;
    setActivity(next);
  }

  function commitDrag(next: DragPhase) {
    dragRef.current = next;
    setDrag(next);
  }

  useEffect(() => {
    const loaded = loadHistory(window.localStorage);
    setHistory({ ...loaded, activeId: null });
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const saved = commitHistory(history, window.localStorage);
    if (
      saved.persisted &&
      JSON.stringify(saved.history) !== JSON.stringify(history)
    ) {
      setHistory(saved.history);
    }
  }, [history, hydrated]);

  useEffect(() => {
    if (sidebar.kind === "absent" && sidebarOpen) setSidebarOpen(false);
  }, [sidebar.kind, sidebarOpen]);

  const drawerOpen = sidebar.kind === "drawer" && sidebar.open;
  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setSidebarOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

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
    const started = beginUpload(activityRef.current, active?.id ?? null);
    if (!started || files.length === 0) return;
    commitActivity(started);
    const room = MAX_ATTACHMENTS - documents.length;
    if (room <= 0) {
      setError(`Attach up to ${MAX_ATTACHMENTS} files.`);
      commitActivity(finishActivity(activityRef.current, started));
      return;
    }
    const batch = files.slice(0, room);
    const chatId = started.chatId;
    setError(null);
    try {
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
              current.chats.find((chat) => chat.id === chatId)?.documents ??
              [];
            return setChatDocuments(current, chatId, [
              ...existing,
              ...uploaded,
            ]);
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
    } finally {
      commitActivity(finishActivity(activityRef.current, started));
    }
  }

  function onSend(question: string): boolean {
    const chatId = active?.id ?? nextId();
    const started = beginAsk(activityRef.current, chatId);
    if (!started) return false;
    commitActivity(started);
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
    void ask(chatId, started, attached, question, prior);
    return true;
  }

  async function ask(
    chatId: string,
    started: ChatActivity,
    attached: DocumentContext[],
    question: string,
    prior: ChatTurn[],
  ) {
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
      commitActivity(finishActivity(activityRef.current, started));
    }
  }

  function onNewChat() {
    setHistory((current) => ({ ...current, activeId: null }));
    if (!keepDraftAttachments(activityRef.current)) setDraftDocuments([]);
    setError(null);
    setAskNotice(null);
    setSidebarOpen(false);
  }

  function onSelectChat(chatId: string) {
    setHistory((current) => ({ ...current, activeId: chatId }));
    if (!keepDraftAttachments(activityRef.current)) setDraftDocuments([]);
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
    commitDrag(dragEnter(dragRef.current));
  }

  function onDragOver(event: DragEvent<HTMLElement>) {
    if (!hasFiles(event)) return;
    event.preventDefault();
  }

  function onDragLeave(event: DragEvent<HTMLElement>) {
    if (!hasFiles(event)) return;
    const next = event.relatedTarget;
    const inside = next instanceof Node && event.currentTarget.contains(next);
    commitDrag(dragLeave(dragRef.current, inside));
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    if (!hasFiles(event)) return;
    event.preventDefault();
    commitDrag(dragReset());
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length > 0) void onFiles(files);
  }

  function onDragEnd() {
    commitDrag(dragReset());
  }

  const notices = [...setupNotices, ...(askNotice ? [askNotice] : [])];
  const empty = messages.length === 0;
  const hasHistory = sidebar.kind !== "absent";

  return (
    <main
      className="shell"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      {hasHistory ? (
        <>
          {sidebar.kind === "drawer" && sidebar.open ? (
            <button
              type="button"
              className="sidebar-backdrop"
              aria-label="Close chat history"
              onClick={() => setSidebarOpen(false)}
            />
          ) : null}
          <aside
            className={
              sidebar.kind === "drawer" && sidebar.open
                ? "sidebar open"
                : "sidebar"
            }
            aria-label="Chat history"
            aria-hidden={sidebar.kind === "drawer" && !sidebar.open}
            inert={
              sidebar.kind === "drawer" && !sidebar.open ? true : undefined
            }
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
            </div>
          ) : (
            <div className="stage-inner">
              <ChatThread
                messages={messages}
                pending={showPending(activity, active?.id ?? null)}
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
                        locked={busy}
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

      <DropZone active={drag.status === "hovering"} />
    </main>
  );
}
