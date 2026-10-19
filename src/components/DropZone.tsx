"use client";

type DropZoneProps = {
  active: boolean;
};

export function DropZone({ active }: DropZoneProps) {
  if (!active) return null;

  return (
    <div className="drop-overlay" role="status">
      <div className="drop-card">
        <strong>Drop a document</strong>
        <span>TXT, Markdown, CSV, JSON, HTML, PDF, or DOCX</span>
      </div>
    </div>
  );
}
