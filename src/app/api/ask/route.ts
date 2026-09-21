import { handleAsk } from "@/lib/http";
import { getJevClient } from "@/lib/jev";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  return handleAsk(request, getJevClient());
}
