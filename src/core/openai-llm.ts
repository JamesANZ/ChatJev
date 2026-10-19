import { jsonSchema, tool } from "ai";
import { createOpenAI, openai } from "@ai-sdk/openai";
import { ChatJevError } from "./types";
import { createModelLlm, DEFAULT_LLM_MODEL } from "./gateway-llm";

function openaiModelId(): string {
  const configured = process.env.CHATJEV_LLM_MODEL || DEFAULT_LLM_MODEL;
  return configured.startsWith("openai/")
    ? configured.slice("openai/".length)
    : configured;
}

export function tavilySearchTool() {
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
      const apiKey = process.env.TAVILY_API_KEY;
      if (!apiKey) {
        throw new ChatJevError(
          503,
          "missing_search_key",
          "TAVILY_API_KEY is not set, so ChatJev cannot look up web evidence.",
        );
      }

      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          max_results: 5,
          search_depth: "basic",
          include_answer: false,
        }),
      });
      if (!response.ok) {
        throw new ChatJevError(
          502,
          "search_error",
          `Web search failed (${response.status}).`,
        );
      }

      const body = (await response.json()) as {
        results?: Array<{ title?: string; url?: string; content?: string }>;
      };
      return {
        id: "tavily",
        results: (body.results ?? []).map((row) => ({
          title: row.title || row.url || "Source",
          url: row.url ?? "",
          snippet: row.content ?? "",
        })),
      };
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
    searchTool: tavilySearchTool(),
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
    searchTool: tavilySearchTool(),
  });
}
