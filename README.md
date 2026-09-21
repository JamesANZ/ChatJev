# ChatJev

Attach a document and ask [Jev](https://learnjev.com/reference) closed questions about it.

Jev is not a chat model. It takes extracted text as `state` and returns typed judgments (`noul`, `choice`, `score`). ChatJev is a Next.js app: one document per session, many follow-up questions, and a human-readable verdict such as “Jev thinks yes with a 90% probability…”.

The TypeSafe key stays on the server. The browser only uploads a file and asks questions.

![ChatJev verdict after attaching a document and asking a closed question](docs/screenshot.jpg)

## Feasibility

| Layer                                      | Generic?  | What ChatJev does                                                                        |
| ------------------------------------------ | --------- | ---------------------------------------------------------------------------------------- |
| Domain (medical, legal, finance, anything) | Yes       | Jev evaluates the supplied text. There are no medical- or legal-specific schemas.        |
| File type                                  | Partially | Jev is text-only. ChatJev extracts text from common document types and rejects the rest. |
| Question type                              | No        | Closed judgments work. “Summarize this”, “explain this”, and “rewrite this” are refused. |

Jev’s state budget is about **32,000 tokens**. ChatJev estimates 4 characters per token and **truncates with a visible warning** rather than silently chunking.

## Supported files

- Text: `.txt`, `.md`, `.csv`, `.json`, `.html`
- Documents: `.pdf`, `.docx`

Not supported in v1: images, scanned PDFs (no OCR), audio, video, and unknown binaries.

## Local setup

Node 20 or newer. Get a key from [console.typesafe.ai](https://console.typesafe.ai).

```bash
npm install
cp .env.example .env.local
```

Set `TYPESAFE_API_KEY` in `.env.local`. Optional: `TYPESAFE_DEFAULT_MODEL` (defaults to `jev-latest`).

```bash
npm test
npm run dev
```

Open http://127.0.0.1:3000.

To click through the UI without calling TypeSafe:

```bash
CHATJEV_MOCK_JEV=1 npm run dev
```

## Deploy on Vercel

The app is a standard Next.js project. The Jev key must be a server env var, never `NEXT_PUBLIC_`.

```bash
npx vercel link
echo "$TYPESAFE_API_KEY" | npx vercel env add TYPESAFE_API_KEY production preview development
npx vercel --prod
```

## API

| Method | Path            | Purpose                                                                      |
| ------ | --------------- | ---------------------------------------------------------------------------- |
| `POST` | `/api/sessions` | Multipart upload (`file`). Returns extracted document text for the next ask. |
| `POST` | `/api/ask`      | JSON `{ question, document }`. Returns a verdict or a refusal.               |

Document text is held in the browser after extract so Vercel serverless instances do not need shared session memory.

## Tests

`npm test` uses a fake Jev client. CI never calls TypeSafe.

## Layout

```
src/core/        ingest, classify, compile, Jev client, verdict copy
src/lib/         route helpers and browser client
src/app/         Next.js App Router pages and API routes
src/components/  chat UI
tests/           Vitest
```

## Out of scope

- OCR / scanned PDFs
- Chunk-and-aggregate for book-length documents
- A generative model that writes prose around the verdict
- Durable session storage
- Streaming (Jev has no stream endpoint)
