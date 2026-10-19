"use client";

import type { AskResult, ExamVerdict } from "@/core/types";

type VerdictCardProps = {
  result: AskResult;
};

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function ExamVerdictCard({
  result,
  verdict,
}: {
  result: Extract<AskResult, { kind: "verdict" }>;
  verdict: ExamVerdict;
}) {
  return (
    <section className={`verdict ${verdict.leaning}`}>
      <h2>{verdict.headline}</h2>
      <div className="meter" aria-hidden="true">
        <span style={{ width: percent(verdict.probability) }} />
      </div>
      <div className="pills">
        <span className={`pill ${verdict.leaning}`}>
          {verdict.abstain
            ? `Silent · ${percent(verdict.probability)}`
            : verdict.split
              ? `Split · ${percent(verdict.probability)}`
              : percent(verdict.probability)}
        </span>
        <span className="pill unsure">multiple choice</span>
      </div>
      <ul className="exam-options">
        {verdict.options.map((option) => {
          const selected = option.key === verdict.selectedKey;
          return (
            <li key={option.key} className={selected ? "selected" : undefined}>
              <span>{option.text}</span>
              <b>
                {selected ? "Selected · " : ""}
                {percent(option.probability)}
              </b>
            </li>
          );
        })}
      </ul>
      <p className="meta">
        {result.model} · {result.usage.input_tokens} input tokens
        {result.examModel ? ` · exam by ${result.examModel}` : ""}
      </p>
    </section>
  );
}

export function VerdictCard({ result }: VerdictCardProps) {
  if (result.kind === "refusal") {
    return (
      <section className="notice">
        <p>{result.message}</p>
      </section>
    );
  }

  const { verdict, model, usage } = result;
  if (verdict.mode === "exam") {
    return <ExamVerdictCard result={result} verdict={verdict} />;
  }

  const width = percent(verdict.noul);

  return (
    <section className={`verdict ${verdict.leaning}`}>
      <h2>{verdict.headline}</h2>
      <div className="meter" aria-hidden="true">
        <span style={{ width }} />
      </div>
      <div className="pills">
        <span className={`pill ${verdict.leaning}`}>
          {verdict.leaning === "unsure"
            ? `Unsure · ${percent(verdict.noul)} yes`
            : `${verdict.leaning} · ${percent(verdict.noul)} yes`}
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
