"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";

type MessageInputProps = {
  disabled?: boolean;
  placeholder?: string;
  onSend: (question: string) => void;
};

export function MessageInput({
  disabled,
  placeholder = "Ask a question for Jev to judge",
  onSend,
}: MessageInputProps) {
  const [value, setValue] = useState("");

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

  return (
    <form className="composer" onSubmit={onSubmit}>
      <textarea
        value={value}
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        rows={2}
      />
      <button type="submit" disabled={disabled || !value.trim()}>
        Ask Jev
      </button>
    </form>
  );
}
