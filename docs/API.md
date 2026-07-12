# API Reference

Two Edge Function endpoints back the app. Both are POST-only, both hold
`GROQ_API_KEY` server-side, and both proxy [Groq](https://console.groq.com)
(`llama-3.1-8b-instant`). The browser talks only to these `/api/*` routes — it
never sees the key or Groq directly.

- [`POST /api/chat`](#post-apichat) — streaming chat (Server-Sent Events)
- [`POST /api/fit`](#post-apifit) — job-description fit rating (JSON)
- [Local execution](#local-execution) — how the dev shim runs these
- [Benchmarking](#benchmarking) — measuring latency and throughput

Base URL is same-origin: `http://localhost:5173` in dev, your Vercel domain in
prod.

---

## `POST /api/chat`

Streams a grounded assistant reply as Server-Sent Events. The handler prepends
`SYSTEM_PROMPT` (from `src/data/context.ts`) server-side, so the request body
carries only the conversation.

### Request

```http
POST /api/chat
Content-Type: application/json
```

```jsonc
{
  "messages": [
    { "role": "user",      "content": "What has Adam shipped?" },
    { "role": "assistant", "content": "He built BodyCraft…" },
    { "role": "user",      "content": "What stack?" }
  ]
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `messages` | `Array<{ role, content }>` | yes | Full conversation, oldest first. `role` is `"user"` or `"assistant"`. The system prompt is **not** included — the server adds it. |

The client caps a single user message at **8000 characters** before sending.

### Response — success (`200`)

`Content-Type: text/event-stream`. OpenAI-style SSE frames; each content delta:

```
data: {"choices":[{"delta":{"content":"He"}}]}

data: {"choices":[{"delta":{"content":" built"}}]}

data: [DONE]
```

Consume by reading `response.body.getReader()`, splitting on `\n`, taking lines
that start with `data: `, and concatenating `choices[0].delta.content`. Stop on
`data: [DONE]`. (This is exactly what `useStreamingChat` does.)

### Response — error

Errors are returned **before** the stream starts, as flat JSON:

```json
{ "error": "Human-readable message" }
```

| Status | When |
|---|---|
| `400` | Body isn't valid JSON, or `messages` isn't an array |
| `405` | Method isn't POST |
| `500` | Server missing `GROQ_API_KEY` |
| `502` | Couldn't reach Groq |
| `4xx`/`5xx` | Groq returned an error — its nested `{ error: { message } }` is normalized to flat `{ error: string }` |

### Example

```bash
curl -N -X POST http://localhost:5173/api/chat \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"Summarize Adam in one line."}]}'
```

`-N` disables curl buffering so you see tokens arrive live.

---

## `POST /api/fit`

Rates how well the candidate fits a pasted job description. Single non-streaming
JSON response, structurally validated server-side before it's returned.

### Request

```http
POST /api/fit
Content-Type: application/json
```

```json
{ "jobDescription": "Forward-deployed engineer at an AI-native startup…" }
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `jobDescription` | `string` | yes | Non-empty. Trimmed to **3000 characters** server-side (`MAX_JD_LENGTH`). |

### Response — success (`200`)

```json
{
  "ok": true,
  "report": {
    "overall_score": 8,
    "categories": {
      "tech_stack":       { "score": 8, "rationale": "…one sentence…" },
      "experience_level": { "score": 6, "rationale": "…one sentence…" },
      "seniority":        { "score": 6, "rationale": "…one sentence…" },
      "domain_fit":       { "score": 9, "rationale": "…one sentence…" },
      "working_style":    { "score": 9, "rationale": "…one sentence…" }
    },
    "gaps": ["…honest gap…"],
    "tailored_pitch": "…exactly two sentences referencing the JD…"
  }
}
```

**`report` schema** (see `src/types/fit.ts`, enforced by
`api/_lib/validateFitReport.ts`):

| Field | Type | Constraint |
|---|---|---|
| `overall_score` | `number` | integer-ish, `1–10` |
| `categories` | object | all five keys required: `tech_stack`, `experience_level`, `seniority`, `domain_fit`, `working_style` |
| `categories[k].score` | `number` | `1–10` |
| `categories[k].rationale` | `string` | non-empty, one sentence |
| `gaps` | `string[]` | **1–3** non-empty items (never empty) |
| `tailored_pitch` | `string` | non-empty; references something in the JD |

### Response — failure (`200` with `ok: false`)

The fit endpoint returns HTTP `200` even on failure and signals the outcome in
the body, so the client has one thing to branch on:

```json
{ "ok": false }
```

Returned when the JD is missing/blank (also `400` in that case), Groq errors,
the model's output isn't valid JSON, or the JSON fails `validateFitReport`.
Validation **rejects** partial matches rather than coercing them — a half-valid
report is treated as no report.

| Status | Body | When |
|---|---|---|
| `200` | `{ ok: true, report }` | Valid report produced |
| `200` | `{ ok: false }` | Groq/parse/validation failure |
| `400` | `{ ok: false, error }` | Missing or blank `jobDescription` |
| `405` | `{ ok: false, error }` | Method isn't POST |
| `500` | `{ ok: false, error }` | Server missing `GROQ_API_KEY` |

### Example

```bash
curl -X POST http://localhost:5173/api/fit \
  -H 'content-type: application/json' \
  -d '{"jobDescription":"Solutions engineer, React + TypeScript, works directly with customers."}'
```

---

## Local execution

In production these are Vercel Edge Functions. Locally there is **no
`vercel dev` dependency** — `edgeApiDevPlugin` in `vite.config.ts` intercepts the
two exact paths, loads the real `api/*.ts` handler via
`server.ssrLoadModule()`, and:

1. Rejects non-POST with `405` (so extensionless GETs never fall through to
   Vite's static server and leak the source file).
2. Buffers the request body and rebuilds a standard `Request` object.
3. Awaits the handler's `Response` and pipes its (possibly streaming) body back.

Because the handler is loaded fresh per request, edits to `api/*.ts` are picked
up without a restart. The unprefixed `GROQ_API_KEY` is copied from `.env` into
`process.env` by the config so it's visible to the handlers — mirroring how
Vercel injects it in prod.

To add a third endpoint, create `api/<name>.ts` and add `/api/<name>` to
`API_ROUTES` in `vite.config.ts`.

---

## Benchmarking

`scripts/benchmark.mjs` exercises both endpoints against a running server and
reports latency and streaming throughput. It makes **real Groq calls**, so start
the dev server (which holds your key) first:

```bash
npm run dev                 # terminal 1 — serves /api/* with your GROQ_API_KEY
npm run bench               # terminal 2 — hits http://localhost:5173 by default
```

Options:

```bash
npm run bench -- --url https://your-app.vercel.app   # target a deployment
npm run bench -- --runs 5                             # average over N runs (default 3)
npm run bench -- --save                               # also write docs/samples/*
```

For chat it reports **time-to-first-token (TTFT)**, total stream time, token
count, and tokens/sec; for fit, total latency and whether a valid report
validated. See [`samples/`](samples/) for representative output.
