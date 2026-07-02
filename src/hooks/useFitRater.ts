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
        throw new Error(PARSE_FAILURE_MESSAGE);
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
        setError({ kind: 'api', message: PARSE_FAILURE_MESSAGE });
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
