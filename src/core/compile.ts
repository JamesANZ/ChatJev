import { STRENGTH_CRITERIA, type JevRequest } from "./types.js";

export const RELATION_INSTRUCTIONS =
  "How does the document relate to the user's proposition?";

export const RELATION_CRITERIA = {
  supported: "Document evidence supports it",
  contradicted: "Document evidence contradicts it",
  not_mentioned: "Document does not address it",
} as const;

export const STRENGTH_INSTRUCTIONS =
  "How strong is the document's evidence for that relation?";

export function compileEvaluation(
  filename: string,
  document: string,
  userQuestion: string,
): JevRequest {
  return {
    state: {
      filename,
      document,
      user_question: userQuestion,
    },
    questions: {
      proposition: {
        type: "noul",
        instructions: userQuestion,
      },
      relation: {
        type: "choice",
        instructions: RELATION_INSTRUCTIONS,
        criteria: { ...RELATION_CRITERIA },
      },
      strength: {
        type: "score",
        instructions: STRENGTH_INSTRUCTIONS,
        criteria: [...STRENGTH_CRITERIA],
      },
    },
  };
}
