"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";

type MessageInputProps = {
  disabled?: boolean;
  placeholder?: string;
  attachment?: ReactNode;
  onSend: (question: string) => void;
  onFile: (file: File) => void;
};

const ACCEPT = ".txt,.md,.markdown,.csv,.json,.html,.htm,.pdf,.docx";

export function MessageInput({
  disabled,
  placeholder = "Message ChatJev",
  attachment,
  onSend,
  onFile,
}: MessageInputProps) {
  const [value, setValue] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    const element = field.current;
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${Math.min(element.scrollHeight, 200)}px`;
  }, [value]);

  function submit() {
    const question = value.trim();
    if (!question || disabled) return;
    onSend(question);
    setValue("");
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    submit();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  const canSend = Boolean(value.trim()) && !disabled;

  return (
    <form className="composer" onSubmit={onSubmit}>
      {attachment ? (
        <div className="composer-attachment">{attachment}</div>
      ) : null}
      <div className="composer-row">
        <button
          type="button"
          className="icon-btn"
          aria-label="Attach a document"
          disabled={disabled}
          onClick={() => fileInput.current?.click()}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M10 4.5v11M4.5 10h11"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <textarea
          ref={field}
          value={value}
          disabled={disabled}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          rows={1}
          aria-label="Message"
        />
        <button
          type="submit"
          className="send-btn"
          disabled={!canSend}
          aria-label="Send"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M9 14.25V3.75M9 3.75 4.75 8M9 3.75 13.25 8"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <input
          ref={fileInput}
          type="file"
          hidden
          accept={ACCEPT}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
            event.target.value = "";
          }}
        />
      </div>
    </form>
  );
}
