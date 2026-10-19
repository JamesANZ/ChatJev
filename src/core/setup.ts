export type SetupIssue = {
  code: "missing_jev" | "missing_llm" | "missing_search" | "mock_mode";
  message: string;
};

export type SetupEnv = Record<string, string | undefined>;

function providerFor(env: SetupEnv): string {
  return (
    env.CHATJEV_LLM_PROVIDER ??
    (env.DEEPSEEK_API_KEY
      ? "deepseek"
      : env.OPENAI_API_KEY
        ? "openai"
        : "gateway")
  );
}

function gatewayReady(env: SetupEnv): boolean {
  return Boolean(
    env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN || env.VERCEL === "1",
  );
}

export function readSetup(env: SetupEnv = process.env): {
  issues: SetupIssue[];
} {
  const mock = env.CHATJEV_MOCK_JEV === "1" || env.CHATJEV_MOCK_LLM === "1";
  if (mock) {
    return {
      issues: [
        {
          code: "mock_mode",
          message:
            "ChatJev is in mock mode (CHATJEV_MOCK_JEV or CHATJEV_MOCK_LLM). It is not calling a language model or live web search, so answers are local guesses.",
        },
      ],
    };
  }

  const issues: SetupIssue[] = [];
  if (!env.TYPESAFE_API_KEY) {
    issues.push({
      code: "missing_jev",
      message:
        "TYPESAFE_API_KEY is missing. Jev cannot score questions until that server variable is set.",
    });
  }

  const provider = providerFor(env);
  const llmReady =
    provider === "openai"
      ? Boolean(env.OPENAI_API_KEY)
      : provider === "deepseek"
        ? Boolean(env.DEEPSEEK_API_KEY)
        : gatewayReady(env);

  if (!llmReady) {
    const message =
      provider === "openai"
        ? "OPENAI_API_KEY is missing, so the language model does not run. ChatJev cannot search or write questions for Jev."
        : provider === "deepseek"
          ? "DEEPSEEK_API_KEY is missing, so the language model does not run. ChatJev cannot search or write questions for Jev."
          : "No language-model credential is set. Add AI_GATEWAY_API_KEY, or DEEPSEEK_API_KEY / OPENAI_API_KEY. Without it, ChatJev cannot search or write questions for Jev.";
    issues.push({ code: "missing_llm", message });
  }

  if (
    (provider === "openai" || provider === "deepseek") &&
    !env.MONID_API_KEY
  ) {
    issues.push({
      code: "missing_search",
      message:
        "MONID_API_KEY is missing, so questions the file does not answer are not looked up. Jev only sees the file.",
    });
  }

  return { issues };
}

export const SEARCH_MISSED_WARNING =
  "No web sources were found, so Jev only saw the attached file. A missing MONID_API_KEY or AI Gateway credential leaves this search blank.";

export const MODEL_FALLBACK_WARNING =
  "The language model did not formulate that question, so this answer is a local fallback rather than a model-written question.";
