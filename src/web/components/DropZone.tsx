import { useState } from "react";

type DropZoneProps = {
  disabled?: boolean;
  onFile: (file: File) => void;
};

export function DropZone({ disabled, onFile }: DropZoneProps) {
  const [active, setActive] = useState(false);

  function takeFile(fileList: FileList | null) {
    const file = fileList?.[0];
    if (file) onFile(file);
  }

  return (
    <label
      className={`dropzone${active ? " active" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setActive(true);
      }}
      onDragLeave={() => setActive(false)}
      onDrop={(event) => {
        event.preventDefault();
        setActive(false);
        takeFile(event.dataTransfer.files);
      }}
    >
      <strong>Attach a document</strong>
      <span>
        TXT, Markdown, CSV, JSON, HTML, PDF, or DOCX. Jev reads extracted text
        only.
      </span>
      <input
        type="file"
        disabled={disabled}
        accept=".txt,.md,.markdown,.csv,.json,.html,.htm,.pdf,.docx"
        onChange={(event) => {
          takeFile(event.target.files);
          event.target.value = "";
        }}
      />
    </label>
  );
}
