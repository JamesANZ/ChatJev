import { handleAsk } from "@/lib/http";
import { getJevClient } from "@/lib/jev";
import { getLlmClient } from "@/lib/llm";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  return handleAsk(request, getJevClient(), getLlmClient());
}
