"use client";

type DropZoneProps = {
  active: boolean;
};

export function DropZone({ active }: DropZoneProps) {
  if (!active) return null;

  return (
    <div className="drop-overlay" role="status">
      <div className="drop-card">
        <strong>Drop a file</strong>
        <span>TXT, Markdown, CSV, JSON, HTML, PDF, DOCX, or an image</span>
      </div>
    </div>
  );
}
