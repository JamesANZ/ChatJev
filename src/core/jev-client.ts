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

function looksLikeOpenEnded(question: string): boolean {
  return /\b(summarize|explain|rewrite|what does it say|write me|draft|brainstorm)\b/i.test(
    question,
  );
}

function looksLikeInjection(question: string): boolean {
  return /\b(ignore (all )?(previous|prior|above) instructions|you are now\b|system prompt|developer mode|jailbreak|forget (your|all) (instructions|rules))\b/i.test(
    question,
  );
}

function looksLikeMedia(question: string): boolean {
  return /\b(this (photo|picture|image|screenshot|recording|audio|clip|video)|what do you (see|hear)|describe (this )?(photo|image|picture|audio)|transcribe|listen to this)\b/i.test(
    question,
  );
}

function overlapNoul(query: string, haystack: string): number {
  const tokens = query
    .toLowerCase()
    .split(/\W+/)
    .filter((word) => word.length > 4);
  if (tokens.length === 0) return 0.5;
  const hits = tokens.filter((word) => haystack.includes(word)).length;
  return Math.min(0.95, 0.15 + (0.8 * hits) / tokens.length);
}

export function createDemoJevClient(): JevClient {
  return new FakeJevClient((request) => {
    const state = (request.state ?? {}) as Record<string, string | undefined>;
    const question = state.user_question ?? state.query ?? "";
    const keys = Object.keys(request.questions);

    if (keys.some((key) => key.startsWith("relevant_"))) {
      const answers: Record<string, ReturnType<typeof noulAnswer>> = {};
      keys
        .filter((key) => key.startsWith("relevant_"))
        .forEach((key) => {
          const index = key.slice("relevant_".length);
          const passage = String(state[`passage_${index}`] ?? "");
          answers[key] = noulAnswer(overlapNoul(question, passage.toLowerCase()));
          answers[`hostile_${index}`] = noulAnswer(
            looksLikeInjection(passage) ? 0.86 : 0.08,
          );
        });
      return response(answers, { input_tokens: 40, output_tokens: 10 });
    }

    if (!state.document) {
      const injection = looksLikeInjection(question);
      const media = looksLikeMedia(question);
      const openEnded = looksLikeOpenEnded(question);
      const route = media ? "media" : openEnded ? "llm" : "jev";
      return response(
        {
          is_judgment: noulAnswer(openEnded || media ? 0.12 : 0.93),
          kind: choiceAnswer(
            openEnded || media ? "open_ended" : "judgment",
            openEnded || media
              ? { judgment: 0.08, open_ended: 0.92 }
              : { judgment: 0.94, open_ended: 0.06 },
            0.9,
          ),
          route: choiceAnswer(
            route,
            {
              jev: route === "jev" ? 0.9 : 0.05,
              llm: route === "llm" ? 0.9 : 0.05,
              media: route === "media" ? 0.9 : 0.05,
            },
            0.88,
          ),
          is_injection: noulAnswer(injection ? 0.91 : 0.08),
          injection_kind: choiceAnswer(
            injection ? "jailbreak" : "clean",
            injection
              ? { clean: 0.06, injection: 0.2, jailbreak: 0.74 }
              : { clean: 0.92, injection: 0.05, jailbreak: 0.03 },
            0.87,
          ),
        },
        { input_tokens: 28, output_tokens: 10 },
      );
    }

    const haystack = (state.document ?? "").toLowerCase();
    const noul = overlapNoul(question, haystack);
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
