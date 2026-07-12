# Ask Adam — AI Candidate Brief

An AI chat app that answers questions about me as an engineering candidate — built as both a technical assessment submission and a live demo of what I can ship.

## The process

The brief asked for a streaming AI chat with persistent history, markdown rendering, session management, and unit tests. Rather than build a generic demo, I turned it into something with a point of view: a tool that actually pitches me.

**Design first.** I mocked the UI in Claude Design before writing any React. That gave me a concrete visual target — an editorial-brutalist aesthetic with a warm bone palette (`#f1ece1`), vermilion accent (`#cc3a14`), and a two-font system (Instrument Serif for display, JetBrains Mono for UI). Locking that in upfront meant implementation was about execution, not decisions.

**System prompt as RAG.** True RAG (embeddings + vector search) would be overkill for a single candidate's background. Instead, I wrote a structured system prompt in `src/data/context.ts` that's injected as the first message on every API call. The model answers questions about me grounded in that document — projects, stack, numbers, narrative — rather than hallucinating generics. Same practical effect, auditable in one file.

**Hooks with one job each.** `useChatHistory` only knows about localStorage. `useStreamingChat` only knows about the API. They're decoupled so they can be tested independently and swapped without touching each other.

**Streaming via `getReader()`.** The SSE reader loop pulls chunks from the response body, parses `content_block_delta` events, and appends tokens using functional `setState` so React batches never drop a character mid-stream.

**Groq key stays server-side.** `api/chat.ts` and `api/fit.ts` are Vercel Edge Functions — plain `fetch` wrappers, no SDK — that hold `GROQ_API_KEY` and forward requests to Groq. The client never sees the key. In dev, a small Vite plugin (`vite.config.ts`) intercepts `POST /api/chat` and `/api/fit`, loads the *actual* `api/*.ts` handler via `server.ssrLoadModule()`, and runs it locally — so dev and prod execute identical code with no `vercel dev` dependency.

**JD Fit Rater.** A second tab (`FitPanel`/`FitReportView`/`useFitRater`) lets a recruiter paste a job description and get a calibrated 1–10 fit score with a per-category breakdown, honest gaps, and a tailored pitch — a single non-streaming JSON call to `api/fit.ts`, validated server-side against the `FitReport` shape before it ever reaches the client.

---

## Checklist

| Requirement | Implementation |
|---|---|
| Persistent chat history | `useChatHistory` — localStorage, survives refresh |
| Clear / reset | Armed two-step "Clear chat" button + `⌘K` shortcut |
| Markdown rendering | `react-markdown` + `remark-gfm` — code blocks, bold, lists, tables |
| JD Fit Rater | `useFitRater` + `api/fit.ts` — scored, validated fit report |
| Unit tests | `sanitize`, `useChatHistory`, `ChatMessage`, `validateFitReport`, `useFitRater`, `scoreColor` |

---

## Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript (strict mode) |
| Build | Vite |
| Backend | Vercel Edge Functions (`api/chat.ts`, `api/fit.ts`) |
| AI | Groq API (`llama-3.1-8b-instant`) — SSE streaming for chat, JSON mode for the fit rater |
| Markdown | `react-markdown` + `remark-gfm` |
| Tests | Vitest + `@testing-library/react` |

---

## Setup

```bash
git clone <repo>
cd ffind-technical
cp .env.example .env        # add your GROQ_API_KEY (free at console.groq.com)
npm install
npm run dev                 # http://localhost:5173
```

## Testing

```bash
npm test
```

## Benchmarking

With a dev server running (it holds `GROQ_API_KEY`), measure real endpoint
latency and streaming throughput:

```bash
npm run dev                    # terminal 1
npm run bench                  # terminal 2 — TTFT, tokens/sec, fit round-trip
npm run bench -- --save        # also refresh docs/samples/
```

## Documentation

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — system map, request
  lifecycles, module responsibilities, design decisions, and the security model.
- **[docs/API.md](docs/API.md)** — reference for `POST /api/chat` (SSE) and
  `POST /api/fit` (JSON): request/response shapes, status codes, curl examples.
- **[docs/samples/](docs/samples/)** — representative chat transcript and a
  validated fit report, regenerable via `npm run bench -- --save`.

## Deployment

Deploys to Vercel with zero config — it auto-detects the Vite build output plus the `api/*.ts` Edge Functions. Set `GROQ_API_KEY` as an environment variable in the Vercel project settings (never `VITE_`-prefixed, so it stays server-side), then:

```bash
npx vercel        # first deploy, links the project
npx vercel --prod # promote to production
```

---

## What I'd add with more time

- **Model selector** — switch between Groq models from the masthead
- **Chat export** — download conversation as Markdown
- **Token usage display** — surface input/output token counts in the UI
- **Conversation branching** — retry from any message, not just the last
- **Embed the context** — move from system-prompt injection to real vector retrieval for larger knowledge bases
- **Recruiter contact capture** — a lightweight lead-capture form after a fit report renders
