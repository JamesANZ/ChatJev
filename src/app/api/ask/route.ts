import { handleAsk } from "@/lib/http";
import { getExamDesigner, getJevClient } from "@/lib/jev";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  return handleAsk(request, getJevClient(), getExamDesigner());
}
