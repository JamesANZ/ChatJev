"use client";

import type { AskResult } from "@/core/types";

type VerdictCardProps = {
  result: AskResult;
};

function Sources({ result }: { result: Extract<AskResult, { kind: "verdict" }> }) {
  if (result.evidence.origin !== "web" || result.evidence.sources.length === 0) {
    return null;
  }
  return (
    <div className="sources">
      <p className="meta">Web sources Jev judged</p>
      <ul>
        {result.evidence.sources.map((source) => (
          <li key={source.url}>
            <a href={source.url} target="_blank" rel="noreferrer">
              {source.title}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function VerdictCard({ result }: VerdictCardProps) {
  if (result.kind === "refusal" || result.kind === "unsupported_media") {
    return (
      <section className="notice">
        <p>{result.message}</p>
      </section>
    );
  }

  if (result.kind === "blocked") {
    return (
      <section className="notice blocked">
        <p>{result.message}</p>
        <p className="meta">
          Injection screen · {Math.round(result.noul * 100)}% · {result.injectionKind}
        </p>
      </section>
    );
  }

  if (result.kind === "llm") {
    return (
      <section className="verdict llm">
        <div className="pills">
          <span className="pill unsure">LLM fallback</span>
        </div>
        <p>{result.message}</p>
        <p className="meta">{result.model} · Jev could not return a closed judgment</p>
      </section>
    );
  }

  const { verdict, model, usage } = result;
  const width = `${Math.round(verdict.noul * 100)}%`;

  return (
    <section className={`verdict ${verdict.leaning}`}>
      <div className="pills">
        <span className="pill yes">Jev</span>
        <span className="pill unsure">
          {result.evidence.origin === "web" ? "web evidence" : "attached document"}
        </span>
      </div>
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
      <Sources result={result} />
      <p className="meta">
        {model} · {usage.input_tokens} input tokens
        {result.evidence.truncated ? " · evidence truncated" : ""}
      </p>
    </section>
  );
}
