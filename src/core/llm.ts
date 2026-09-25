import { ChatJevError, type LlmClient } from "./types";

export const LLM_UNAVAILABLE_MESSAGE =
  "Jev cannot summarize, explain, or rewrite. This prompt needs generated prose. Set AI_GATEWAY_API_KEY or OPENAI_API_KEY to fall through to an LLM, or ask a closed question Jev can judge.";

type LlmConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

export function resolveLlmConfig(
  env: Record<string, string | undefined> = process.env,
): LlmConfig | null {
  if (env.AI_GATEWAY_API_KEY) {
    return {
      apiKey: env.AI_GATEWAY_API_KEY,
      baseUrl: "https://ai-gateway.vercel.sh/v1",
      model: env.CHATJEV_LLM_MODEL || "openai/gpt-4.1-mini",
    };
  }
  if (env.OPENAI_API_KEY) {
    return {
      apiKey: env.OPENAI_API_KEY,
      baseUrl: env.CHATJEV_LLM_BASE_URL || "https://api.openai.com/v1",
      model: env.CHATJEV_LLM_MODEL || "gpt-4o-mini",
    };
  }
  if (env.CHATJEV_LLM_API_KEY) {
    return {
      apiKey: env.CHATJEV_LLM_API_KEY,
      baseUrl: env.CHATJEV_LLM_BASE_URL || "https://api.openai.com/v1",
      model: env.CHATJEV_LLM_MODEL || "gpt-4o-mini",
    };
  }
  return null;
}

export class HttpLlmClient implements LlmClient {
  constructor(private readonly config: LlmConfig) {}

  async complete(input: {
    prompt: string;
    evidence?: string;
  }): Promise<{ text: string; model: string }> {
    const messages = [
      {
        role: "system",
        content:
          "You are the ChatJev LLM fallback. Jev already decided it cannot return a closed judgment for this prompt. Answer helpfully and briefly. If evidence is supplied, stay faithful to it.",
      },
      {
        role: "user",
        content: input.evidence
          ? `Evidence:\n${input.evidence}\n\nUser prompt:\n${input.prompt}`
          : input.prompt,
      },
    ];

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new ChatJevError(
        502,
        "llm_error",
        detail || `LLM request failed (${response.status})`,
      );
    }

    const body = (await response.json()) as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = body.choices?.[0]?.message?.content?.trim();
    if (!text) {
      throw new ChatJevError(502, "llm_error", "LLM returned an empty answer.");
    }
    return { text, model: body.model || this.config.model };
  }
}

export function createDemoLlmClient(): LlmClient {
  return {
    async complete(input) {
      return {
        model: "chatjev-demo-llm",
        text: `Mock LLM fallback: Jev only returns judgments, so this open-ended prompt was not scored. You asked: “${input.prompt.trim()}”.`,
      };
    },
  };
}

export function getLlmClient(
  env: Record<string, string | undefined> = process.env,
): LlmClient | null {
  if (env.CHATJEV_MOCK_JEV === "1") {
    return createDemoLlmClient();
  }
  const config = resolveLlmConfig(env);
  return config ? new HttpLlmClient(config) : null;
}
