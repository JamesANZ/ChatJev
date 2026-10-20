import { describe, expect, it } from "vitest";
import type { ChatItem } from "../src/components/ChatThread";
import type { DocumentContext } from "../src/core/types";
import {
  HISTORY_KEY,
  MAX_CHATS,
  type ChatHistory,
  type HistoryStorage,
  type StoredChat,
  loadHistory,
  saveHistory,
} from "../src/lib/chat-history";

const document: DocumentContext = {
  id: "doc-1",
  filename: "notes.txt",
  mimeType: "text/plain",
  text: "The notes.",
  charCount: 10,
  truncated: false,
};

function user(id: string, text: string): ChatItem {
  return { id, role: "user", text };
}

function reply(id: string, question: string): ChatItem {
  return {
    id,
    role: "assistant",
    result: {
      kind: "verdict",
      question,
      message: "Scored.",
      narration: null,
      judgments: [],
      sources: [],
      evidenceTruncated: false,
      model: "demo",
      usage: { input_tokens: 1, output_tokens: 1 },
      answers: {},
    },
  };
}

function chat(
  id: string,
  text: string,
  updatedAt: number,
  extra?: Partial<StoredChat>,
): StoredChat {
  return {
    id,
    title: "placeholder",
    updatedAt,
    document: null,
    ...extra,
    messages: extra?.messages ?? [user(`${id}-q`, text)],
  };
}

function memoryStorage(maxBytes?: number): HistoryStorage & { raw(): string | null } {
  let value: string | null = null;
  return {
    getItem(key) {
      return key === HISTORY_KEY ? value : null;
    },
    setItem(key, next) {
      if (key !== HISTORY_KEY) return;
      if (maxBytes != null && next.length > maxBytes) {
        const error = new Error("quota");
        error.name = "QuotaExceededError";
        throw error;
      }
      value = next;
    },
    removeItem(key) {
      if (key === HISTORY_KEY) value = null;
    },
    raw: () => value,
  };
}

describe("chat history", () => {
  it("round-trips the open chat, messages, and attached document", () => {
    const storage = memoryStorage();
    const history: ChatHistory = {
      activeId: "one",
      chats: [
        chat("one", "Is this claim supported?", 20, {
          messages: [
            user("q1", "Is this claim supported?"),
            reply("a1", "Is this claim supported?"),
          ],
          document,
        }),
      ],
    };

    expect(saveHistory(history, storage)).toMatchObject({
      activeId: "one",
      chats: [
        {
          id: "one",
          title: "Is this claim supported?",
          document,
          messages: history.chats[0]?.messages,
        },
      ],
    });
    expect(loadHistory(storage)).toEqual(saveHistory(history, storage));
  });

  it("keeps an attached image on the open chat", () => {
    const storage = memoryStorage();
    const photo: DocumentContext = {
      ...document,
      filename: "door.jpg",
      mimeType: "image/jpeg",
      text: "Attached image: door.jpg (280×280).",
      image: {
        format: "jpg",
        dataBase64: "abc",
        width: 280,
        height: 280,
      },
    };
    const history: ChatHistory = {
      activeId: "one",
      chats: [chat("one", "Is there a person?", 2, { document: photo })],
    };

    expect(saveHistory(history, storage).chats[0]?.document?.image).toEqual(
      photo.image,
    );
    expect(loadHistory(storage).chats[0]?.document).toEqual(photo);
  });

  it("titles a chat from the first user message", () => {
    const storage = memoryStorage();
    const saved = saveHistory(
      {
        activeId: "one",
        chats: [
          chat("one", "", 1, {
            messages: [
              user("q1", "  First\nquestion  "),
              reply("a1", "First question"),
              user("q2", "A later question"),
            ],
          }),
        ],
      },
      storage,
    );

    expect(saved.chats[0]?.title).toBe("First question");
  });

  it("skips chats that have no messages", () => {
    const storage = memoryStorage();
    const saved = saveHistory(
      {
        activeId: "blank",
        chats: [
          chat("blank", "", 5, { messages: [] }),
          chat("kept", "Keep this", 1),
        ],
      },
      storage,
    );

    expect(saved.activeId).toBeNull();
    expect(saved.chats.map((item) => item.id)).toEqual(["kept"]);
    expect(loadHistory(storage).chats).toHaveLength(1);
  });

  it("drops the oldest chats when a write would exceed the cap", () => {
    const newest = Array.from({ length: MAX_CHATS + 5 }, (_, index) =>
      chat(`chat-${index}`, `Question ${index}`, index + 1),
    );
    const storage = memoryStorage();
    const saved = saveHistory({ activeId: "chat-0", chats: newest }, storage);

    expect(saved.chats).toHaveLength(MAX_CHATS);
    expect(saved.chats[0]?.id).toBe(`chat-${MAX_CHATS + 4}`);
    expect(saved.chats.some((item) => item.id === "chat-0")).toBe(false);
    expect(saved.activeId).toBeNull();
  });

  it("drops the oldest chats when storage throws a quota error", () => {
    const chats = [1, 2, 3].map((index) =>
      chat(String(index), "x".repeat(400), index),
    );
    const fitting = saveHistory(
      { activeId: "3", chats: chats.slice(1) },
      memoryStorage(),
    );
    const storage = memoryStorage(JSON.stringify(fitting).length);
    const saved = saveHistory({ activeId: "3", chats }, storage);

    expect(saved.chats.map((item) => item.id)).toEqual(["3", "2"]);
    expect(loadHistory(storage).chats.map((item) => item.id)).toEqual(["3", "2"]);
  });
});
