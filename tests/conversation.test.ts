import { describe, expect, it } from "vitest";
import { createHeuristicLlm } from "../src/core/llm";
import {
  conversationPrompt,
  normalizeChatHistory,
  searchQuery,
} from "../src/core/conversation";

describe("chat context", () => {
  it("keeps the recent user and assistant turns", () => {
    const turns = normalizeChatHistory([
      {
        role: "user",
        text: "  Will the coalition win the Victoria election?  ",
      },
      { role: "assistant", text: "Jev puts that at 62% yes." },
      { role: "note", text: "ignore" },
      { role: "user", text: "   " },
    ]);
    expect(turns).toEqual([
      {
        role: "user",
        text: "Will the coalition win the Victoria election?",
      },
      { role: "assistant", text: "Jev puts that at 62% yes." },
    ]);
    expect(conversationPrompt(turns)).toContain("same chat");
    expect(conversationPrompt(turns)).toContain("62% yes");
    expect(searchQuery("Can Labor win?", turns)).toBe(
      "Will the coalition win the Victoria election? Can Labor win?",
    );
  });

  it("folds the previous question into a follow-up proposition", async () => {
    const drafts = await createHeuristicLlm().compile({
      question: "Can Labor win?",
      filename: "",
      document: "",
      sourcesText: "Labor and the Coalition are contesting Victoria in 2027.",
      history: [
        {
          role: "user",
          text: "Will the coalition win the Victoria state election in 2027?",
        },
      ],
    });
    expect(drafts[0]?.instructions).toContain(
      "Can Labor win? This continues: Will the coalition win the Victoria state election in 2027",
    );
  });
});
