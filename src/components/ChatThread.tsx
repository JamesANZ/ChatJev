"use client";

import type { AskResult } from "@/core/types";
import { VerdictCard } from "./VerdictCard";

export type ChatItem =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; result: AskResult };

type ChatThreadProps = {
  messages: ChatItem[];
  pending?: boolean;
};

export function ChatThread({ messages, pending }: ChatThreadProps) {
  if (messages.length === 0 && !pending) {
    return (
      <p className="empty">
        Ask a closed question, for example: does this document strongly suggest
        a correlation between nicotine and heart disease?
      </p>
    );
  }

  return (
    <div className="thread">
      {messages.map((message) =>
        message.role === "user" ? (
          <div className="bubble" key={message.id}>
            {message.text}
          </div>
        ) : (
          <VerdictCard key={message.id} result={message.result} />
        ),
      )}
      {pending ? (
        <section className="notice">Jev is judging the document…</section>
      ) : null}
    </div>
  );
}
