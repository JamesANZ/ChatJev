import { ChatJevError } from "./types";

export type FormulationFailure = "fatal" | "retry";

export type FormulationPhase =
  | {
      name: "attempt";
      attempt: number;
      feedback?: string;
      lastError?: unknown;
    }
  | { name: "fallback"; lastError?: unknown };

export function formulationFailure(error: unknown): FormulationFailure {
  if (!(error instanceof ChatJevError)) return "retry";
  if (
    error.code === "missing_api_key" ||
    error.code === "missing_llm_key" ||
    error.status === 401 ||
    error.status === 403
  ) {
    return "fatal";
  }
  if (
    /timeout|unavailable|rate limit|too many requests|overloaded|econn|fetch failed|network/i.test(
      error.message,
    )
  ) {
    return "fatal";
  }
  if (error.code === "jev_error" || error.code === "llm_error") return "retry";
  return "fatal";
}

export function advanceFormulation(input: {
  attempt: number;
  attempts: number;
  feedback: string;
  error?: unknown;
  lastError?: unknown;
}): FormulationPhase {
  const lastError = input.error ?? input.lastError;
  if (input.attempt + 1 < input.attempts) {
    return {
      name: "attempt",
      attempt: input.attempt + 1,
      feedback: input.feedback,
      lastError,
    };
  }
  return { name: "fallback", lastError };
}
