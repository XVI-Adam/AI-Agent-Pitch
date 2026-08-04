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
export const DEFAULT_MODEL = 'llama-3.1-8b-instant';

// The judge is deliberately a BIGGER model than the one under test. The first
// full run used 8b for both and it scored mt-001 -- "Adam worked at Sigo Signs
// from October 2025 to December 2025, approximately 3 months", which is exactly
// right -- a groundedness of 1. A judge no stronger than the system it grades
// adds variance, not signal. Override with --judge-model.
export const DEFAULT_JUDGE_MODEL = 'llama-3.3-70b-versatile';

const CACHE_DIR = fileURLToPath(new URL('../.cache', import.meta.url));

export interface CompletionParams {
  model: string;
  temperature: number;
  max_tokens: number;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  response_format?: { type: 'json_object' };
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
  if (retryAfterSeconds !== undefined) return retryAfterSeconds * 1000 + Math.random() * 500;
  // Floor as well as ceiling: with pure full jitter, early attempts can draw
  // a near-zero delay and burn a retry against a TPM window that resets on a
  // 60s boundary. The floor makes each attempt actually worth spending.
  const ceiling = Math.min(1000 * 2 ** attempt, 45_000);
  return 750 + Math.random() * ceiling;
}

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
  let lastReason = 'unknown';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const started = Date.now();
    let response: Response;
    try {
      response = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${options.apiKey}` },
        body: JSON.stringify(params),
      });
    } catch (err) {
      lastReason = `network: ${(err as Error).message}`;
      const delay = backoffDelay(attempt);
      options.onRetry?.({ attempt: attempt + 1, delayMs: delay, reason: lastReason });
      await sleep(delay);
      continue;
    }

    if (response.ok) {
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const text = data.choices?.[0]?.message?.content;
      if (typeof text !== 'string') {
        lastReason = 'response had no message content';
        await sleep(backoffDelay(attempt));
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
    lastReason = `HTTP ${response.status}: ${body.slice(0, 200)}`;
    if (!retryable) throw new Error(`Groq request failed, not retryable — ${lastReason}`);

    const retryAfter = Number(response.headers.get('retry-after'));
    const delay = backoffDelay(attempt, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined);
    options.onRetry?.({ attempt: attempt + 1, delayMs: delay, reason: lastReason });
    await sleep(delay);
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
