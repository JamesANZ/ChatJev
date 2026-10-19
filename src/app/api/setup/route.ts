import { readSetup } from "@/core/setup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(readSetup());
}
