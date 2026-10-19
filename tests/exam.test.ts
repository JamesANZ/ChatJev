import { describe, expect, it } from "vitest";
import {
  ABSTAIN_TEXT,
  buildExamPrompt,
  compileExam,
  excerptForExam,
  isOverviewQuestion,
  normalizeExam,
  shouldAnswerAsExam,
} from "../src/core/exam";
import {
  createHeuristicExamDesigner,
  createLlmExamDesigner,
  GATEWAY_HELP,
} from "../src/core/exam-designer";
import { ChatJevError } from "../src/core/types";
import { fixture } from "./helpers";

const sample = {
  question: "What is this about?",
  filename: "nicotine-heart.txt",
  text: fixture("nicotine-heart.txt").toString("utf8"),
};

describe("exam routing", () => {
  it("keeps yes/no questions on the direct judgment path", () => {
    expect(
      shouldAnswerAsExam(
        "does this medical document strongly suggest a correlation between nicotine and heart disease?",
      ),
    ).toBe(false);
    expect(shouldAnswerAsExam("What is this about?")).toBe(true);
    expect(shouldAnswerAsExam("summarize this")).toBe(true);
    expect(shouldAnswerAsExam("Can you summarize this?")).toBe(false);
  });

  it("treats only broad prompts as overviews", () => {
    expect(isOverviewQuestion("What is this about?")).toBe(true);
    expect(isOverviewQuestion("summarize this")).toBe(true);
    expect(isOverviewQuestion("What is the patient's name?")).toBe(false);
    expect(isOverviewQuestion("Explain the termination clause")).toBe(false);
  });
});

describe("normalizeExam", () => {
  it("keeps one abstain choice and distinct keys", () => {
    const exam = normalizeExam({
      options: [
        { key: "A", text: "A) The paper links nicotine with heart disease.", abstain: false },
        { key: "A", text: "The paper is a baking recipe.", abstain: false },
        { key: "c", text: "The paper is a baking recipe.", abstain: false },
        { key: "skip", text: ABSTAIN_TEXT, abstain: false },
        { key: "extra", text: "The document does not contain enough information to answer the question.", abstain: true },
      ],
    });

    expect(exam.options.filter((option) => option.abstain)).toHaveLength(1);
    expect(new Set(exam.options.map((option) => option.key)).size).toBe(
      exam.options.length,
    );
    expect(exam.options.at(-1)?.abstain).toBe(true);
    expect(exam.options[0]?.text).not.toMatch(/^A\)/);
  });

  it("rejects a draft that is not a real exam", () => {
    expect(() => normalizeExam({ options: [] })).toThrow(ChatJevError);
  });
});

describe("compileExam", () => {
  it("asks Jev to choose among the designed sentences", () => {
    const exam = normalizeExam({
      options: [
        { key: "a", text: "The document links nicotine with heart disease.", abstain: false },
        { key: "b", text: "The document denies any link.", abstain: false },
        { key: "abstain", text: ABSTAIN_TEXT, abstain: true },
      ],
    });
    const request = compileExam("notes.txt", "full text", "What is this about?", exam);
    expect(request.state).toMatchObject({
      filename: "notes.txt",
      document: "full text",
      user_question: "What is this about?",
    });
    expect(request.questions.answer).toMatchObject({
      type: "choice",
      criteria: {
        a: "The document links nicotine with heart disease.",
        abstain: ABSTAIN_TEXT,
      },
    });
  });

  it("omits the middle of a very long document from the design prompt", () => {
    const text = `${"start ".repeat(3000)}MIDDLE${" end".repeat(2000)}`;
    const excerpt = excerptForExam(text);
    expect(excerpt).toContain("omitted from exam design");
    expect(excerpt.length).toBeLessThan(text.length);
    const prompt = buildExamPrompt({
      question: "What is this about?",
      filename: "long.txt",
      text,
    });
    expect(prompt).toMatch(/do not answer the question/i);
    expect(prompt).toContain("<question>");
    expect(prompt).toContain("What is this about?");
    expect(prompt).not.toContain("MIDDLE");
  });
});

describe("exam designers", () => {
  it("builds heuristic choices from the nicotine fixture", async () => {
    const exam = await createHeuristicExamDesigner().design(sample);
    expect(exam.model).toBe("heuristic");
    expect(exam.options.some((option) => /nicotine/i.test(option.text))).toBe(
      true,
    );
    expect(exam.options.filter((option) => option.abstain)).toHaveLength(1);
  });

  it("normalizes a model draft without treating it as the answer", async () => {
    const designer = createLlmExamDesigner({
      model: "openai/gpt-5.4-mini",
      generate: async (prompt, model) => {
        expect(model).toBe("openai/gpt-5.4-mini");
        expect(prompt).toMatch(/do not mark a correct choice/i);
        return {
          options: [
            { key: "a", text: "The document links nicotine with heart disease.", abstain: false },
            { key: "b", text: "The document is about baking.", abstain: false },
            { key: "abstain", text: ABSTAIN_TEXT, abstain: true },
          ],
        };
      },
    });
    const exam = await designer.design(sample);
    expect(exam.model).toBe("openai/gpt-5.4-mini");
    expect(exam.options).toHaveLength(3);
  });

  it("asks for a gateway key when none is configured", async () => {
    const previousKey = process.env.AI_GATEWAY_API_KEY;
    const previousOidc = process.env.VERCEL_OIDC_TOKEN;
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.VERCEL_OIDC_TOKEN;
    try {
      await expect(
        createLlmExamDesigner().design(sample),
      ).rejects.toMatchObject({
        status: 503,
        code: "missing_gateway_key",
        message: GATEWAY_HELP,
      });
    } finally {
      if (previousKey === undefined) delete process.env.AI_GATEWAY_API_KEY;
      else process.env.AI_GATEWAY_API_KEY = previousKey;
      if (previousOidc === undefined) delete process.env.VERCEL_OIDC_TOKEN;
      else process.env.VERCEL_OIDC_TOKEN = previousOidc;
    }
  });
});
