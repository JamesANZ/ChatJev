import { handleAsk } from "@/lib/http";
import { getJevClient, getLlmClient, getWebSearchClient } from "@/lib/jev";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  return handleAsk(request, getJevClient(), {
    search: getWebSearchClient(),
    llm: getLlmClient(),
  });
}
