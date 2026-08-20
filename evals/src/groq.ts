import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Groq client for the harness. Calls the API directly with the SAME prompt
// strings the endpoints build (SYSTEM_PROMPT, buildFitPrompt) rather than going
// through a dev server: no server to keep alive, and full control of
// temperature, which /api/chat could not offer until this branch added the
// parameter.
//
// Free tier means rate limits WILL bite on a 61-case run. The design goal is
// that a 429 degrades the run's speed, never its result.

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Both llama-3.1-8b-instant and llama-3.3-70b-versatile were decommissioned by
// Groq and now return `model_not_found`; these are their replacements. Every
// model Groq still serves at this tier is a REASONING model, which is the whole
// reason the two reasoning fields below exist -- see CompletionParams.
export const DEFAULT_MODEL = 'openai/gpt-oss-20b';

// The judge is deliberately a BIGGER model than the one under test. The first
// full run used 8b for both and it scored mt-001 -- "Adam worked at Sigo Signs
// from October 2025 to December 2025, approximately 3 months", which is exactly
// right -- a groundedness of 1. A judge no stronger than the system it grades
// adds variance, not signal. 120b over 27b preserves that gap.
// Override with --judge-model.
export const DEFAULT_JUDGE_MODEL = 'openai/gpt-oss-120b';

// How each surface handles the fact that these models think before answering.
// Both settings send `reasoning_format: 'hidden'`, which keeps the scratchpad in
// a separate response field instead of in `content` -- verified on the STREAMING
// path too, where deltas carry only `role` and `content`. gpt-oss rejects
// `reasoning_effort: 'none'` outright (low/medium/high only), so the format is
// the lever that guarantees nothing leaks; effort only tunes how much it thinks.
//
//   Model under test: effort 'low'. At the default, one fit rating spent 1084
//   reasoning tokens and 1.9s; 'low' spends 57 and 0.6s for JSON that still
//   parses. This is a recruiter-facing chat box on an 8,000 TPM ceiling, and
//   reasoning delays the FIRST VISIBLE TOKEN -- the model cannot start writing
//   until it stops thinking. Grounding here is the ledger's job, not the
//   scratchpad's. Raise this if the suite starts reporting overclaims.
//
//   Judge: default effort. A judge deciding groundedness is the one place worth
//   paying full reasoning for, and nobody is watching it stream.
//
// Reasoning tokens are billed against max_tokens on BOTH surfaces -- the single
// most expensive lesson of this migration. See the judge's max_tokens note.
export const MODEL_REASONING = { reasoning_format: 'hidden', reasoning_effort: 'low' } as const;
export const JUDGE_REASONING = { reasoning_format: 'hidden' } as const;

const CACHE_DIR = fileURLToPath(new URL('../.cache', import.meta.url));

export interface CompletionParams {
  model: string;
  temperature: number;
  max_tokens: number;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  response_format?: { type: 'json_object' };
  /** Tunes how much the model thinks. gpt-oss accepts low/medium/high only. */
  reasoning_effort?: 'none' | 'low' | 'medium' | 'high';
  /** Keeps thinking out of `content` without suppressing it. */
  reasoning_format?: 'hidden' | 'parsed' | 'raw';
}

export interface CompletionResult {
  text: string;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  /** How many times the call was retried before succeeding. */
  retries: number;
  /** True when served from disk without spending quota. */
  cached: boolean;
}

/**
 * Cache key: a hash of the exact request.
 *
 * `params.messages` carries the BUILT prompt string — the system message for
 * chat, the composed fit prompt for fit — so the key tracks what the model
 * actually saw, not which file it came from. That distinction is the whole
 * point: editing an unrelated line of `context.ts` used to invalidate all 61
 * cases and cost hours of re-earning identical responses against a 6,000 TPM
 * ceiling. Now only cases whose prompt genuinely differs miss.
 */
export function cacheKey(params: CompletionParams): string {
  return createHash('sha256').update(JSON.stringify(params)).digest('hex').slice(0, 32);
}

function readCache(key: string): CompletionResult | undefined {
  const path = join(CACHE_DIR, `${key}.json`);
  if (!existsSync(path)) return undefined;
  try {
    return { ...(JSON.parse(readFileSync(path, 'utf8')) as CompletionResult), cached: true };
  } catch {
    return undefined;
  }
}

