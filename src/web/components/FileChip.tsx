import type { SessionSummary } from "../../core/types";

type FileChipProps = {
  session: SessionSummary;
  onClear: () => void;
};

export function FileChip({ session, onClear }: FileChipProps) {
  return (
    <div className="file-chip">
      <div>
        <b>{session.filename}</b>
        <small className="meta">
          {session.mimeType} · {session.charCount.toLocaleString()} characters
        </small>
        {session.truncated ? (
          <div className="warning">
            Text was truncated to Jev’s 32k-token state budget. Later pages were
            not sent.
          </div>
        ) : null}
      </div>
      <button type="button" onClick={onClear}>
        Remove
      </button>
    </div>
  );
}
