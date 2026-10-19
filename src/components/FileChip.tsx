"use client";

import type { SessionSummary } from "@/core/types";

type FileChipProps = {
  session: SessionSummary;
  onClear: () => void;
};

export function FileChip({ session, onClear }: FileChipProps) {
  return (
    <div className="file-chip">
      <span className="file-icon" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M4 1.75h5.1L12.25 5v9.25H4V1.75Z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <path
            d="M9 1.75V5h3.25"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <div className="file-copy">
        <b title={session.filename}>{session.filename}</b>
        <small>
          {session.charCount.toLocaleString()} characters
          {session.truncated ? " · truncated" : ""}
        </small>
        {session.truncated ? (
          <div className="warning">
            Later pages were cut to fit Jev’s 32k-token budget.
          </div>
        ) : null}
      </div>
      <button
        type="button"
        className="file-remove"
        onClick={onClear}
        aria-label={`Remove ${session.filename}`}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M3.5 3.5 10.5 10.5M10.5 3.5 3.5 10.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
