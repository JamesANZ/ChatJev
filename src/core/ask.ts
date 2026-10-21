import {
  followUpQuestion,
  formatChatLog,
  normalizeChatHistory,
} from "./conversation";
import { bundleDocuments } from "./documents";
import {
  attributeAnswer,
  asksToCompareDocuments,
  compareDocumentDrafts,
  gapFillDrafts,
  needsWebEvidence,
} from "./evidence";
import { examDrafts } from "./exam";
import { MODEL_FALLBACK_WARNING, SEARCH_MISSED_WARNING } from "./setup";
import {
  createHeuristicLlm,
  FORMULATION_ATTEMPTS,
  formulationStrategy,
  type LlmClient,
} from "./llm";
import {
  allowedPercents,
  clipEvidence,
  narrationKeepsPercents,
  repairDrafts,
  validateQuestions,
  viewJudgment,
} from "./questions";
import { formatSources } from "./snippets";
import {
  ChatJevError,
  MAX_STATE_CHARS,
  type AskResult,
  type AttachedImage,
  type ChatTurn,
  type DocumentContext,
  type JevClient,
  type JevQuestion,
  type SourceSnippet,
} from "./types";

function retryableFormulationError(error: unknown): boolean {
  if (!(error instanceof ChatJevError)) return true;
  if (
    error.code === "missing_api_key" ||
    error.code === "missing_llm_key" ||
    error.status === 401 ||
    error.status === 403
  ) {
    return false;
  }
  if (
    /timeout|unavailable|rate limit|too many requests|overloaded|econn|fetch failed|network/i.test(
      error.message,
    )
  ) {
    return false;
  }
  return error.code === "jev_error" || error.code === "llm_error";
}

function failureNote(reason: string, attempt: number): string {
  const next = formulationStrategy(attempt + 1);
  const clean = reason.replace(/\s+/g, " ").trim().slice(0, 280);
  return `${clean} Reformulate with a different shape (${next}).`;
}

function refusalMessage(error: unknown): string {
  const detail =
    error instanceof Error ? error.message.replace(/\s+/g, " ").trim() : "";
  if (!detail) {
    return "Jev could not score a formulation of that question. Try asking it a different way.";
  }
  return `Jev could not score a formulation of that question. ${detail}`.slice(
    0,
    400,
  );
}

function listDocuments(
  document: DocumentContext | DocumentContext[] | null,
): DocumentContext[] {
  if (!document) return [];
  if (Array.isArray(document)) return document;
  return [document];
}

function readingText(
  filename: string,
  reading: string,
  soleImage: boolean,
): string {
  const note = soleImage
    ? "This description is not the picture. The picture is `photo`."
    : "This description is not the picture.";
  return `Vision-model reading of ${filename}. ${note}\n\n${reading}`;
}

async function finishVerdict(input: {
  client: JevClient;
  llm: LlmClient;
  documents: DocumentContext[];
  filename: string;
  photo?: Pick<AttachedImage, "format" | "dataBase64">;
  trimmed: string;
  clipped: { document: string; sources: string; truncated: boolean };
  questions: Record<string, JevQuestion>;
  snippets: SourceSnippet[];
  imageReading?: string;
  evidenceTruncated: boolean;
  warning?: string;
  history: ChatTurn[];
}): Promise<AskResult> {
  const response = await input.client.evaluate({
    state: {
      filename: input.filename,
      document: input.clipped.document,
      sources: input.clipped.sources,
      user_question: input.trimmed,
      ...(input.history.length ? { chat: formatChatLog(input.history) } : {}),
    },
    image: input.photo,
    questions: input.questions,
  });

  const judgments = Object.entries(input.questions).map(([key, item]) => {
    const view = viewJudgment(key, item, response.answers[key]);
    const origin = attributeAnswer({
      text:
        view.type === "noul"
          ? view.instructions
          : (view.label ?? view.instructions),
      filename: input.documents.length === 1 ? input.filename : undefined,
      documents: input.documents.map((item) => ({
        filename: item.filename,
        text: item.text,
      })),
      snippets: input.snippets,
    });
    return origin ? { ...view, origin } : view;
  });
  const fallback = judgments.map((item) => item.line).join(" ");

  let narration: string | null = null;
  try {
    const reading = (
      await input.llm.narrate({
        question: input.trimmed,
        lines: judgments.map((item) => item.line),
        sources: input.snippets,
        history: input.history,
      })
    ).trim();
    if (
      reading &&
      narrationKeepsPercents(reading, allowedPercents(response.answers))
    ) {
      narration = reading;
    }
  } catch {
    narration = null;
  }

  return {
    kind: "verdict",
    question: input.trimmed,
    message: narration ?? fallback,
    narration,
    judgments,
    sources: input.snippets,
    imageReading: input.imageReading,
    evidenceTruncated: input.evidenceTruncated || input.clipped.truncated,
    model: response.model,
    usage: response.usage,
    answers: response.answers,
    warning: input.warning,
  };
}

