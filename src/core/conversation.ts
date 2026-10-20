import type { ChatTurn } from "./types";

export const MAX_CHAT_TURNS = 12;
export const MAX_TURN_CHARS = 1_000;

export function normalizeChatHistory(value: unknown): ChatTurn[] {
  if (!Array.isArray(value)) return [];
  const turns: ChatTurn[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const turn = item as { role?: unknown; text?: unknown };
    if (turn.role !== "user" && turn.role !== "assistant") continue;
    if (typeof turn.text !== "string") continue;
    const text = turn.text.replace(/\s+/g, " ").trim().slice(0, MAX_TURN_CHARS);
    if (!text) continue;
    turns.push({ role: turn.role, text });
  }
  return turns.slice(-MAX_CHAT_TURNS);
}

export function formatChatLog(turns: ChatTurn[]): string {
  return turns
    .map((turn) => `${turn.role === "user" ? "User" : "Jev"}: ${turn.text}`)
    .join("\n");
}

export function conversationPrompt(turns: ChatTurn[]): string {
  const log = formatChatLog(turns);
  if (!log) return "";
  return [
    "Earlier turns in this same chat:",
    log,
    "The latest user question continues this chat. Resolve pronouns, names, and follow-ups against these turns. Judge only the latest question.",
  ].join("\n");
}

export function searchQuery(question: string, turns: ChatTurn[]): string {
  const latest = question.trim().replace(/\s+/g, " ");
  const prior = turns
    .filter((turn) => turn.role === "user")
    .map((turn) => turn.text);
  if (prior.length === 0) return latest.slice(0, 300);
  return [...prior.slice(-2), latest].join(" ").slice(0, 300);
}

export function followUpQuestion(question: string, turns: ChatTurn[]): string {
  const latest = question.trim();
  const prior = [...turns].reverse().find((turn) => turn.role === "user");
  if (!prior) return latest;
  return `${latest} This continues: ${prior.text}`.slice(0, 400);
}
