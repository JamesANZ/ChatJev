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
        Ask anything about the document. For example: what is this about? Or
        whether it supports a specific claim.
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
        <section className="notice">Jev is answering from the document…</section>
      ) : null}
    </div>
  );
}