export async function askDocument(
  client: JevClient,
  document: DocumentContext | DocumentContext[] | null,
  question: string,
  llm: LlmClient = createHeuristicLlm(),
  history: ChatTurn[] | unknown = [],
): Promise<AskResult> {
  const trimmed = question.trim();
  const prior = normalizeChatHistory(history);
  if (!trimmed) {
    return {
      kind: "refusal",
      question,
      message: "Ask a question for Jev to judge.",
    };
  }

  const attached = listDocuments(document);
  const photos = attached.filter((item) => item.image);
  const soleImage = photos.length === 1;
  let visionWarning: string | undefined;
  const readings: string[] = [];
  const prepared: DocumentContext[] = [];
  for (const item of attached) {
    if (!item.image || !llm.describeImage) {
      prepared.push(item);
      continue;
    }
    try {
      const reading = (
        await llm.describeImage({
          filename: item.filename,
          question: trimmed,
          image: item.image,
          history: prior,
        })
      ).trim();
      if (reading) {
        readings.push(soleImage ? reading : `${item.filename}: ${reading}`);
        prepared.push({
          ...item,
          text: readingText(item.filename, reading, soleImage),
        });
        continue;
      }
    } catch (error) {
      if (
        error instanceof ChatJevError &&
        (error.code === "missing_llm_key" ||
          error.status === 401 ||
          error.status === 403)
      ) {
        throw error;
      }
      visionWarning =
        "The vision model could not read an image, so the questions were written without a description of it. Jev still received a single picture when only one image is attached.";
    }
    prepared.push(item);
  }
  if (photos.length > 1) {
    visionWarning = [
      visionWarning,
      "Jev can look at one picture at a time, so these images are compared from written readings.",
    ]
      .filter(Boolean)
      .join(" ");
  }
  const imageAttached = soleImage;
  const photo = soleImage ? photos[0]?.image : undefined;
  const filename =
    prepared.length === 1
      ? (prepared[0]?.filename ?? "")
      : prepared.map((item) => item.filename).join(", ");
  const gatheredText =
    prepared.length > 1
      ? prepared
          .map((item) => `===== ${item.filename} =====\n${item.text}`)
          .join("\n\n")
      : (prepared[0]?.text ?? "");
  const files = prepared.map((item) => ({
    filename: item.filename,
    text: item.text,
  }));
  const snippets = await llm.gather({
    question: trimmed,
    filename,
    document: gatheredText,
    files,
    image: imageAttached,
    history: prior,
  });

  if (prepared.length === 0 && snippets.length === 0) {
    throw new ChatJevError(
      400,
      "missing_evidence",
      "ChatJev could not find web evidence for that question. Check the search key, or attach a document.",
    );
  }

  const sourcesText = formatSources(snippets);
  const sourceReserve = sourcesText
    ? Math.min(sourcesText.length, Math.floor(MAX_STATE_CHARS * 0.35))
    : 0;
  const bundled = bundleDocuments(files, MAX_STATE_CHARS - sourceReserve);
  const clipped = clipEvidence(bundled.text, sourcesText);
  const webNeeded = needsWebEvidence(trimmed, bundled.text || gatheredText, {
    image: imageAttached,
    fileCount: prepared.length,
  });
  const searchWarning =
    webNeeded && snippets.length === 0 ? SEARCH_MISSED_WARNING : undefined;
  const compareWarning =
    prepared.length > 5 && asksToCompareDocuments(trimmed)
      ? "Jev scores five files on a comparison. Remove one of the later files to score the rest."
      : undefined;
  const imageReading = readings.length > 0 ? readings.join("\n\n") : undefined;
  const evidenceTruncated =
    prepared.some((item) => item.truncated) || bundled.truncated;
  const askWarning = [visionWarning, compareWarning, searchWarning]
    .filter(Boolean)
    .join(" ");
  const verdict = {
    client,
    llm,
    documents: prepared,
    filename,
    photo: photo
      ? { format: photo.format, dataBase64: photo.dataBase64 }
      : undefined,
    trimmed,
    clipped,
    snippets,
    imageReading,
    evidenceTruncated,
    history: prior,
  };
  const gapDrafts = gapFillDrafts({
    question: trimmed,
    document: clipped.document,
    sourcesText: clipped.sources,
  });
  const comparison = compareDocumentDrafts(trimmed, bundled.files);
  const earlyDrafts = gapDrafts ?? comparison;
  if (earlyDrafts) {
    const validated = validateQuestions(
      repairDrafts(earlyDrafts, { fallbackInstructions: trimmed }),
    );
    if (validated.ok && Object.keys(validated.questions).length > 1) {
      return finishVerdict({
        ...verdict,
        questions: validated.questions,
        warning: askWarning || undefined,
      });
    }
  }
  let feedback: string | undefined;
  let lastError: unknown;

  for (let attempt = 0; attempt < FORMULATION_ATTEMPTS; attempt += 1) {
    const strategy = formulationStrategy(attempt);
    let drafts;
    try {
      drafts = await llm.compile({
        question: trimmed,
        filename,
        document: clipped.document,
        files: bundled.files,
        sourcesText: clipped.sources,
        feedback,
        attempt,
        strategy,
        image: imageAttached,
        history: prior,
      });
    } catch (error) {
      if (!retryableFormulationError(error)) throw error;
      lastError = error;
      feedback = failureNote(
        error instanceof Error
          ? error.message
          : "The question list was not valid.",
        attempt,
      );
      continue;
    }

    const validated = validateQuestions(
      repairDrafts(Array.isArray(drafts) ? drafts : [], {
        fallbackInstructions: trimmed,
      }),
    );
    if (!validated.ok || Object.keys(validated.questions).length === 0) {
      feedback = failureNote(
        validated.ok
          ? "Return at least one closed question. An empty list cannot be scored."
          : validated.error,
        attempt,
      );
      continue;
    }

    try {
      return await finishVerdict({
        ...verdict,
        questions: validated.questions,
        warning: askWarning || undefined,
      });
    } catch (error) {
      if (!retryableFormulationError(error)) throw error;
      lastError = error;
      feedback = failureNote(
        error instanceof Error
          ? error.message
          : "Jev could not score that formulation.",
        attempt,
      );
    }
  }

  const fallback = validateQuestions(
    repairDrafts(
      examDrafts({
        question: prior.length ? followUpQuestion(trimmed, prior) : trimmed,
        document: clipped.document,
        sourcesText: clipped.sources,
      }),
      { fallbackInstructions: trimmed },
    ),
  );
  if (fallback.ok && Object.keys(fallback.questions).length > 0) {
    try {
      return await finishVerdict({
        ...verdict,
        questions: fallback.questions,
        warning: [MODEL_FALLBACK_WARNING, askWarning].filter(Boolean).join(" "),
      });
    } catch (error) {
      if (!retryableFormulationError(error)) throw error;
      lastError = error;
    }
  }

  return {
    kind: "refusal",
    question: trimmed,
    message: refusalMessage(lastError),
  };
}
