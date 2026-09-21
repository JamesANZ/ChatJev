import type { JevAnswer, JevClient, JevRequest, JevResponse } from "./types";

function response(
  answers: Record<string, JevAnswer>,
  usage: JevResponse["usage"],
  model = "jev-demo",
): JevResponse {
  return { model, usage, answers };
}

export class FakeJevClient implements JevClient {
  readonly calls: JevRequest[] = [];

  constructor(
    private readonly handler: (
      request: JevRequest,
    ) => JevResponse | Promise<JevResponse>,
  ) {}

  async evaluate(request: JevRequest): Promise<JevResponse> {
    this.calls.push(request);
    return this.handler(request);
  }
}

export function noulAnswer(noul: number): JevAnswer {
  return { type: "noul", noul };
}

export function choiceAnswer(
  choice: string,
  probabilities: Record<string, number>,
  confidence = 0.8,
): JevAnswer {
  return { type: "choice", choice, probabilities, confidence };
}

export function scoreAnswer(
  score: number,
  legend: Record<string, string>,
  probabilities: Record<string, number>,
  confidence = 0.8,
): JevAnswer {
  return { type: "score", score, legend, probabilities, confidence };
}

export function requireNoul(
  answer: JevAnswer | undefined,
  key: string,
): number {
  if (!answer || answer.type !== "noul") {
    throw new Error(`Expected noul answer for "${key}"`);
  }
  return answer.noul;
}

export function requireChoice<T extends string>(
  answer: JevAnswer | undefined,
  key: string,
): { choice: T; confidence: number; probabilities: Record<string, number> } {
  if (!answer || answer.type !== "choice") {
    throw new Error(`Expected choice answer for "${key}"`);
  }
  return {
    choice: answer.choice as T,
    confidence: answer.confidence,
    probabilities: answer.probabilities,
  };
}

export function createDemoJevClient(): JevClient {
  return new FakeJevClient((request) => {
    const state = (request.state ?? {}) as {
      user_question?: string;
      document?: string;
    };
    const question = state.user_question ?? "";
    const openEnded = /\b(summarize|explain|rewrite|what does it say)\b/i.test(
      question,
    );

    if (!state.document) {
      return response(
        openEnded
          ? {
              is_judgment: noulAnswer(0.12),
              kind: choiceAnswer(
                "open_ended",
                { judgment: 0.08, open_ended: 0.92 },
                0.88,
              ),
            }
          : {
              is_judgment: noulAnswer(0.93),
              kind: choiceAnswer(
                "judgment",
                { judgment: 0.94, open_ended: 0.06 },
                0.91,
              ),
            },
        { input_tokens: 24, output_tokens: 6 },
      );
    }

    const tokens = question
      .toLowerCase()
      .split(/\W+/)
      .filter((word) => word.length > 4);
    const haystack = (state.document ?? "").toLowerCase();
    const hits = tokens.filter((word) => haystack.includes(word)).length;
    const noul =
      tokens.length === 0
        ? 0.5
        : Math.min(0.95, 0.15 + (0.8 * hits) / tokens.length);
    const relation =
      noul >= 0.6
        ? "supported"
        : noul <= 0.4
          ? "contradicted"
          : "not_mentioned";
    const strength = noul >= 0.75 ? 3 : noul >= 0.6 ? 2 : noul >= 0.4 ? 1 : 0;

    return {
      model: "jev-demo",
      usage: { input_tokens: 180, output_tokens: 16 },
      answers: {
        proposition: noulAnswer(noul),
        relation: choiceAnswer(
          relation,
          { supported: noul, contradicted: 1 - noul, not_mentioned: 0.1 },
          0.8,
        ),
        strength: scoreAnswer(
          strength,
          {
            "0": "None or off-topic",
            "1": "Indirect or weak",
            "2": "Moderate, with gaps",
            "3": "Strong and explicit",
          },
          { "0": 0.05, "1": 0.1, "2": 0.2, "3": 0.65 },
          0.75,
        ),
      },
    };
  });
}

export function requireScore(
  answer: JevAnswer | undefined,
  key: string,
): { score: number; legend: Record<string, string>; confidence: number } {
  if (!answer || answer.type !== "score") {
    throw new Error(`Expected score answer for "${key}"`);
  }
  return {
    score: answer.score,
    legend: answer.legend,
    confidence: answer.confidence,
  };
}
