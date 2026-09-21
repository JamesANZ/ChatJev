import {
  choice,
  noul,
  score,
  TypeSafeClient,
  TypeSafeError,
} from "@typesafe-ai/sdk";
import {
  ChatJevError,
  type JevClient,
  type JevRequest,
  type JevResponse,
} from "./types.js";

function toSdkQuestions(questions: JevRequest["questions"]) {
  return Object.fromEntries(
    Object.entries(questions).map(([key, question]) => {
      if (question.type === "noul") {
        return [key, noul(question.instructions, question.criteria)];
      }
      if (question.type === "choice") {
        return [key, choice(question.instructions, question.criteria)];
      }
      return [
        key,
        score(
          question.instructions,
          question.criteria as [string, string, ...string[]],
        ),
      ];
    }),
  );
}

export class TypeSafeJevClient implements JevClient {
  constructor(
    private readonly apiKey = process.env.TYPESAFE_API_KEY,
    private readonly model = process.env.TYPESAFE_DEFAULT_MODEL || "jev-latest",
  ) {}

  async evaluate(request: JevRequest): Promise<JevResponse> {
    if (!this.apiKey) {
      throw new ChatJevError(
        503,
        "missing_api_key",
        "TYPESAFE_API_KEY is not set. Add it to your environment or a local .env file.",
      );
    }

    try {
      const client = new TypeSafeClient({
        apiKey: this.apiKey,
        defaultModel: this.model,
      });
      const response = await client.systemOne({
        state: request.state as { [key: string]: string },
        model: this.model,
        questions: toSdkQuestions(request.questions),
      });
      return {
        model: response.model,
        answers: response.answers as JevResponse["answers"],
        usage: response.usage,
      };
    } catch (error) {
      if (error instanceof ChatJevError) throw error;
      const message =
        error instanceof Error ? error.message : "Jev request failed";
      const status =
        error instanceof TypeSafeError &&
        "status" in error &&
        typeof error.status === "number"
          ? error.status
          : 502;
      throw new ChatJevError(status, "jev_error", message);
    }
  }
}
