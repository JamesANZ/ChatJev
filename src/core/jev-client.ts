import { isOverviewQuestion } from "./exam";
import type {
  ChoiceQuestion,
  JevAnswer,
  JevClient,
  JevQuestion,
  JevRequest,
  JevResponse,
} from "./types";

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

function overlap(instructions: string, haystack: string): number {
  const tokens = instructions
    .toLowerCase()
    .split(/\W+/)
    .filter((word) => word.length > 4);
  if (!haystack.trim() || tokens.length === 0) return 0.5;
  const hits = tokens.filter((word) => haystack.includes(word)).length;
  return Math.min(0.95, 0.15 + (0.8 * hits) / tokens.length);
}

function contentTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3);
}

function demoExamChoice(
  question: ChoiceQuestion,
  haystack: string,
  userQuestion: string,
): JevAnswer {
  const entries = Object.entries(question.criteria);
  const questionTokens = contentTokens(userQuestion);
  const overview = isOverviewQuestion(userQuestion);
  const questionInEvidence = questionTokens.some((token) =>
    haystack.includes(token),
  );
  const ranked = entries
    .map(([key, text], index) => {
      const abstain =
        key === "abstain" || /does not contain enough information/i.test(text);
      if (abstain) {
        return {
          key,
          index,
          score: !overview && questionTokens.length > 0 && !questionInEvidence ? 10 : 0.05,
        };
      }
      const tokens = contentTokens(text);
      const hits = tokens.filter((token) => haystack.includes(token)).length;
      const coverage = tokens.length === 0 ? 0 : hits / tokens.length;
      const questionHits = questionTokens.filter((token) =>
        text.toLowerCase().includes(token),
      ).length;
      return {
        key,
        index,
        score: overview ? coverage : questionHits * 2 + coverage,
      };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index);

  const probabilities: Record<string, number> = {};
  const leader = 0.74;
  const rest = ranked.slice(1);
  const restWeights = [0.16, 0.08, 0.03, 0.01];
  const restTotal = rest.reduce(
    (sum, _, index) => sum + (restWeights[index] ?? 0.01),
    0,
  );
  ranked.forEach((option, index) => {
    if (index === 0 || restTotal === 0) {
      probabilities[option.key] = index === 0 ? leader : 0;
      return;
    }
    const weight = restWeights[index - 1] ?? 0.01;
    probabilities[option.key] = (weight / restTotal) * (1 - leader);
  });
  const choice = ranked[0]?.key ?? "abstain";
  return choiceAnswer(choice, probabilities, probabilities[choice] ?? leader);
}

function demoAnswer(
  question: JevQuestion,
  noul: number,
  context?: { haystack: string; userQuestion: string },
): JevAnswer {
  if (question.type === "noul") return noulAnswer(noul);
  if (
    question.type === "choice" &&
    context &&
    (question.criteria.abstain ||
      Object.values(question.criteria).some((label) => label.length > 40))
  ) {
    return demoExamChoice(question, context.haystack, context.userQuestion);
  }
  if (question.type === "choice") {
    const keys = Object.keys(question.criteria);
    const choice =
      noul >= 0.6
        ? keys[0]
        : noul <= 0.4
          ? (keys[1] ?? keys[0])
          : (keys.at(-1) ?? keys[0]);
    const rest = (1 - noul) / Math.max(1, keys.length - 1);
    const probabilities = Object.fromEntries(
      keys.map((key) => [key, key === choice ? noul : rest]),
    );
    return choiceAnswer(choice, probabilities, 0.8);
  }
  const labels = question.criteria;
  const max = labels.length - 1;
  const score =
    noul >= 0.75
      ? max
      : noul >= 0.6
        ? Math.max(1, max - 1)
        : noul >= 0.4
          ? 1
          : 0;
  return scoreAnswer(
    score,
    Object.fromEntries(labels.map((label, index) => [String(index), label])),
    Object.fromEntries(
      labels.map((_, index) => [String(index), index === score ? 0.7 : 0.1]),
    ),
    0.75,
  );
}

export function createDemoJevClient(): JevClient {
  return new FakeJevClient((request) => {
    const state = (request.state ?? {}) as {
      user_question?: string;
      document?: string;
      sources?: string;
    };
    const question = state.user_question ?? "";
    const openEnded = /\b(summarize|explain|rewrite|what does it say)\b/i.test(
      question,
    );

    if (
      request.questions.is_judgment &&
      request.questions.kind &&
      state.document === undefined
    ) {
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

    const haystack =
      `${state.document ?? ""} ${state.sources ?? ""}`.toLowerCase();
    const noul = overlap(question || "claim", haystack);
    const answers: Record<string, JevAnswer> = {};
    for (const [key, item] of Object.entries(request.questions)) {
      answers[key] = demoAnswer(item, noul, { haystack, userQuestion: question });
    }
    return response(answers, { input_tokens: 180, output_tokens: 16 });
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
