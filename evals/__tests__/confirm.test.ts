// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  categoryFloorBreaches,
  confirmationCandidates,
  contradictedByConfirmation,
  newRegressions,
  notReproduced,
  nowPassingExpectedFailures,
  renderSummaryTable,
  type CaseOutcome,
  type RunReport,
} from '../src/report.ts';
import { truncatedJsonHint } from '../src/groq.ts';
import type { ExpectedFailure } from '../src/expectedFailures.ts';

// The nightly judged suite failed on every run from 2026-11-02 on one commit,
// each night naming different cases. These pin the confirmation pass that
// separates a flip that reproduces from sampling noise.

function outcome(id: string, passed: boolean, category = 'factual_lookup', sample = 0): CaseOutcome {
  return {
    id,
    category,
    surface: 'chat',
    question: id,
    expect: 'pass',
    response: '',
    passed,
    graders: [],
    latencyMs: 0,
    tokens: 0,
    retries: 0,
    cached: false,
    sample,
  } as CaseOutcome;
}

const known: ExpectedFailure = {
  class: 'PROMPT',
  category: 'factual_lookup',
  failure: 'observed',
  since: '2026-11-02',
  fix_by: 'a prompt fix',
};

function report(outcomes: CaseOutcome[], extra: Partial<RunReport> = {}): RunReport {
  return {
    timestamp: '2026-11-22T00:00:00Z',
    promptHash: 'same',
    model: 'm',
    judgeModel: 'j',
    temperature: 0,
    samples: 1,
    consistency: { grader: 'facts-consistency', passed: true, findings: [] } as unknown as RunReport['consistency'],
    outcomes,
    errors: [],
    expectedFailures: {},
    ...extra,
  };
}

const baseline = report([outcome('a', true), outcome('b', true), outcome('c', false)]);

describe('confirmation re-samples', () => {
  it('flags the same cases as before when there are no confirmations', () => {
    const run = report([outcome('a', false), outcome('b', true), outcome('c', false)]);
    expect(newRegressions(run, baseline)).toEqual(['a']);
    expect(confirmationCandidates(run, baseline)).toEqual(['a']);
    expect(notReproduced(run)).toEqual([]);
  });

  it('drops a regression when a re-sample passes', () => {
    const run = report([outcome('a', false), outcome('b', true), outcome('c', false)], {
      confirmations: [outcome('a', false, 'factual_lookup', 1), outcome('a', true, 'factual_lookup', 2)],
    });
    expect(contradictedByConfirmation(run, 'a')).toBe(true);
    expect(newRegressions(run, baseline)).toEqual([]);
    expect(categoryFloorBreaches(run, baseline)).toEqual([]);
    expect(notReproduced(run)).toEqual(['a']);
    expect(renderSummaryTable(run, baseline)).toContain('No new regressions');
    expect(renderSummaryTable(run, baseline)).toContain('`a`');
  });

  it('keeps a regression that fails on every re-sample', () => {
    const run = report([outcome('a', false), outcome('b', true), outcome('c', false)], {
      confirmations: [outcome('a', false, 'factual_lookup', 1), outcome('a', false, 'factual_lookup', 2)],
    });
    expect(newRegressions(run, baseline)).toEqual(['a']);
    expect(notReproduced(run)).toEqual([]);
  });

  it('keeps blocking when the re-sample errored and gave no verdict', () => {
    const run = report([outcome('a', false), outcome('b', true), outcome('c', false)], {
      confirmations: [],
      confirmationErrors: [{ id: 'a', message: 'HTTP 429' }],
    });
    expect(newRegressions(run, baseline)).toEqual(['a']);
  });

  it('drops a now-passing expected failure when a re-sample fails again', () => {
    const run = report([outcome('a', true), outcome('b', true), outcome('c', true)], {
      expectedFailures: { c: known },
      confirmations: [outcome('c', false, 'factual_lookup', 1)],
    });
    expect(nowPassingExpectedFailures(run)).toEqual([]);
    expect(notReproduced(run)).toEqual(['c']);
  });

  it('keeps a now-passing expected failure that passes every re-sample', () => {
    const run = report([outcome('a', true), outcome('b', true), outcome('c', true)], {
      expectedFailures: { c: known },
      confirmations: [outcome('c', true, 'factual_lookup', 1), outcome('c', true, 'factual_lookup', 2)],
    });
    expect(nowPassingExpectedFailures(run)).toEqual(['c']);
  });

  it('lists every blocking reason once as a candidate', () => {
    const run = report([outcome('a', false), outcome('b', true), outcome('c', true)], {
      expectedFailures: { c: known },
    });
    expect(confirmationCandidates(run, baseline)).toEqual(['a', 'c']);
  });
});

describe('truncatedJsonHint reads failed_generation', () => {
  const params = { model: 'm', temperature: 0, max_tokens: 4000, messages: [], response_format: { type: 'json_object' as const } };
  const body = (generation: string) =>
    JSON.stringify({ error: { message: 'Failed to validate JSON. Please adjust your prompt.', failed_generation: generation } });

  it('names a cut-off object as truncation', () => {
    expect(truncatedJsonHint(400, body('{"overall": 7, "gaps": ["SQL'), params)).toMatch(/^TRUNCATED at max_tokens 4000/);
  });

  it('names a closed object as invalid JSON, not the budget', () => {
    expect(truncatedJsonHint(400, body('{"overall": 7,}'), params)).toMatch(/^INVALID JSON from the model/);
  });

  it('says nothing for other errors', () => {
    expect(truncatedJsonHint(400, '{"error":{"message":"bad model"}}', params)).toBe('');
    expect(truncatedJsonHint(429, body('{'), params)).toBe('');
  });
});
