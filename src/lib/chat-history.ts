import type { ChatItem } from "@/components/ChatThread";
import { parseAttachedImage, type DocumentContext } from "@/core/types";

export const HISTORY_KEY = "chatjev.history";
export const MAX_CHATS = 40;
const TITLE_MAX = 80;

export type StoredChat = {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatItem[];
  document: DocumentContext | null;
};

export type ChatHistory = {
  activeId: string | null;
  chats: StoredChat[];
};

export type HistoryStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const EMPTY: ChatHistory = { activeId: null, chats: [] };

export function chatTitle(messages: ChatItem[]): string {
  const first = messages.find((message) => message.role === "user");
  if (!first || first.role !== "user") return "New chat";
  const text = first.text.replace(/\s+/g, " ").trim();
  if (!text) return "New chat";
  if (text.length <= TITLE_MAX) return text;
  return `${text.slice(0, TITLE_MAX - 1).trimEnd()}…`;
}

export function prepareHistory(history: ChatHistory): ChatHistory {
  const chats = history.chats
    .filter((chat) => chat.messages.length > 0)
    .map((chat) => ({ ...chat, title: chatTitle(chat.messages) }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_CHATS);
  const activeId = chats.some((chat) => chat.id === history.activeId)
    ? history.activeId
    : null;
  return { activeId, chats };
}

export function loadHistory(storage: HistoryStorage): ChatHistory {
  try {
    const raw = storage.getItem(HISTORY_KEY);
    if (!raw) return EMPTY;
    return prepareHistory(parseHistory(JSON.parse(raw)));
  } catch {
    return EMPTY;
  }
}

export function saveHistory(
  history: ChatHistory,
  storage: HistoryStorage,
): ChatHistory {
  let next = prepareHistory(history);
  while (next.chats.length > 0) {
    try {
      storage.setItem(HISTORY_KEY, JSON.stringify(next));
      return next;
    } catch (error) {
      if (!isQuotaError(error) || next.chats.length === 1) return next;
      const chats = next.chats.slice(0, -1);
      next = {
        activeId: chats.some((chat) => chat.id === next.activeId)
          ? next.activeId
          : null,
        chats,
      };
    }
  }
  try {
    storage.removeItem(HISTORY_KEY);
  } catch {
    return next;
  }
  return next;
}

export function saveChat(history: ChatHistory, chat: StoredChat): ChatHistory {
  const stored = { ...chat, title: chatTitle(chat.messages) };
  return prepareHistory({
    activeId: stored.messages.length > 0 ? stored.id : history.activeId,
    chats: [stored, ...history.chats.filter((item) => item.id !== stored.id)],
  });
}

export function appendMessage(
  history: ChatHistory,
  chatId: string,
  message: ChatItem,
  now = Date.now(),
): ChatHistory {
  let found = false;
  const chats = history.chats.map((chat) => {
    if (chat.id !== chatId) return chat;
    found = true;
    const messages = [...chat.messages, message];
    return {
      ...chat,
      messages,
      title: chatTitle(messages),
      updatedAt: now,
    };
  });
  if (!found) return history;
  return prepareHistory({ ...history, chats });
}

export function setChatDocument(
  history: ChatHistory,
  chatId: string,
  document: DocumentContext | null,
  now = Date.now(),
): ChatHistory {
  return prepareHistory({
    ...history,
    chats: history.chats.map((chat) =>
      chat.id === chatId ? { ...chat, document, updatedAt: now } : chat,
    ),
  });
}

export function deleteChat(history: ChatHistory, chatId: string): ChatHistory {
  const chats = history.chats.filter((chat) => chat.id !== chatId);
  return {
    activeId: history.activeId === chatId ? null : history.activeId,
    chats,
  };
}

function parseHistory(value: unknown): ChatHistory {
  if (!value || typeof value !== "object") return EMPTY;
  const record = value as { activeId?: unknown; chats?: unknown };
  const chats = Array.isArray(record.chats)
    ? record.chats.flatMap((chat) => {
        const parsed = parseChat(chat);
        return parsed ? [parsed] : [];
      })
    : [];
  const activeId = typeof record.activeId === "string" ? record.activeId : null;
  return { activeId, chats };
}

function parseChat(value: unknown): StoredChat | null {
  if (!value || typeof value !== "object") return null;
  const chat = value as Partial<StoredChat>;
  if (typeof chat.id !== "string" || typeof chat.updatedAt !== "number") {
    return null;
  }
  if (!Array.isArray(chat.messages)) return null;
  const messages = chat.messages.filter(isChatItem);
  const document = chat.document == null ? null : parseDocument(chat.document);
  if (chat.document != null && !document) return null;
  return {
    id: chat.id,
    title: typeof chat.title === "string" ? chat.title : chatTitle(messages),
    updatedAt: chat.updatedAt,
    messages,
    document,
  };
}

function parseDocument(value: unknown): DocumentContext | null {
  if (!value || typeof value !== "object") return null;
  const document = value as Partial<DocumentContext>;
  if (
    typeof document.id !== "string" ||
    typeof document.filename !== "string" ||
    typeof document.mimeType !== "string" ||
    typeof document.text !== "string" ||
    typeof document.charCount !== "number" ||
    typeof document.truncated !== "boolean"
  ) {
    return null;
  }
  const image = parseAttachedImage(document.image);
  return {
    id: document.id,
    filename: document.filename,
    mimeType: document.mimeType,
    text: document.text,
    charCount: document.charCount,
    truncated: document.truncated,
    ...(image ? { image } : {}),
  };
}

function isChatItem(value: unknown): value is ChatItem {
  if (!value || typeof value !== "object") return false;
  const item = value as { id?: unknown; role?: unknown };
  if (typeof item.id !== "string") return false;
  if (item.role === "user") {
    return typeof (value as { text?: unknown }).text === "string";
  }
  if (item.role !== "assistant") return false;
  const result = (value as { result?: unknown }).result;
  if (!result || typeof result !== "object") return false;
  const answer = result as {
    kind?: unknown;
    question?: unknown;
    message?: unknown;
    judgments?: unknown;
    sources?: unknown;
  };
  if (
    typeof answer.question !== "string" ||
    typeof answer.message !== "string"
  ) {
    return false;
  }
  if (answer.kind === "refusal") return true;
  return (
    answer.kind === "verdict" &&
    Array.isArray(answer.judgments) &&
    Array.isArray(answer.sources)
  );
}

function isQuotaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  const code = "code" in error ? error.code : undefined;
  return name === "QuotaExceededError" || code === 22;
}
