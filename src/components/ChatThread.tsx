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
  return (
    <div className="thread">
      {messages.map((message) =>
        message.role === "user" ? (
          <article className="turn user" key={message.id}>
            <div className="bubble">{message.text}</div>
          </article>
        ) : (
          <article className="turn assistant" key={message.id}>
            <div className="who">Jev</div>
            <VerdictCard result={message.result} />
          </article>
        ),
      )}
      {pending ? (
        <article className="turn assistant">
          <div className="who">Jev</div>
          <div className="thinking" role="status" aria-live="polite">
            <span className="dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            Judging the evidence
          </div>
        </article>
      ) : null}
    </div>
  );
}
