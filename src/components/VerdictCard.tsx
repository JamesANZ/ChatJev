"use client";

import { judgmentMeter } from "@/core/judgment-meter";
import type { AnswerOrigin, AskResult } from "@/core/types";

type VerdictCardProps = {
  result: AskResult;
};

export function AnswerSource({ origin }: { origin: AnswerOrigin }) {
  return (
    <span className="origin">
      <span className="origin-kind">
        {origin.kind === "file" ? "from your file" : "found on the web"}
      </span>
      {origin.kind === "web" ? (
        <a
          className="source-link"
          href={origin.url}
          target="_blank"
          rel="noreferrer"
        >
          {origin.title}
        </a>
      ) : (
        <span className="source-link origin-file">{origin.title}</span>
      )}
    </span>
  );
}

export function VerdictCard({ result }: VerdictCardProps) {
  if (result.kind === "refusal") {
    return <p className="narration">{result.message}</p>;
  }

  const meter = judgmentMeter(result.judgments);

  return (
    <section className={`verdict ${meter.kind === "none" ? "unsure" : meter.tone}`}>
      {result.narration ? (
        <p className="narration">{result.narration}</p>
      ) : null}
      {meter.kind !== "none" || result.judgments.length > 0 ? (
        <div className="score-panel">
          {meter.kind !== "none" ? (
            <>
              <div className="score-label">
                <span className={`dot ${meter.tone}`} aria-hidden="true" />
                <span className="score-caption">{meter.caption}</span>
                <span className="score-pct">{meter.percent}%</span>
              </div>
              <div
                className="meter"
                role="meter"
                aria-label="Confidence"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={meter.percent}
              >
                <span style={{ width: `${meter.percent}%` }} />
              </div>
            </>
          ) : null}
          {result.judgments.length > 0 ? (
            <ul className="judgments">
              {result.judgments.map((item) => (
                <li className="answer-row" key={item.key}>
                  <span className="judgment-line">{item.line}</span>
                  {item.origin ? <AnswerSource origin={item.origin} /> : null}
                </li>
              ))}
            </ul>
          ) : null}
          {result.imageReading ? (
            <div className="image-reading">
              <span className="sources-label">Vision model reading</span>
              <p>{result.imageReading}</p>
              <p className="warning">
                Jev scored the picture against this reading. The reading is not
                Jev’s answer.
              </p>
            </div>
          ) : null}
          {result.sources.length > 0 ? (
            <div className="sources">
              <span className="sources-label">Sources Jev saw</span>
              {result.sources.map((source) => (
                <a
                  className="source-link"
                  key={source.url}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {source.title}
                </a>
              ))}
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
        </div>
      ) : null}
    </section>
  );
}