function writeCache(key: string, result: CompletionResult): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(join(CACHE_DIR, `${key}.json`), JSON.stringify(result, null, 2));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Exponential backoff with full jitter.
 *
 * Jitter matters more than the exponent here: without it, N workers that hit
 * the same 429 all retry at the same instant and reproduce the burst that
 * caused it. Full jitter spreads them across the whole window.
 */
function backoffDelay(attempt: number, retryAfterSeconds?: number): number {
  if (retryAfterSeconds !== undefined) {
    // Clamp what the server asks for. Groq's per-MINUTE limit asks for seconds,
    // but its per-DAY limit (200,000 tokens) can ask for tens of minutes — and sleeping hours inside one
    // case is how a run wedges silently instead of failing loudly. Anything the
    // clamp cuts off is quota that will not recover within this run anyway;
    // the per-call deadline below turns it into a failed case with the server's
    // stated wait in the message.
    return Math.min(retryAfterSeconds * 1000, MAX_RETRY_AFTER_MS) + Math.random() * 500;
  }
  // Floor as well as ceiling: with pure full jitter, early attempts can draw
  // a near-zero delay and burn a retry against a TPM window that resets on a
  // 60s boundary. The floor makes each attempt actually worth spending.
  const ceiling = Math.min(1000 * 2 ** attempt, 45_000);
  return 750 + Math.random() * ceiling;
}

/**
 * Condenses a Groq error body to the part worth reading in a log line.
 *
 * Groq's rate-limit messages put the boilerplate first ("Rate limit reached for
 * model X in organization org_01krh...") and the diagnosis LAST — which limit
 * was hit, how much is left, and when it resets. Truncating the front keeps the
 * noise and drops the signal: an entire run's worth of retry lines can look
 * identical whether the cause is a per-minute window that clears in seconds or
 * a per-DAY cap that will not clear before the run ends. Keep the tail.
 */
export function summarizeError(body: string): string {
  let message = body;
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    if (typeof parsed.error?.message === 'string') message = parsed.error.message;
  } catch {
    // Not JSON — fall through and treat the raw body as the message.
  }
  message = message.replace(/\s+/g, ' ').trim();

  // The limit clause ("... on tokens per day (TPD): Limit 100000, Used 99416
  // ... Please try again in 42m31s") is the whole point of the line.
  const limit = /\b(?:on )?(tokens?|requests?) per (day|minute|hour)\b[^.]*\.?/i.exec(message);
  const again = /Please try again in [0-9hms.]+/i.exec(message);
  if (limit) return [limit[0], again?.[0]].filter(Boolean).join(' ').slice(0, 220);

  return message.length > 220 ? `${message.slice(0, 200)}…` : message;
}

/**
 * Names the one non-retryable 400 that is a BUDGET bug, not a request bug.
 *
 * In `json_object` mode Groq validates the generation server-side, so an object
 * truncated by max_tokens comes back as "Failed to validate JSON. Please adjust
 * your prompt" — advice that points at the prompt when the actual cause is the
 * ceiling. Reasoning models make this easy to hit, because their thinking is
 * billed against the SAME max_tokens as the answer: a verdict that needs 150
 * tokens can still overflow 700 after 600 tokens of reasoning. Nine cases died
 * this way on the first full run after the llama models were decommissioned,
 * and the error text sent the reader to the prompt every time.
 */
function truncatedJsonHint(status: number, body: string, params: CompletionParams): string {
  if (status !== 400 || !params.response_format) return '';
  if (!/validate JSON/i.test(body)) return '';
  return (
    ` — in json_object mode this usually means the object was TRUNCATED at max_tokens (${params.max_tokens}), ` +
    'not that the prompt is malformed. Reasoning tokens count against the same ceiling; raise it.'
  );
}

// Transport guard rails. An 8,000 TPM free tier makes waiting normal; these
// exist so waiting is bounded, visible, and charged to one case instead of the
// whole run.
const REQUEST_TIMEOUT_MS = 120_000; // one hung socket must not stop the suite
const MAX_RETRY_AFTER_MS = 120_000; // longest single wait we honor from retry-after
const CALL_DEADLINE_MS = 10 * 60_000; // retries + waits per call; then the case fails

