import { createGatewayLlm } from "@/core/gateway-llm";
import { createHeuristicLlm, type LlmClient } from "@/core/llm";
import { createDeepSeekLlm, createOpenAiLlm } from "@/core/openai-llm";

export function getLlmClient(): LlmClient {
  if (
    process.env.CHATJEV_MOCK_LLM === "1" ||
    process.env.CHATJEV_MOCK_JEV === "1"
  ) {
    return createHeuristicLlm();
  }

  const provider =
    process.env.CHATJEV_LLM_PROVIDER ??
    (process.env.DEEPSEEK_API_KEY
      ? "deepseek"
      : process.env.OPENAI_API_KEY
        ? "openai"
        : "gateway");

  if (provider === "openai") return createOpenAiLlm();
  if (provider === "deepseek") return createDeepSeekLlm();
  return createGatewayLlm();
}
