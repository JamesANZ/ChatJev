import { describe, expect, it } from "vitest";
import { askDocument } from "../src/core/ask";
import { createDemoJevClient } from "../src/core/jev-client";
import { readSetup } from "../src/core/setup";
import { ingestDocument } from "../src/core/ingest";
import { GET as getSetup } from "../src/app/api/setup/route";
import { fixture } from "./helpers";

describe("readSetup", () => {
  it("names missing Jev and model credentials without echoing secrets", () => {
    const setup = readSetup({});
    expect(setup.issues.map((issue) => issue.code)).toEqual([
      "missing_jev",
      "missing_llm",
    ]);
    expect(JSON.stringify(setup)).not.toMatch(/sk-|Bearer /);
    expect(setup.issues[1]?.message).toMatch(/AI_GATEWAY_API_KEY/);
  });

  it("asks for TinyFish when DeepSeek has no search key", () => {
    const setup = readSetup({
      TYPESAFE_API_KEY: "present",
      DEEPSEEK_API_KEY: "present",
    });
    expect(setup.issues.map((issue) => issue.code)).toEqual(["missing_search"]);
  });

  it("stays quiet when Jev, the model, and search are set", () => {
    expect(
      readSetup({
        TYPESAFE_API_KEY: "present",
        CHATJEV_LLM_PROVIDER: "openai",
        OPENAI_API_KEY: "present",
        MONID_API_KEY: "present",
      }).issues,
    ).toEqual([]);
  });

  it("says when mock mode is skipping the model", () => {
    expect(readSetup({ CHATJEV_MOCK_JEV: "1" }).issues[0]?.code).toBe(
      "mock_mode",
    );
  });
});

describe("setup route", () => {
  it("returns the issue list and no secret values", async () => {
    const response = await getSetup();
    const body = (await response.json()) as {
      issues: Array<{ code: string; message: string }>;
    };
    expect(response.status).toBe(200);
    expect(Array.isArray(body.issues)).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/sk-|Bearer /);
  });
});

describe("ask warnings", () => {
  it("warns when a claim needed the web and no sources came back", async () => {
    const document = await ingestDocument({
      buffer: fixture("nicotine-heart.txt"),
      filename: "nicotine-heart.txt",
      mimeType: "text/plain",
    });
    const result = await askDocument(
      createDemoJevClient(),
      document,
      "Is nicotine a carcinogen?",
    );
    expect(result.kind).toBe("verdict");
    if (result.kind !== "verdict") return;
    expect(result.warning).toMatch(/No web sources/);
    expect(result.warning).toMatch(/MONID_API_KEY/);
  });
});
