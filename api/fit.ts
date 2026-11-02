import { buildFitPrompt } from './_lib/buildFitPrompt';
import { validateFitReport } from './_lib/validateFitReport';

// Vercel Edge Function — plain fetch wrapper, no SDK. Non-streaming: a single
// JSON response is simpler to parse and validate than an SSE stream here.
export const config = { runtime: 'edge' };

// Replaces the decommissioned llama-3.1-8b-instant; see the note in chat.ts.
// Reasoning is hidden here for the same reason and one more: this route hands
// `content` straight to JSON.parse, and a scratchpad in front of the object
// would degrade every rating to `{ ok: false }`.
const MODEL = 'openai/gpt-oss-20b';
const REASONING_FORMAT = 'hidden';
const REASONING_EFFORT = 'medium';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MAX_JD_LENGTH = 3000;
// Kept under the client's 15s cutoff (useFitRater FIT_TIMEOUT_MS) so a stalled
// upstream is reported as `timeout` here, with a reason, instead of the browser
// aborting first and the server call running on unobserved.
const UPSTREAM_TIMEOUT_MS = 12_000;

// Why a rating failed. The client maps this to a message that tells the user
// what to do: "paste it again" is right for `invalid_output` and wrong for the
// rest, where the same JD is fine and only waiting helps.
type FitFailureReason = 'rate_limited' | 'upstream_error' | 'timeout' | 'invalid_output';

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// Status stays 200 by contract (docs/API.md: one thing for the client to branch
// on), so platform error metrics never see these. The log line is the only
// server-side trace, and it carries no JD text, key, or upstream error body.
function fail(reason: FitFailureReason, detail: string, extra: Record<string, unknown> = {}): Response {
  console.error(`[api/fit] ${reason}: ${detail}`);
  return json({ ok: false, reason, ...extra }, 200);
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, 405);
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return json({ ok: false, error: 'Server is missing GROQ_API_KEY.' }, 500);
  }

  let jobDescription: string;
  try {
    const body = (await req.json()) as { jobDescription?: unknown } | null;
    if (typeof body?.jobDescription !== 'string' || !body.jobDescription.trim()) {
      return json({ ok: false, error: 'Paste a job description to get your fit score.' }, 400);
    }
    jobDescription = body.jobDescription.trim().slice(0, MAX_JD_LENGTH);
  } catch {
    return json({ ok: false, error: 'Invalid request body' }, 400);
  }

  try {
    const groqResponse = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        reasoning_format: REASONING_FORMAT,
        reasoning_effort: REASONING_EFFORT,
        messages: [{ role: 'user', content: buildFitPrompt(jobDescription) }],
        // Reasoning tokens are billed against this ceiling, and in
        // `json_object` mode a truncated object comes back as a NON-retryable
        // HTTP 400 -- not a short answer. At 600 this route returned 400 on
        // every request under gpt-oss-20b (measured: 1,084 reasoning tokens at
        // default effort). Headroom is free; the failure is total.
        max_tokens: 2000,
        temperature: 0.3,
        stream: false,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    if (!groqResponse.ok) {
      // A 429 is the expected failure on the free tier (8k TPM, 200k tokens/day)
      // and the one where retrying immediately makes things worse, so it gets
      // its own reason and the server's stated wait when there is one.
      if (groqResponse.status === 429) {
        const retryAfter = Number(groqResponse.headers.get('retry-after'));
        return fail(
          'rate_limited',
          'Groq 429',
          Number.isFinite(retryAfter) && retryAfter > 0 ? { retryAfterSeconds: Math.ceil(retryAfter) } : {},
        );
      }
      return fail('upstream_error', `Groq ${groqResponse.status}`);
    }

    const data = (await groqResponse.json()) as {
      choices?: Array<{ message?: { content?: unknown }; finish_reason?: string }>;
    } | null;
    const choice = data?.choices?.[0];
    const raw = choice?.message?.content;
    if (typeof raw !== 'string') return fail('invalid_output', 'no message content');

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // finish_reason 'length' here means max_tokens truncated the object.
      return fail('invalid_output', `not JSON (finish_reason=${choice?.finish_reason})`);
    }

    const report = validateFitReport(parsed);
    if (!report) return fail('invalid_output', 'failed validateFitReport');

    return json({ ok: true, report }, 200);
  } catch (err) {
    if ((err as Error)?.name === 'TimeoutError') {
      return fail('timeout', `no Groq response within ${UPSTREAM_TIMEOUT_MS}ms`);
    }
    return fail('upstream_error', `request failed: ${(err as Error)?.name ?? 'unknown'}`);
  }
}
