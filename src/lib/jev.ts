import { createDemoJevClient } from "@/core/jev-client";
import { TypeSafeJevClient } from "@/core/typesafe-client";
import type { JevClient } from "@/core/types";

export function getJevClient(): JevClient {
  if (process.env.CHATJEV_MOCK_JEV === "1") {
    return createDemoJevClient();
  }
  return new TypeSafeJevClient();
}
