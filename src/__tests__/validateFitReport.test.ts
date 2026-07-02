import { describe, it, expect } from 'vitest';
import { validateFitReport } from '../../api/_lib/validateFitReport';

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    overall_score: 7,
    categories: {
      tech_stack: { score: 8, rationale: 'Strong overlap with React/TypeScript.' },
      experience_level: { score: 6, rationale: 'A bit junior for the role.' },
      seniority: { score: 5, rationale: 'Not yet a senior-level candidate.' },
      domain_fit: { score: 7, rationale: 'Has shipped in adjacent domains.' },
      working_style: { score: 9, rationale: 'Thrives in fast, ambiguous environments.' },
    },
    gaps: ['No large-scale distributed systems experience.'],
    tailored_pitch: 'Adam ships fast and owns the full stack. He would ramp quickly on this JD.',
    ...overrides,
  };
}

describe('validateFitReport', () => {
  it('accepts a fully valid payload', () => {
    const result = validateFitReport(validPayload());
    expect(result).not.toBeNull();
    expect(result?.overall_score).toBe(7);
    expect(result?.gaps).toHaveLength(1);
  });

  it('rejects non-object input', () => {
    expect(validateFitReport(null)).toBeNull();
    expect(validateFitReport('nope')).toBeNull();
    expect(validateFitReport(42)).toBeNull();
  });

  it('rejects an out-of-range or non-numeric overall_score', () => {
    expect(validateFitReport(validPayload({ overall_score: 0 }))).toBeNull();
    expect(validateFitReport(validPayload({ overall_score: 11 }))).toBeNull();
    expect(validateFitReport(validPayload({ overall_score: 'seven' }))).toBeNull();
  });

  it('rejects a payload missing a required category key', () => {
    const payload = validPayload();
    const categories = payload.categories as Record<string, unknown>;
    delete categories.working_style;
    expect(validateFitReport(payload)).toBeNull();
  });

  it('rejects a category with an empty rationale', () => {
    const payload = validPayload();
    const categories = payload.categories as Record<string, { score: number; rationale: string }>;
    categories.tech_stack = { score: 8, rationale: '   ' };
    expect(validateFitReport(payload)).toBeNull();
  });

  it('rejects gaps with 0 items', () => {
    expect(validateFitReport(validPayload({ gaps: [] }))).toBeNull();
  });

  it('rejects gaps with more than 3 items', () => {
    expect(validateFitReport(validPayload({ gaps: ['a', 'b', 'c', 'd'] }))).toBeNull();
  });

  it('rejects gaps with non-string entries', () => {
    expect(validateFitReport(validPayload({ gaps: [1, 2] }))).toBeNull();
  });

  it('rejects an empty tailored_pitch', () => {
    expect(validateFitReport(validPayload({ tailored_pitch: '  ' }))).toBeNull();
  });

  it('is lenient about extra unexpected top-level fields', () => {
    const result = validateFitReport(validPayload({ extra_field: 'ignored' }));
    expect(result).not.toBeNull();
  });
});
