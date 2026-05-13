# Ask Adam — AI Candidate Brief

An AI chat app that answers questions about me as an engineering candidate — built as both a technical assessment submission and a live demo of what I can ship.

## The process

The brief asked for a streaming AI chat with persistent history, markdown rendering, session management, and unit tests. Rather than build a generic demo, I turned it into something with a point of view: a tool that actually pitches me.

**Design first.** I mocked the UI in Claude Design before writing any React. That gave me a concrete visual target — an editorial-brutalist aesthetic with a warm bone palette (`#f1ece1`), vermilion accent (`#cc3a14`), and a two-font system (Instrument Serif for display, JetBrains Mono for UI). Locking that in upfront meant implementation was about execution, not decisions.

**System prompt as RAG.** True RAG (embeddings + vector search) would be overkill for a single candidate's background. Instead, I wrote a structured system prompt in `src/data/context.ts` that's injected as the first message on every API call. The model answers questions about me grounded in that document — projects, stack, numbers, narrative — rather than hallucinating generics. Same practical effect, auditable in one file.

**Hooks with one job each.** `useChatHistory` only knows about localStorage. `useStreamingChat` only knows about the API. They're decoupled so they can be tested independently and swapped without touching each other.

**Streaming via `getReader()`.** The SSE reader loop pulls chunks from the response body, parses `content_block_delta` events, and appends tokens using functional `setState` so React batches never drop a character mid-stream.

**CORS solved with a Vite proxy.** Direct browser calls to the AI API are blocked by CORS. Rather than a backend, the Vite dev server proxies `/api/groq/*` → `api.groq.com` server-side — same fix, zero infrastructure.

---

## Checklist

| Requirement | Implementation |
|---|---|
| Persistent chat history | `useChatHistory` — localStorage, survives refresh |
| Clear / reset | Armed two-step "Clear chat" button + `⌘K` shortcut |
| Markdown rendering | `react-markdown` + `remark-gfm` — code blocks, bold, lists, tables |
| Unit tests | 20 tests across `sanitize`, `useChatHistory`, `ChatMessage` |

---

## Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript (strict mode) |
| Build | Vite |
| AI | Groq API (`llama-3.1-8b-instant`) via SSE streaming |
| Markdown | `react-markdown` + `remark-gfm` |
| Tests | Vitest + `@testing-library/react` |

---

## Setup

```bash
git clone <repo>
cd ffind-technical
cp .env.example .env        # add your VITE_GROQ_API_KEY (free at console.groq.com)
npm install
npm run dev                 # http://localhost:5173
```

## Testing

```bash
npm test
```

---

## What I'd add with more time

- **Model selector** — switch between Groq models from the masthead
- **Chat export** — download conversation as Markdown
- **Token usage display** — surface input/output token counts in the UI
- **Conversation branching** — retry from any message, not just the last
- **Embed the context** — move from system-prompt injection to real vector retrieval for larger knowledge bases
