import { compileEvaluation } from "./compile";
import { isClosedJudgment } from "./classify";
import { LLM_UNAVAILABLE_MESSAGE } from "./llm";
import {
  evidenceFromDocument,
  gatherWebEvidence,
} from "./search";
import {
  INJECTION_BLOCK_MESSAGE,
  MEDIA_REFUSAL_MESSAGE,
  triagePrompt,
} from "./triage";
import { formatVerdict, formatVerdictMessage } from "./verdict";
import type {
  AskResult,
  DocumentContext,
  EvidencePack,
  JevClient,
  LlmClient,
  WebSearchClient,
} from "./types";

export type AskPromptOptions = {
  document?: Pick<DocumentContext, "filename" | "text" | "truncated">;
  search?: WebSearchClient;
  llm?: LlmClient | null;
};

async function evaluateEvidence(
  client: JevClient,
  evidence: EvidencePack,
  question: string,
): Promise<AskResult> {
  const request = compileEvaluation(
    evidence.filename,
    evidence.text,
    question,
  );
  const response = await client.evaluate(request);
  const verdict = formatVerdict(question, response.answers, evidence.origin);

  return {
    kind: "verdict",
    question,
    message: formatVerdictMessage(verdict),
    verdict,
    model: response.model,
    usage: response.usage,
    answers: response.answers,
    evidence,
  };
}

async function fallbackLlm(
  question: string,
  llm: LlmClient | null | undefined,
  evidence?: string,
): Promise<AskResult> {
  if (!llm) {
    return {
      kind: "refusal",
      question,
      message: LLM_UNAVAILABLE_MESSAGE,
    };
  }
  const generated = await llm.complete({ prompt: question, evidence });
  return {
    kind: "llm",
    question,
    message: generated.text,
    model: generated.model,
  };
}

export async function askPrompt(
  client: JevClient,
  question: string,
  options: AskPromptOptions = {},
): Promise<AskResult> {
  const trimmed = question.trim();
  if (!trimmed) {
    return {
      kind: "refusal",
      question,
      message: "Ask a closed question. Attach a document or ChatJev will search the web.",
    };
  }

  const triage = await triagePrompt(client, trimmed);
  if (triage.blocked) {
    return {
      kind: "blocked",
      question: trimmed,
      message: INJECTION_BLOCK_MESSAGE,
      noul: triage.injectionNoul,
      injectionKind: triage.injectionKind,
    };
  }

  if (triage.route === "media") {
    return {
      kind: "unsupported_media",
      question: trimmed,
      message: MEDIA_REFUSAL_MESSAGE,
    };
  }

  const jevCanAnswer =
    triage.route === "jev" && isClosedJudgment(triage);

  if (!jevCanAnswer) {
    return fallbackLlm(
      trimmed,
      options.llm,
      options.document?.text,
    );
  }

  if (options.document?.text) {
    return evaluateEvidence(
      client,
      evidenceFromDocument(options.document),
      trimmed,
    );
  }

  if (!options.search) {
    return {
      kind: "refusal",
      question: trimmed,
      message:
        "Attach a document, or enable web search, so Jev has evidence to judge.",
    };
  }

  const evidence = await gatherWebEvidence(trimmed, options.search, client);
  return evaluateEvidence(client, evidence, trimmed);
}
