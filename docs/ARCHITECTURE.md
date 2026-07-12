# Architecture

How **Ask Adam** is put together, and *why* each piece is shaped the way it is.
The README pitches the app; this document is the map you'd want before changing it.

- [System at a glance](#system-at-a-glance)
- [Request lifecycles](#request-lifecycles)
- [Module responsibilities](#module-responsibilities)
- [Design decisions & rationale](#design-decisions--rationale)
- [Security model](#security-model)
- [Failure handling](#failure-handling)
- [Testing strategy](#testing-strategy)
- [Extending the app](#extending-the-app)

---

## System at a glance

Two independent features share one shell, one design system, and one grounding
document. Neither knows about the other.

```
                            Browser (React 19 + TS strict)
  ┌───────────────────────────────────────────────────────────────────────┐
  │  App.tsx  — masthead, ⌘K clear, two-step armed reset, view switch      │
  │     │                                                                  │
  │     ├── view: 'chat' ──► ChatHistory / ChatInput                       │
  │     │        useChatHistory (localStorage)   useStreamingChat (SSE)    │
  │     │                                                                  │
  │     └── view: 'fit'  ──► FitPanel / FitReportView                      │
  │                                     useFitRater (single JSON call)     │
  └───────────────────────────────────────────────────────────────────────┘
        │  POST /api/chat  (SSE stream)          │  POST /api/fit  (JSON)
        ▼                                        ▼
  ┌───────────────────────────────────────────────────────────────────────┐
  │  Edge Functions (Vercel in prod · Vite dev shim locally)               │
  │  api/chat.ts  — prepends SYSTEM_PROMPT, proxies Groq stream through    │
  │  api/fit.ts   — builds rating prompt, validates JSON before returning  │
  │  Both hold GROQ_API_KEY. Client never sees it.                         │
  └───────────────────────────────────────────────────────────────────────┘
        │                                        │
        ▼                                        ▼
             Groq API  ·  llama-3.1-8b-instant
       (SSE streaming for chat · JSON mode for fit)
```

The **grounding document** (`src/data/context.ts`) is the one thing both paths
depend on: `SYSTEM_PROMPT` grounds the chat, `FIT_CONTEXT_SUMMARY` grounds the
rater. Update the candidate's story in one file and both features follow.

---

## Request lifecycles

### Chat (streaming)

1. `useStreamingChat.sendMessage()` validates the input (non-empty, `≤ 8000`
   chars), appends a `user` message and an empty `streaming: true` assistant
   placeholder, and opens an `AbortController` with a 45s timeout.
2. It POSTs the full conversation (minus the placeholder) to `/api/chat`.
3. `api/chat.ts` prepends `SYSTEM_PROMPT` server-side and calls Groq with
   `stream: true`, then returns Groq's response body **unmodified** — the Edge
   Function is a transparent pipe once the request is authorized.
4. The client reads the body with `getReader()`, decodes SSE frames
   (`data: {"choices":[{"delta":{"content":"…"}}]}`), and appends each token via
   a **functional** `setState` so React batching never drops a character.
5. On `[DONE]` (or stream end) the placeholder is marked `streaming: false` and
   `useChatHistory` persists the final message array to `localStorage`.

Cancellation, timeout, and API errors all resolve through the same `catch`,
which distinguishes `AbortError` (silent) from `TimeoutError` (retryable) from a
real API error (surfaced with the server's message).

### Fit rating (non-streaming)

1. `useFitRater.rateFit()` trims the JD to `3000` chars and POSTs it to
   `/api/fit` with a 15s timeout.
2. `api/fit.ts` embeds the JD in a calibrated rating prompt, calls Groq with
   `response_format: { type: 'json_object' }` and `temperature: 0.3`, then runs
   the raw string through `validateFitReport()`.
3. Validation **rejects rather than coerces**: a payload that doesn't exactly
   match the `FitReport` shape returns `{ ok: false }`, which the client renders
   as a friendly "try again". A malformed model response never reaches the UI.

---

## Module responsibilities

| Module | Owns | Deliberately does *not* know about |
|---|---|---|
| `src/App.tsx` | Layout, view switching, ⌘K, armed clear | The API, storage internals |
| `src/hooks/useChatHistory.ts` | `localStorage` read/write, message CRUD | The network |
| `src/hooks/useStreamingChat.ts` | SSE fetch, token accumulation, chat errors | Where messages are stored |
| `src/hooks/useFitRater.ts` | Fit fetch, timeout, fit errors | Chat |
| `api/chat.ts` | Groq key, system prompt, stream proxy, error normalization | The UI |
| `api/fit.ts` | Groq key, rating prompt, server-side validation | The UI |
| `api/_lib/validateFitReport.ts` | Structural validation of model JSON | HTTP, Groq |
| `src/data/context.ts` | The candidate grounding (single source of truth) | Everything else |
| `src/utils/sanitize.ts` | Stripping dangerous HTML pre-render | Markdown rendering |
| `src/utils/scoreColor.ts` | Score → tier (`good`/`mid`/`low`) mapping | Layout |
| `vite.config.ts` (`edgeApiDevPlugin`) | Running `api/*.ts` locally, dev/prod parity | Prod |

The recurring rule: **each hook has exactly one job.** `useChatHistory` is pure
storage; `useStreamingChat` is pure transport. That's what makes them testable
in isolation and swappable without touching each other (see
[Testing strategy](#testing-strategy)).

---

## Design decisions & rationale

**System prompt as RAG, not embeddings.** For a single candidate's background,
a vector store is overkill. `src/data/context.ts` is injected as the system
message on every call — same practical grounding, auditable in one file, zero
infra. The trade-off (doesn't scale past what fits in a context window) is
acceptable and documented as a "what I'd add with more time" item.

**Edge Functions as thin `fetch` wrappers, no SDK.** `api/chat.ts` and
`api/fit.ts` are plain `fetch` calls to Groq's OpenAI-compatible endpoint. No
SDK means no version drift, a tiny cold start, and a request path you can read
end to end in one screen.

**Dev/prod parity via a Vite shim, not `vercel dev`.** `edgeApiDevPlugin` in
`vite.config.ts` intercepts `POST /api/chat` and `/api/fit` and executes the
*actual* handler files through `server.ssrLoadModule()`. Local dev and Vercel
prod run identical code, with no extra CLI dependency and hot-reload on handler
edits. (See [API reference › Local execution](API.md#local-execution) for the
exact request translation.)

**Streaming for chat, JSON mode for fit.** Chat wants perceived latency — tokens
on screen as fast as possible — so it streams. The fit rater wants a *validated
structured object*, which is far simpler to guarantee from one JSON response
than by reassembling a stream. Different needs, different transport.

**Reject-don't-coerce validation.** `validateFitReport` treats any schema
mismatch as a parse failure instead of clamping scores or padding arrays. A
half-valid report is more dangerous than an honest "couldn't analyze this" — so
the boundary is strict and the failure is graceful.

---

## Security model

- **The Groq key never leaves the server.** It lives only in `process.env` on
  the Edge Functions. It is deliberately **not** `VITE_`-prefixed, so Vite
  cannot inline it into the client bundle. The browser only ever talks to
  `/api/*`.
- **Input is bounded before it reaches the model.** Chat caps at 8000 chars
  client-side; the fit rater trims the JD to 3000 chars on both the client and
  the server (`MAX_JD_LENGTH`) — the server cut is authoritative.
- **Model output is sanitized before render.** `sanitize()` strips
  `<script>`/`<style>`/`<iframe>`, inline event handlers, and `javascript:`
  hrefs as defence-in-depth before markdown rendering, even though
  `react-markdown` doesn't use `innerHTML`.
- **Fit output is structurally validated** server-side before it is ever sent to
  the client.

---

## Failure handling

Every network path funnels through one `try/catch` that classifies the error:

| Kind | Trigger | UX |
|---|---|---|
| `validation` | Empty / oversized input | Inline message, no request sent |
| `timeout` | 45s (chat) / 15s (fit) `AbortController` fires | "No response within Ns. Try again?" + retry |
| `api` | Non-2xx, network failure, or (chat) unparseable stream | Server's normalized message + retry |
| *silent* | User-initiated `AbortError` (cancel / new message) | Returns to `idle`, no error shown |

`api/chat.ts` normalizes Groq's nested `{ error: { message } }` shape into the
flat `{ error: string }` the client expects, so the surfaced message is always a
plain string.

---

## Testing strategy

Unit tests target the pure, decoupled pieces — which is the payoff of
single-responsibility hooks:

| Test | Verifies |
|---|---|
| `sanitize.test.ts` | Dangerous HTML stripped, plain text preserved |
| `scoreColor.test.ts` | Score → tier boundaries (`7`, `5`) |
| `validateFitReport.test.ts` | Rejects malformed payloads, accepts valid ones |
| `useChatHistory.test.ts` | localStorage persistence, clear, stale-flag stripping |
| `useFitRater.test.ts` | Loading/error/timeout states, retry |
| `ChatMessage.test.tsx` | Markdown rendering, streaming cursor |

Because `useChatHistory` never touches the network and `useStreamingChat` never
touches storage, each is tested with the other mocked or absent.

```bash
npm test              # one-shot (vitest run)
npm run test:watch    # watch mode
```

---

## Extending the app

- **Change the candidate story** → edit `src/data/context.ts` only. Both chat
  and fit follow.
- **Add an endpoint** → add `api/<name>.ts` (export `config.runtime = 'edge'`
  and a default handler), then register `/api/<name>` in `API_ROUTES` in
  `vite.config.ts` so the dev shim serves it.
- **Swap the model** → change `MODEL` in both `api/chat.ts` and `api/fit.ts`.
- **Measure a change** → run `scripts/benchmark.mjs` against a running dev
  server (see [API reference › Benchmarking](API.md#benchmarking)).
