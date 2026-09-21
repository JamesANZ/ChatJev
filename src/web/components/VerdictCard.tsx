import type { AskResult } from "../../core/types";

type VerdictCardProps = {
  result: AskResult;
};

export function VerdictCard({ result }: VerdictCardProps) {
  if (result.kind === "refusal") {
    return (
      <section className="notice">
        <p>{result.message}</p>
      </section>
    );
  }

  const { verdict, model, usage } = result;
  const width = `${Math.round(verdict.noul * 100)}%`;

  return (
    <section className={`verdict ${verdict.leaning}`}>
      <h2>{verdict.headline}</h2>
      <div className="meter" aria-hidden="true">
        <span style={{ width }} />
      </div>
      <div className="pills">
        <span className={`pill ${verdict.leaning}`}>
          {verdict.leaning === "unsure"
            ? `Unsure · ${Math.round(verdict.noul * 100)}% yes`
            : `${verdict.leaning} · ${Math.round(verdict.noul * 100)}% yes`}
        </span>
        <span className="pill unsure">
          {verdict.relation.replace("_", " ")}
        </span>
        <span className="pill yes">{verdict.strengthLabel}</span>
      </div>
      <ul>
        {verdict.details.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="meta">
        {model} · {usage.input_tokens} input tokens
      </p>
    </section>
  );
}
