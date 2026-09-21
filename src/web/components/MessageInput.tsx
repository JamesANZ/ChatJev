import { useState, type FormEvent, type KeyboardEvent } from "react";

type MessageInputProps = {
  disabled?: boolean;
  onSend: (question: string) => void;
};

export function MessageInput({ disabled, onSend }: MessageInputProps) {
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
        placeholder="Ask whether the document supports a specific claim"
        rows={2}
      />
      <button type="submit" disabled={disabled || !value.trim()}>
        Ask Jev
      </button>
    </form>
  );
}
