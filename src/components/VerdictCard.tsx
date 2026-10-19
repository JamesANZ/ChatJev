"use client";

import type { AskResult, JudgmentView } from "@/core/types";

type VerdictCardProps = {
  result: AskResult;
};

function primaryNoul(judgments: JudgmentView[]): JudgmentView | undefined {
  return judgments.find((item) => item.type === "noul" && item.noul != null);
}

export function VerdictCard({ result }: VerdictCardProps) {
  if (result.kind === "refusal") {
    return (
      <section className="notice">
        <p>{result.message}</p>
      </section>
    );
  }

  const primary = primaryNoul(result.judgments);
  const choice = result.judgments.find((item) => item.type === "choice");
  const leaning = primary?.leaning ?? choice?.leaning ?? "unsure";
  const amount = primary?.noul ?? choice?.confidence ?? 0;
  const width = `${Math.round(amount * 100)}%`;

  return (
    <section className={`verdict ${leaning}`}>
      {result.narration ? <h2>{result.narration}</h2> : null}
      {primary || choice ? (
        <div className="meter" aria-hidden="true">
          <span style={{ width }} />
        </div>
      ) : null}
      <ul className="judgments">
        {result.judgments.map((item) => (
          <li key={item.key}>{item.line}</li>
        ))}
      </ul>
      {result.sources.length > 0 ? (
        <div className="sources">
          <p>Sources Jev saw</p>
          <ul>
            {result.sources.map((source) => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {result.evidenceTruncated ? (
        <p className="warning">
          Evidence was cut to fit Jev’s 32k-token budget.
        </p>
      ) : null}
      <p className="meta">
        {result.model} · {result.usage.input_tokens} input tokens
      </p>
    </section>
  );
}