export interface CompleteOptions {
  apiKey: string;
  maxRetries?: number;
  noCache?: boolean;
  /** Distinguishes repeated samples of the same case under --n. */
  cacheSalt?: string;
  /** Fail on a cache miss instead of spending quota — used by PR CI. */
  cachedOnly?: boolean;
  onRetry?: (info: { attempt: number; delayMs: number; reason: string }) => void;
}

export async function complete(params: CompletionParams, options: CompleteOptions): Promise<CompletionResult> {
  const key = cacheKey({ ...params, ...(options.cacheSalt ? { _salt: options.cacheSalt } : {}) } as CompletionParams);

  if (!options.noCache) {
    const hit = readCache(key);
    if (hit) return hit;
  }

  if (options.cachedOnly) {
    throw new Error(
      'cache miss under --cached-only: this case has no stored response for the current prompt. ' +
        'Run the full suite locally and commit the refreshed baseline.',
    );
  }

  const maxRetries = options.maxRetries ?? 10;
  const callStarted = Date.now();
  let lastReason = 'unknown';

  // Retrying is only worth it while the deadline leaves room to actually wait.
  // Failing one case keeps the other 60 results; blocking the run keeps none.
  const retryOrGiveUp = async (attempt: number, delay: number): Promise<void> => {
    if (Date.now() - callStarted + delay > CALL_DEADLINE_MS) {
      throw new Error(
        `Groq call exceeded its ${CALL_DEADLINE_MS / 60_000}min deadline after ${attempt} attempt(s) — ${lastReason}`,
      );
    }
    options.onRetry?.({ attempt: attempt + 1, delayMs: delay, reason: lastReason });
    await sleep(delay);
  };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const started = Date.now();
    let response: Response;
    try {
      response = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${options.apiKey}` },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      const timedOut = (err as Error).name === 'TimeoutError';
      lastReason = timedOut
        ? `request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`
        : `network: ${(err as Error).message}`;
      await retryOrGiveUp(attempt, backoffDelay(attempt));
      continue;
    }

    if (response.ok) {
      interface CompletionBody {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      }
      let data: CompletionBody;
      try {
        // The timeout signal also governs the body read: a socket that dies
        // mid-body aborts here rather than hanging.
        data = (await response.json()) as CompletionBody;
      } catch (err) {
        lastReason = `body read failed: ${(err as Error).message}`;
        await retryOrGiveUp(attempt, backoffDelay(attempt));
        continue;
      }
      const text = data.choices?.[0]?.message?.content;
      if (typeof text !== 'string') {
        lastReason = 'response had no message content';
        await retryOrGiveUp(attempt, backoffDelay(attempt));
        continue;
      }
      const result: CompletionResult = {
        text,
        latencyMs: Date.now() - started,
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        retries: attempt,
        cached: false,
      };
      if (!options.noCache) writeCache(key, result);
      return result;
    }

    // 429 and 5xx are worth waiting out. A 4xx that is not a rate limit is a
    // bug in the request and retrying just burns the remaining quota.
    const retryable = response.status === 429 || response.status >= 500;
    const body = await response.text().catch(() => '');
    lastReason = `HTTP ${response.status}: ${summarizeError(body)}`;
    if (!retryable) throw new Error(`Groq request failed, not retryable — ${lastReason}${truncatedJsonHint(response.status, body, params)}`);

    const retryAfter = Number(response.headers.get('retry-after'));
    const delay = backoffDelay(attempt, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined);
    await retryOrGiveUp(attempt, delay);
  }

  throw new Error(`Groq request failed after ${maxRetries} retries — ${lastReason}`);
}

/**
 * Bounded-concurrency map that does NOT fail the run when one task throws.
 *
 * A rate-limited harness that aborts on the first exhausted retry gives you
 * nothing; one that returns 58 of 61 results and says which three failed is
 * still a usable report. Failures come back as values.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<Array<{ ok: true; value: R } | { ok: false; error: Error; item: T }>> {
  const results: Array<{ ok: true; value: R } | { ok: false; error: Error; item: T }> = new Array(items.length);
  let cursor = 0;

  async function run(): Promise<void> {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      try {
        results[index] = { ok: true, value: await worker(items[index], index) };
      } catch (err) {
        results[index] = { ok: false, error: err as Error, item: items[index] };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}
