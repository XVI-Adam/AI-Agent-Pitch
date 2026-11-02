import { useState, useRef, useCallback } from 'react';
import type { FitReport } from '../types/fit';

// Proxied through api/fit.ts — non-streaming, single JSON response.
const API_URL = '/api/fit';

// PRD targets a sub-10s render; 15s is the hard client cutoff, with margin
// above the UX target rather than exactly matching it.
const FIT_TIMEOUT_MS = 15_000;
const MAX_JD_LENGTH = 3_000;

const PARSE_FAILURE_MESSAGE = "Couldn't analyze this JD. Try pasting it again.";

type Status = 'idle' | 'loading' | 'error';

export interface FitRaterError {
  kind: 'validation' | 'timeout' | 'api';
  message: string;
}

interface FitApiResponse {
  ok: boolean;
  report?: FitReport;
  reason?: 'rate_limited' | 'upstream_error' | 'timeout' | 'invalid_output';
  retryAfterSeconds?: number;
}

class FitServerError extends Error {}

// A server-stated wait beyond this is a daily quota, not a per-minute burst;
// "try again in 1,800s" is noise, so say "later" instead.
const MAX_QUOTED_WAIT_S = 90;

// Only `invalid_output` is fixed by pasting again. For the rest the JD is fine
// and re-submitting straight away (what Retry does) just spends more quota.
function failureMessage(data: FitApiResponse | null): string {
  switch (data?.reason) {
    case 'rate_limited': {
      const wait = data.retryAfterSeconds;
      return wait !== undefined && wait <= MAX_QUOTED_WAIT_S
        ? `The rater is busy right now. Try again in about ${wait}s.`
        : 'The rater has hit its usage limit for now. Please try again later.';
    }
    case 'timeout':
      return 'The rating service took too long to respond. Try again in a moment.';
    case 'upstream_error':
      return 'The rating service is temporarily unavailable. Try again in a moment.';
    default:
      return PARSE_FAILURE_MESSAGE;
  }
}

export function useFitRater() {
  const [status, setStatus] = useState<Status>('idle');
  const [report, setReport] = useState<FitReport | null>(null);
  const [error, setError] = useState<FitRaterError | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastJdRef = useRef<string | null>(null);

  const rateFit = useCallback(async (rawJd: string) => {
    // Trim beyond the cap before sending, per PRD — not a rejection, just a quiet cut.
    const jd = rawJd.trim().slice(0, MAX_JD_LENGTH);

    if (!jd) {
      setError({ kind: 'validation', message: 'Paste a job description to get your fit score.' });
      setStatus('error');
      return;
    }

    abortRef.current?.abort();
    lastJdRef.current = jd;
    setError(null);
    setReport(null);
    setStatus('loading');

    const controller = new AbortController();
    abortRef.current = controller;

    const timeoutId = setTimeout(() => {
      controller.abort(new DOMException('Timeout', 'TimeoutError'));
    }, FIT_TIMEOUT_MS);

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jobDescription: jd }),
        signal: controller.signal,
      });

      const data = (await response.json().catch(() => null)) as FitApiResponse | null;

      if (!response.ok || !data?.ok || !data.report) {
        throw new FitServerError(failureMessage(data));
      }

      setReport(data.report);
      setStatus('idle');
    } catch (err) {
      const isAbort = (err as Error)?.name === 'AbortError';
      const isTimeout =
        (err as Error)?.name === 'TimeoutError' ||
        (isAbort && (controller.signal.reason as Error)?.name === 'TimeoutError');

      if (isTimeout) {
        setError({ kind: 'timeout', message: `No response within ${FIT_TIMEOUT_MS / 1000}s. Try again?` });
        setStatus('error');
      } else if (isAbort) {
        setStatus('idle');
      } else {
        // Only failures the server reported carry a specific message; anything
        // else (fetch rejection, offline, DNS) keeps the generic one.
        setError({
          kind: 'api',
          message: err instanceof FitServerError ? err.message : PARSE_FAILURE_MESSAGE,
        });
        setStatus('error');
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const retry = useCallback(() => {
    if (lastJdRef.current) rateFit(lastJdRef.current);
  }, [rateFit]);

  const dismissError = useCallback(() => {
    setError(null);
    if (status === 'error') setStatus('idle');
  }, [status]);

  const isLoading = status === 'loading';

  return { rateFit, isLoading, status, report, error, cancel, retry, dismissError };
}
