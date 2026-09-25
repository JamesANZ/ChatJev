import { describe, expect, it } from "vitest";
import { resolveLlmConfig } from "../src/core/llm";

describe("resolveLlmConfig", () => {
  it("prefers the Vercel AI Gateway when that key is set", () => {
    const config = resolveLlmConfig({
      AI_GATEWAY_API_KEY: "gw",
      OPENAI_API_KEY: "oa",
    });
    expect(config).toMatchObject({
      apiKey: "gw",
      baseUrl: "https://ai-gateway.vercel.sh/v1",
    });
  });

  it("returns null when no LLM key is configured", () => {
    expect(resolveLlmConfig({})).toBeNull();
  });
});
