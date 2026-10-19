import { jsonSchema, tool } from "ai";
import { createOpenAI, openai } from "@ai-sdk/openai";
import { ChatJevError } from "./types";
import { createModelLlm, DEFAULT_LLM_MODEL } from "./gateway-llm";
import { searchTinyFish } from "./tinyfish";

function openaiModelId(): string {
  const configured = process.env.CHATJEV_LLM_MODEL || DEFAULT_LLM_MODEL;
  return configured.startsWith("openai/")
    ? configured.slice("openai/".length)
    : configured;
}

export function tinyFishSearchTool() {
  return tool({
    description:
      "Search the web and return titles, URLs, and excerpts. This does not decide whether a claim is true.",
    inputSchema: jsonSchema<{ query: string }>({
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: { query: { type: "string" } },
    }),
    execute: async ({ query }) => {
      const results = await searchTinyFish(query);
      return { id: "tinyfish", results };
    },
  });
}

export function createOpenAiLlm() {
  if (!process.env.OPENAI_API_KEY) {
    throw new ChatJevError(
      503,
      "missing_llm_key",
      "OPENAI_API_KEY is not set.",
    );
  }
  return createModelLlm({
    model: openai(openaiModelId()),
    searchTool: tinyFishSearchTool(),
  });
}

export function createDeepSeekLlm() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new ChatJevError(
      503,
      "missing_llm_key",
      "DEEPSEEK_API_KEY is not set.",
    );
  }
  const configured = process.env.CHATJEV_LLM_MODEL;
  const modelId =
    configured && !configured.includes("/")
      ? configured
      : configured?.startsWith("deepseek/")
        ? configured.slice("deepseek/".length)
        : "deepseek-chat";
  const deepseek = createOpenAI({
    apiKey,
    baseURL: "https://api.deepseek.com/v1",
  });
  return createModelLlm({
    model: deepseek.chat(modelId),
    searchTool: tinyFishSearchTool(),
  });
}
