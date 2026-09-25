import { resolveLlmConfig } from "@/core/llm";

export const runtime = "nodejs";

export function GET() {
  return Response.json({
    ok: true,
    llm: Boolean(resolveLlmConfig()) || process.env.CHATJEV_MOCK_JEV === "1",
    media: {
      photos: false,
      audio: false,
      note: "Jev is text-only. Attach a transcript or caption.",
    },
  });
}
