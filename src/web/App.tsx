import { useState } from "react";
import type { SessionSummary } from "../core/types";
import { askSession, createSession } from "./api";
import { ChatThread, type ChatItem } from "./components/ChatThread";
import { DropZone } from "./components/DropZone";
import { FileChip } from "./components/FileChip";
import { MessageInput } from "./components/MessageInput";

function nextId(): string {
  return crypto.randomUUID();
}

export function App() {
  const [session, setSession] = useState<SessionSummary | null>(null);
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File) {
    setError(null);
    setBusy(true);
    try {
      const next = await createSession(file);
      setSession(next);
      setMessages([]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not attach that document.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onSend(question: string) {
    if (!session) {
      setError("Attach a document before asking Jev.");
      return;
    }

    setError(null);
    setMessages((current) => [
      ...current,
      { id: nextId(), role: "user", text: question },
    ]);
    setBusy(true);
    try {
      const result = await askSession(session.id, question);
      setMessages((current) => [
        ...current,
        { id: nextId(), role: "assistant", result },
      ]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Jev could not answer that question.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app">
      <header className="masthead">
        <h1>ChatJev</h1>
        <p>
          Attach a document, then ask closed questions. Jev returns
          probabilities, not essays — ChatJev turns those into a readable
          verdict.
        </p>
      </header>

      {session ? (
        <FileChip
          session={session}
          onClear={() => {
            setSession(null);
            setMessages([]);
            setError(null);
          }}
        />
      ) : (
        <DropZone disabled={busy} onFile={onFile} />
      )}

      <ChatThread
        messages={messages}
        pending={busy && messages.at(-1)?.role === "user"}
      />
      {error ? <p className="error">{error}</p> : null}
      <MessageInput disabled={!session || busy} onSend={onSend} />
    </main>
  );
}
