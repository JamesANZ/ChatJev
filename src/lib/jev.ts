import { createDemoJevClient } from "@/core/jev-client";
import { getLlmClient } from "@/core/llm";
import {
  createDemoWebSearchClient,
  HttpWebSearchClient,
} from "@/core/search";
import { TypeSafeJevClient } from "@/core/typesafe-client";
import type { JevClient, LlmClient, WebSearchClient } from "@/core/types";

export function getJevClient(): JevClient {
  if (process.env.CHATJEV_MOCK_JEV === "1") {
    return createDemoJevClient();
  }
  return new TypeSafeJevClient();
}

export function getWebSearchClient(): WebSearchClient {
  if (
    process.env.CHATJEV_MOCK_JEV === "1" ||
    process.env.CHATJEV_MOCK_WEB === "1"
  ) {
    return createDemoWebSearchClient();
  }
  return new HttpWebSearchClient();
}

export { getLlmClient };
export type { LlmClient };
