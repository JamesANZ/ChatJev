import { handleUpload } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleUpload(request);
}
