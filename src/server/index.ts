import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync } from "node:fs";
import { createApp } from "./app.js";
import { loadEnv } from "./env.js";
import { createDemoJevClient } from "../core/jev-client.js";
import { TypeSafeJevClient } from "../core/typesafe-client.js";
import type { JevClient } from "../core/types.js";

loadEnv();

function createJev(): JevClient {
  if (process.env.CHATJEV_MOCK_JEV === "1") {
    console.log(
      "ChatJev is using the local demo Jev client (CHATJEV_MOCK_JEV=1).",
    );
    return createDemoJevClient();
  }
  return new TypeSafeJevClient();
}

const app = createApp({ jev: createJev() });
const webRoot = "dist/web";

if (existsSync(webRoot)) {
  app.use("/*", serveStatic({ root: webRoot }));
}

const port = Number(process.env.PORT || 3001);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`ChatJev API listening on http://127.0.0.1:${info.port}`);
});
