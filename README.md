# ChatJev

Attach a document and ask [Jev](https://learnjev.com/reference) closed questions about it.

Jev is not a chat model. It takes extracted text as `state` and returns typed judgments (`noul`, `choice`, `score`). ChatJev is a TypeScript web wrapper: one document per session, many follow-up questions, and a human-readable verdict such as “Jev thinks yes with a 90% probability…”.

## Feasibility

| Layer                                      | Generic?  | What ChatJev does                                                                        |
| ------------------------------------------ | --------- | ---------------------------------------------------------------------------------------- |
| Domain (medical, legal, finance, anything) | Yes       | Jev evaluates the supplied text. There are no medical- or legal-specific schemas.        |
| File type                                  | Partially | Jev is text-only. ChatJev extracts text from common document types and rejects the rest. |
| Question type                              | No        | Closed judgments work. “Summarize this”, “explain this”, and “rewrite this” are refused. |

Jev’s state budget is about **32,000 tokens**. ChatJev estimates 4 characters per token and **truncates with a visible warning** rather than silently chunking. Chunk-and-merge is out of scope for v1.

Input is English-primary. Other languages are accepted with lower accuracy.

## Supported files

- Text: `.txt`, `.md`, `.csv`, `.json`, `.html`
- Documents: `.pdf`, `.docx`

Not supported in v1: images, scanned PDFs (no OCR), audio, video, and unknown binaries.

## What a question looks like

Works:

> Does this medical document strongly suggest a correlation between nicotine and heart disease?

Does not work:

> Summarize this paper.

ChatJev first asks Jev whether the prompt is a closed judgment (cheap call, question only). If it is, ChatJev evaluates the document with three generic questions:

1. **Noul** — the user’s question as a yes/no proposition
2. **Choice** — supported / contradicted / not mentioned
3. **Score** — evidence strength

The UI renders those answers as a verdict card. There is no second LLM.

## Setup

Node 20 or newer. Jev is waitlisted early access — get a key from [console.typesafe.ai](https://console.typesafe.ai).

```bash
npm install
cp .env.example .env
```

Set `TYPESAFE_API_KEY` in `.env`. Optional: `TYPESAFE_DEFAULT_MODEL` (defaults to `jev-latest`) and `PORT` (defaults to `3001`).

To click through the UI without a TypeSafe key:

```bash
CHATJEV_MOCK_JEV=1 npm run dev
```

That uses a local demo client. It is not Jev, and it is not for production.

The web app talks to a local API so the TypeSafe key never ships to the browser.

## Run

```bash
npm test
npm run dev
```

- API: http://127.0.0.1:3001
- UI: http://127.0.0.1:5173 (`/api` is proxied)

```bash
npm run build
npm start
```

`npm start` serves the built UI from `dist/web` on the API port after `npm run build`.

## API

| Method | Path                    | Purpose                                                                         |
| ------ | ----------------------- | ------------------------------------------------------------------------------- |
| `POST` | `/api/sessions`         | Multipart upload (`file`). Returns session id, filename, size, truncation flag. |
| `GET`  | `/api/sessions/:id`     | Session metadata only — not the extracted text.                                 |
| `POST` | `/api/sessions/:id/ask` | JSON `{ "question": "..." }`. Returns a verdict or a refusal.                   |

Sessions live in memory and disappear when the process exits.

## Tests

`npm test` uses a fake Jev client. CI never calls TypeSafe.

Coverage includes extractors, truncation, question classification, compiler shape, verdict copy, the nicotine/heart-disease fixture, and HTTP attach/ask/error paths.

## Layout

```
src/core/      ingest, classify, compile, Jev client, verdict copy
src/server/    Hono API
src/web/       Vite + React chat UI
tests/         Vitest
```

## Out of scope

- OCR / scanned PDFs
- Chunk-and-aggregate for book-length documents
- A generative model that writes prose around the verdict
- Durable session storage
- Streaming (Jev has no stream endpoint)
