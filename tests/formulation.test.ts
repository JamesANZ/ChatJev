import { describe, expect, it } from "vitest";
import { imageRead } from "../src/core/ask";
import {
  advanceFormulation,
  formulationFailure,
} from "../src/core/formulation";
import { ChatJevError } from "../src/core/types";

describe("formulation phases", () => {
  it("retries a rejected formulation and then falls back", () => {
    const error = new ChatJevError(502, "jev_error", "nope");
    const retry = advanceFormulation({
      attempt: 0,
      attempts: 4,
      feedback: "try again",
      error,
    });
    expect(retry).toMatchObject({
      name: "attempt",
      attempt: 1,
      feedback: "try again",
      lastError: error,
    });
    const kept = advanceFormulation({
      attempt: 1,
      attempts: 4,
      feedback: "still empty",
      lastError: error,
    });
    expect(kept).toMatchObject({ name: "attempt", attempt: 2, lastError: error });
    expect(
      advanceFormulation({
        attempt: 3,
        attempts: 4,
        feedback: "last",
        lastError: error,
      }),
    ).toEqual({ name: "fallback", lastError: error });
  });

  it("stops on auth, quota, and network failures", () => {
    expect(
      formulationFailure(new ChatJevError(401, "jev_error", "unauthorized")),
    ).toBe("fatal");
    expect(
      formulationFailure(new ChatJevError(503, "missing_llm_key", "missing")),
    ).toBe("fatal");
    expect(
      formulationFailure(new ChatJevError(502, "llm_error", "rate limit")),
    ).toBe("fatal");
    expect(
      formulationFailure(new ChatJevError(502, "llm_error", "bad json")),
    ).toBe("retry");
    expect(formulationFailure(new Error("parse"))).toBe("retry");
  });
});

describe("image reads", () => {
  it("replaces an image with its reading", () => {
    expect(
      imageRead({
        hasImage: true,
        described: true,
        reading: " a red door ",
      }),
    ).toEqual({ action: "replace", reading: "a red door" });
  });

  it("leaves text and blank readings untouched", () => {
    expect(
      imageRead({ hasImage: false, described: true, reading: "nope" }),
    ).toEqual({ action: "passthrough" });
    expect(
      imageRead({ hasImage: true, described: false, reading: "" }),
    ).toEqual({ action: "passthrough" });
    expect(
      imageRead({ hasImage: true, described: true, reading: "  " }),
    ).toEqual({ action: "passthrough" });
  });

  it("stops for a missing vision credential and continues after other failures", () => {
    expect(
      imageRead({
        hasImage: true,
        described: true,
        reading: "",
        error: new ChatJevError(503, "missing_llm_key", "missing"),
      }),
    ).toEqual({ action: "stop" });
    expect(
      imageRead({
        hasImage: true,
        described: true,
        reading: "",
        error: new ChatJevError(401, "llm_error", "unauthorized"),
      }),
    ).toEqual({ action: "stop" });
    expect(
      imageRead({
        hasImage: true,
        described: true,
        reading: "",
        error: new Error("timeout"),
      }),
    ).toEqual({ action: "unread" });
  });
});
