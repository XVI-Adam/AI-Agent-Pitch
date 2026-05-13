# Dispatch & Co.

An editorial-brutalist AI chat client that streams responses token-by-token from the Anthropic API, with full conversation persistence and a typographically rigorous design system.

## Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript (strict mode) |
| Build | Vite |
| AI | Anthropic API (`claude-sonnet-4-20250514`) via SSE streaming |
| Markdown | `react-markdown` + `remark-gfm` |
| Tests | Vitest + `@testing-library/react` |

## Setup

```bash
git clone <repo>
cd ffind-technical
cp .env.example .env        # add your VITE_ANTHROPIC_API_KEY
npm install
npm run dev                 # http://localhost:5173
```

## Testing

```bash
npm test                    # run once
npm run test:watch          # watch mode
```

All 20 tests pass across three suites: `sanitize`, `useChatHistory`, and `ChatMessage`.

## Architecture decisions

**Why streaming?** Streaming responses over SSE dramatically reduces perceived latency. The first token arrives in ~200–400ms, giving the user immediate feedback rather than a 3–5s blank wait. The `useStreamingChat` hook owns the full request lifecycle: `AbortController` for cancellation, a 45s timeout, and functional `setState` inside the `onDelta` callback to ensure no tokens are dropped when React batches renders.

**Why custom hooks?** `useChatHistory` and `useStreamingChat` are intentionally decoupled — history persistence doesn't need to know about streaming, and the streaming transport doesn't need to know about localStorage. Each hook has a single responsibility, making them independently testable.

**Why this component split?** `ChatHistory` owns scroll management (sticky-bottom logic that yields when the user scrolls up). `ChatInput` owns focus state, textarea auto-sizing, and the Cmd+Enter shortcut. `Masthead` owns the armed two-step confirmation for clear. Splitting by responsibility keeps each file under 130 lines.

**Why a hand-rolled sanitizer?** `react-markdown` builds a React element tree rather than emitting raw HTML, so it's already XSS-safe. The `sanitize` util is a defence-in-depth pre-pass that strips `<script>`, event handlers, and `javascript:` hrefs before the string reaches the renderer — auditable in ~20 lines, no extra dependency.

## What I'd add with more time

- **Model selector** — dropdown in the masthead to switch between Sonnet, Haiku, and Opus
- **Chat export** — "Download as Markdown" button that serialises the conversation
- **Token usage display** — surface `input_tokens` and `output_tokens` from the API response in the masthead meta
- **Conversation branching** — retry from any message, not just the last one
- **System prompt editor** — let the user configure a persona or instructions before the session starts
# AI-Agent-Pitch
