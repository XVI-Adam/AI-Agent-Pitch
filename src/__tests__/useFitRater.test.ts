import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFitRater } from '../hooks/useFitRater';
import type { FitReport } from '../types/fit';

const sampleReport: FitReport = {
  overall_score: 8,
  categories: {
    tech_stack: { score: 8, rationale: 'Good overlap.' },
    experience_level: { score: 7, rationale: 'Close enough.' },
    seniority: { score: 6, rationale: 'A bit junior.' },
    domain_fit: { score: 8, rationale: 'Adjacent domain experience.' },
    working_style: { score: 9, rationale: 'Fits the pace.' },
  },
  gaps: ['Limited enterprise-scale experience.'],
  tailored_pitch: 'Adam ships fast end-to-end. He would ramp quickly on this role.',
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('useFitRater', () => {
  it('shows a validation error and never calls fetch for an empty JD', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useFitRater());

    await act(async () => {
      await result.current.rateFit('   ');
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.status).toBe('error');
    expect(result.current.error?.message).toBe('Paste a job description to get your fit score.');
  });

  it('sets the report on a successful ok:true response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, report: sampleReport }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useFitRater());

    await act(async () => {
      await result.current.rateFit('We need a React engineer.');
    });

    expect(result.current.report).toEqual(sampleReport);
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
  });

  it('shows the fixed parse-failure message on an ok:false response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: false }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useFitRater());

    await act(async () => {
      await result.current.rateFit('We need a React engineer.');
    });

    expect(result.current.report).toBeNull();
    expect(result.current.status).toBe('error');
    expect(result.current.error?.message).toBe("Couldn't analyze this JD. Try pasting it again.");
  });

  it('shows the fixed parse-failure message on a network failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useFitRater());

    await act(async () => {
      await result.current.rateFit('We need a React engineer.');
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error?.message).toBe("Couldn't analyze this JD. Try pasting it again.");
  });

  it('truncates the JD to the 3000-char cap before sending', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, report: sampleReport }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useFitRater());
    const longJd = 'a'.repeat(5000);

    await act(async () => {
      await result.current.rateFit(longJd);
    });

    const [, init] = fetchMock.mock.calls[0];
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody.jobDescription.length).toBe(3000);
  });
});
