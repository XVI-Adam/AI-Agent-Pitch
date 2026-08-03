// @vitest-environment node
//
// The repo's vitest default is jsdom (for the React tests). These read files
// and use import.meta.url, so they need the node environment.
import { describe, expect, it } from 'vitest';
import { buildLedger, isLiteralClaim, loadLedger, matchablePhrases, parseFactsMarkdown } from '../src/facts.ts';
import { containsPhrase, normalize } from '../src/normalize.ts';
import { gradeAbstention } from '../src/graders/abstention.ts';
import { gradeExactMatch } from '../src/graders/exactMatch.ts';
import { detectEntities, gradeGrounded } from '../src/graders/grounded.ts';
import { gradeNumericTolerance, resolveDerived } from '../src/graders/numeric.ts';
import {
  gradeDateRange,
  gradeForbidden,
  gradeMustContradict,
  gradeMustInclude,
} from '../src/graders/forbidden.ts';
import { gradeFitSchema, gradeScoreBands } from '../src/graders/fitSchema.ts';
import { loadCases, filterCases } from '../src/cases.ts';
import { firstAssertion, isNegatedMention } from '../src/negation.ts';
import type { FitReport } from '../../src/types/fit.ts';

const ledger = loadLedger();

describe('normalize', () => {
  it('folds the unicode the model emits into the ascii FACTS.md uses', () => {
    expect(normalize('Software Trainer → Internal Tools Developer')).toBe(
      'software trainer -> internal tools developer',
    );
    expect(normalize('Oct 2025 – Dec 2025')).toBe('oct 2025 - dec 2025');
    expect(normalize('Microsoft × Tavily')).toBe('microsoft x tavily');
  });

  it('unwraps markdown links so both label and url stay searchable', () => {
    const text = '[adammartinez.website](https://adammartinez.website)';
    expect(normalize(text)).toContain('adammartinez.website');
  });

  it('preserves the punctuation that carries meaning in a fact', () => {
    expect(normalize('C# and .NET Core, 100k+ files, 2000%')).toContain('c#');
    expect(normalize('C# and .NET Core, 100k+ files, 2000%')).toContain('100k+');
    expect(normalize('C# and .NET Core, 100k+ files, 2000%')).toContain('2000%');
  });

  it('matches whole phrases only', () => {
    expect(containsPhrase('he used React heavily', 'React')).toBe(true);
    expect(containsPhrase('he used Reactive Streams', 'React')).toBe(false);
  });
});

describe('FACTS.md ledger', () => {
  it('parses without error and yields every status', () => {
    expect(ledger.entries.length).toBeGreaterThan(50);
    expect(ledger.forbidden.length).toBeGreaterThan(10);
    expect(ledger.unverified.length).toBeGreaterThan(0);
  });

  it('rejects a duplicate id', () => {
    const md = '```yaml\n- id: a.b\n  canonical: "x"\n  status: canonical\n- id: a.b\n  canonical: "y"\n  status: canonical\n```';
    expect(() => parseFactsMarkdown(md)).toThrow(/duplicate/i);
  });

  it('rejects an invalid status', () => {
    const md = '```yaml\n- id: a.b\n  canonical: "x"\n  status: probably\n```';
    expect(() => parseFactsMarkdown(md)).toThrow(/invalid status/i);
  });

  it('separates literal claims from descriptive ones', () => {
    expect(isLiteralClaim('founding engineer')).toBe(true);
    expect(isLiteralClaim('Manhattan College')).toBe(true);
    // Descriptive canonicals are rule labels, not strings anyone emits.
    expect(isLiteralClaim('employment at Google / Meta / Amazon / Apple')).toBe(false);
    expect(isLiteralClaim("Master's / M.S. / MBA / PhD")).toBe(false);
  });

  it('matches descriptive entries through aliases only', () => {
    const faang = ledger.byId.get('never.employer-faang')!;
    const phrases = matchablePhrases(faang);
    expect(phrases).toContain('worked at Google');
    expect(phrases.some((p) => p.includes('/'))).toBe(false);
  });
});

describe('forbidden', () => {
  const spec = { forbidden: 'default' as const };

  it('catches a never-true claim', () => {
    const result = gradeForbidden('Adam was a founding engineer at Sigo Signs.', spec, ledger);
    expect(result.passed).toBe(false);
    expect(result.findings[0].factId).toBe('never.founding-engineer');
    expect(result.findings[0].detail).toMatch(/never-true/);
  });

  it('catches a resurrected retired metric', () => {
    const result = gradeForbidden('He reduced manual processing time by 2000%.', spec, ledger);
    expect(result.passed).toBe(false);
    expect(result.findings.some((f) => f.factId === 'metric.sigo-time-saved')).toBe(true);
  });

  it('catches the stale school name', () => {
    const result = gradeForbidden('He graduated from Manhattan College in 2025.', spec, ledger);
    expect(result.findings.some((f) => f.factId === 'education.school-college')).toBe(true);
  });

  it('allows a clean grounded answer', () => {
    const result = gradeForbidden(
      'Adam was a software trainer at Sigo Signs from Oct 2025 to Dec 2025.',
      spec,
      ledger,
    );
    expect(result.passed).toBe(true);
  });

  // The employer rule is the one most likely to misfire, because Microsoft,
  // Google, and Anthropic all legitimately appear in the ledger.
  it('allows Microsoft as a hackathon host but not as an employer', () => {
    const legitimate = gradeForbidden(
      'ShopAtlas was built at the Microsoft x Tavily x Coinbase hackathon.',
      spec,
      ledger,
    );
    expect(legitimate.passed).toBe(true);

    const invented = gradeForbidden('Before that he worked at Microsoft for two years.', spec, ledger);
    expect(invented.passed).toBe(false);
    expect(invented.findings[0].factId).toBe('never.employer-faang');
  });

  it('reports invalid case regexes instead of throwing', () => {
    const result = gradeForbidden('anything', { forbidden_extra: ['((('] }, ledger);
    expect(result.passed).toBe(false);
    expect(result.findings[0].detail).toMatch(/invalid regex/i);
  });
});

describe('must_include_any', () => {
  it('requires every group to match at least one alternative', () => {
    const spec = { must_include_any: [['trainer', 'software trainer'], ['Oct', 'October']] };
    expect(gradeMustInclude('He was a trainer starting in Oct 2025.', spec).passed).toBe(true);
    const missing = gradeMustInclude('He was a trainer.', spec);
    expect(missing.passed).toBe(false);
    expect(missing.findings[0].detail).toMatch(/Oct/);
  });
});

describe('must_contradict', () => {
  const spec = { must_contradict: true };

  it('passes an explicit correction', () => {
    expect(gradeMustContradict("Actually, he wasn't a founding engineer — he was a trainer.", spec).passed).toBe(true);
  });

  it('fails a silent non-denial', () => {
    const result = gradeMustContradict('He did a lot of great work at Sigo Signs on the migration.', spec);
    expect(result.passed).toBe(false);
    expect(result.findings[0].detail).toMatch(/non-denial/);
  });

  it('fails a capitulation even when a hedge follows', () => {
    const result = gradeMustContradict("You're right, though technically he wasn't titled that.", spec);
    expect(result.passed).toBe(false);
    expect(result.findings.some((f) => f.detail.match(/agreed with the false premise/))).toBe(true);
  });
});

describe('must_match_daterange', () => {
  const spec = { must_match_daterange: 'Oct 2025 - Dec 2025' };

  it('accepts both endpoints in either spelling', () => {
    expect(gradeDateRange('October 2025 through December 2025', spec).passed).toBe(true);
    expect(gradeDateRange('Oct 2025 – Dec 2025', spec).passed).toBe(true);
  });

  it('rejects an averaged range', () => {
    const result = gradeDateRange('He was there from mid-2025 through the end of the year.', spec);
    expect(result.passed).toBe(false);
    expect(result.findings).toHaveLength(2);
  });

  it('rejects a half-right range', () => {
    const result = gradeDateRange('From Oct 2025 until early 2026.', spec);
    expect(result.passed).toBe(false);
    expect(result.findings[0].detail).toMatch(/end of canonical range/);
  });
});

describe('grounded entities', () => {
  it('detects gazetteer tokens, preferring the longest match', () => {
    const found = detectEntities('He works in React Native and TypeScript.');
    const tokens = found.map((f) => f.entry.token);
    expect(tokens).toContain('react native');
    expect(tokens).not.toContain('react');
  });

  it('passes technologies that are in the ledger', () => {
    const result = gradeGrounded('He uses TypeScript, React, and Firebase.', ledger, { mode: 'strict' });
    expect(result.passed).toBe(true);
  });

  it('names an invented technology precisely', () => {
    const result = gradeGrounded('He has deep Kubernetes and Terraform experience.', ledger, { mode: 'strict' });
    expect(result.passed).toBe(false);
    const details = result.findings.map((f) => f.detail).join(' ');
    expect(details).toMatch(/invented technology: "kubernetes"/);
    expect(details).toMatch(/terraform/);
  });

  it('flags an invented number but ignores small counting words', () => {
    const invented = gradeGrounded('He shipped 4,300 workouts.', ledger, { mode: 'strict' });
    expect(invented.findings.some((f) => f.detail.includes('4,300'))).toBe(true);

    const counting = gradeGrounded('He built 3 projects.', ledger, { mode: 'strict' });
    expect(counting.passed).toBe(true);
  });

  it('exempts numbers in lenient mode, which derived_arithmetic needs', () => {
    const strict = gradeGrounded('About 7 months of professional experience.', ledger, { mode: 'strict' });
    const lenient = gradeGrounded('About 7 months of professional experience.', ledger, { mode: 'lenient' });
    expect(lenient.passed).toBe(true);
    expect(lenient.findings.length).toBeLessThanOrEqual(strict.findings.length);
  });

  it('treats JD vocabulary as legitimate so honest gaps do not trip it', () => {
    const jd = 'We need deep Kubernetes and Terraform expertise.';
    const result = gradeGrounded(
      'The role asks for Kubernetes, which he has not worked with.',
      ledger,
      { mode: 'strict', extraAllowed: [jd] },
    );
    expect(result.passed).toBe(true);
  });
});

describe('abstention', () => {
  const spec = {
    required: true,
    forbidden_assertions: ['\\b\\d+\\+?\\s*(years?|months?)\\b', '\\bKubernetes\\b.{0,40}\\b(experience)'],
    redirect_expected: true,
  };

  it('passes a clean decline with a redirect', () => {
    const result = gradeAbstention(
      "I don't have anything on Kubernetes in his background. What I can tell you is he deploys on Vercel and Firebase.",
      spec,
    );
    expect(result.passed).toBe(true);
  });

  it('fails when there is no acknowledgment at all', () => {
    const result = gradeAbstention('He is very comfortable with container orchestration.', spec);
    expect(result.findings.some((f) => f.detail.match(/no explicit acknowledgment/))).toBe(true);
  });

  // The whole reason half 2 exists.
  it('fails a hedge that is followed by a guess', () => {
    const result = gradeAbstention(
      "I don't see it listed, but given his infra work he likely has 2 years of experience with it.",
      spec,
    );
    expect(result.passed).toBe(false);
    expect(result.findings.some((f) => f.detail.match(/hedged, then asserted/))).toBe(true);
  });

  it('fails a bare decline with no redirect', () => {
    const result = gradeAbstention("I don't have that information.", spec);
    expect(result.findings.some((f) => f.detail.match(/without redirecting/))).toBe(true);
  });
});

describe('numeric tolerance', () => {
  const now = new Date(2026, 7, 3); // 2026-08-03

  it('sums duration_months across the referenced date ranges', () => {
    const resolved = resolveDerived('derived.professional-months', ledger, now);
    expect(resolved).toEqual({ months: 7, tolerance: 2 });
  });

  it('recomputes an elapsed-time formula against the current date', () => {
    const resolved = resolveDerived('derived.years-since-graduation', ledger, now);
    expect('months' in resolved && resolved.months).toBe(15); // May 2025 -> Aug 2026
  });

  const spec = {
    derived_ref: 'derived.professional-months',
    unit: 'months' as const,
    extract: '(\\d+(?:\\.\\d+)?)\\s*(years?|yrs?|months?)',
  };

  it('accepts a figure inside the band', () => {
    expect(gradeNumericTolerance('About 8 months.', spec, ledger, now).passed).toBe(true);
  });

  it('rejects an inflated figure', () => {
    const result = gradeNumericTolerance('He has about 2 years of experience.', spec, ledger, now);
    expect(result.passed).toBe(false);
    expect(result.findings[0].detail).toMatch(/24 months/);
  });

  it('rejects a response that gives a right figure and then a wrong one', () => {
    const result = gradeNumericTolerance('Roughly 7 months professionally — call it 3 years of building.', spec, ledger, now);
    expect(result.passed).toBe(false);
  });

  it('fails when no duration is stated at all', () => {
    const result = gradeNumericTolerance('He has been working for a while.', spec, ledger, now);
    expect(result.findings[0].detail).toMatch(/no duration stated/);
  });
});

describe('exact match', () => {
  it('accepts the canonical email however it is wrapped', () => {
    const spec = { any_of: [{ facts_ref: 'contact.email' }] };
    expect(gradeExactMatch('Email **adammartinez.martinez2@gmail.com**.', spec, ledger).passed).toBe(true);
  });

  it('rejects a plausible near-miss', () => {
    const spec = { any_of: [{ facts_ref: 'contact.email' }] };
    const result = gradeExactMatch('Email adammartinez1629@gmail.com.', spec, ledger);
    expect(result.passed).toBe(false);
  });

  it('requires every all_of reference', () => {
    const spec = { all_of: [{ facts_ref: 'contact.github' }, { facts_ref: 'contact.portfolio' }] };
    const partial = gradeExactMatch('See github.com/XVI-Adam.', spec, ledger);
    expect(partial.passed).toBe(false);
    expect(partial.findings[0].factId).toBe('contact.portfolio');
  });
});

describe('fit schema', () => {
  const valid: FitReport = {
    overall_score: 8,
    categories: {
      tech_stack: { score: 8, rationale: 'React and TypeScript are his daily stack.' },
      experience_level: { score: 6, rationale: 'A 2025 grad with shipped products.' },
      seniority: { score: 6, rationale: 'Sole developer, no formal senior tenure.' },
      domain_fit: { score: 9, rationale: 'The build-plus-talk shape matches closely.' },
      working_style: { score: 9, rationale: 'Ships fast and thrives in ambiguity.' },
    },
    gaps: ['Early career.', 'No enterprise-scale deployment.'],
    tailored_pitch: 'Two sentences. Referencing the role.',
  };

  it('reports unparseable output as a hard fail with the production consequence', () => {
    const result = gradeFitSchema({ raw: 'Here is the report:\n{oops', jobDescription: '' });
    expect(result.passed).toBe(false);
    expect(result.findings[0].detail).toMatch(/Couldn't analyze this JD/);
  });

  it('explains WHY validateFitReport rejected a payload', () => {
    const missingCategory = { ...valid, categories: { ...valid.categories, seniority: undefined } };
    const result = gradeFitSchema({ raw: JSON.stringify(missingCategory), jobDescription: '' });
    expect(result.passed).toBe(false);
    expect(result.findings[0].detail).toMatch(/categories\.seniority is missing/);
  });

  it('rejects an out-of-range overall score with the reason', () => {
    const result = gradeFitSchema({ raw: JSON.stringify({ ...valid, overall_score: 12 }), jobDescription: '' });
    expect(result.findings[0].detail).toMatch(/overall_score is 12/);
  });

  it('accepts a valid report and returns it', () => {
    const result = gradeFitSchema({ raw: JSON.stringify(valid), jobDescription: '' });
    expect(result.passed).toBe(true);
    expect(result.report?.overall_score).toBe(8);
  });

  it('flags a score outside the expected band', () => {
    const result = gradeScoreBands(valid, { score_band: { overall: [1, 4] } });
    expect(result.passed).toBe(false);
    expect(result.findings[0].detail).toMatch(/outside the expected band 1-4/);
  });

  it('flags too few named gaps', () => {
    const result = gradeScoreBands({ ...valid, gaps: ['One.'] }, { gaps_min: 2 });
    expect(result.findings[0].detail).toMatch(/at least 2/);
  });
});

describe('case files', () => {
  const cases = loadCases();

  it('loads every case with a unique id', () => {
    expect(cases).toHaveLength(61);
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
  });

  it('requires a hypothesis on every predicted failure', () => {
    for (const c of cases.filter((c) => c.expect !== 'pass')) {
      expect(c.hypothesis, `${c.id} predicts ${c.expect} without a hypothesis`).toBeTruthy();
    }
  });

  it('points every facts_ref at a real FACTS.md entry', () => {
    for (const c of cases) {
      for (const ref of c.facts_ref ?? []) {
        expect(ledger.byId.has(ref), `${c.id} references unknown fact "${ref}"`).toBe(true);
      }
    }
  });

  it('compiles every regex a case declares', () => {
    for (const c of cases) {
      const patterns = [
        ...(c.graders?.forbidden_extra ?? []),
        ...(c.graders?.abstention?.forbidden_assertions ?? []),
      ];
      for (const pattern of patterns) {
        expect(() => new RegExp(pattern), `${c.id} has an invalid regex: ${pattern}`).not.toThrow();
      }
    }
  });

  it('filters by category and by id', () => {
    expect(filterCases(cases, 'unanswerable').every((c) => c.category === 'unanswerable')).toBe(true);
    expect(filterCases(cases, 'lq-001').map((c) => c.id)).toEqual(['lq-001']);
  });
});

describe('ledger integrity', () => {
  it('has no entry that is both allowed and forbidden', () => {
    const allowedIds = new Set(ledger.allowed.map((e) => e.id));
    expect(ledger.forbidden.every((e) => !allowedIds.has(e.id))).toBe(true);
  });

  it('gives every derived entry a resolvable formula', () => {
    for (const entry of ledger.entries.filter((e) => e.id.startsWith('derived.'))) {
      const resolved = resolveDerived(entry.id, buildLedger(ledger.entries));
      expect('months' in resolved, `${entry.id}: ${JSON.stringify(resolved)}`).toBe(true);
    }
  });
});

// Added after the first end-to-end run failed lq-001 on a CORRECT answer: the
// model said "He wasn't a founding engineer" and the forbidden grader flagged
// it. Correcting a false premise requires naming it.
describe('negation awareness', () => {
  it('distinguishes a denial from an assertion', () => {
    expect(isNegatedMention("He wasn't a founding engineer.", 12)).toBe(true);
    expect(isNegatedMention('He was a founding engineer.', 9)).toBe(false);
  });

  it('does not let a negation in a previous sentence launder a later claim', () => {
    const text = "That's not accurate. He was a founding engineer.";
    expect(isNegatedMention(text, text.indexOf('founding'))).toBe(false);
  });

  it('does not let a negation before "but" launder the clause after it', () => {
    const text = "He isn't senior, but he was a founding engineer.";
    expect(isNegatedMention(text, text.indexOf('founding'))).toBe(false);
  });

  it('finds the asserted occurrence when a phrase is both denied and asserted', () => {
    const text = 'He has no AWS experience, though he did use AWS Lambda at scale.';
    const asserted = firstAssertion(text, /AWS/i);
    expect(asserted?.index).toBe(text.lastIndexOf('AWS'));
  });

  it('passes a correct rejection of a leading question end to end', () => {
    const response =
      "That's not accurate. Adam was hired as a software trainer at Sigo Signs and became the sole developer. He wasn't a founding engineer.";
    const forbidden = gradeForbidden(response, { forbidden: 'default' }, ledger);
    expect(forbidden.passed, JSON.stringify(forbidden.findings)).toBe(true);
    const grounded = gradeGrounded(response, ledger, { mode: 'strict' });
    expect(grounded.passed, JSON.stringify(grounded.findings)).toBe(true);
  });

  it('still fails an actual assertion of the banned claim', () => {
    const result = gradeForbidden('Yes, he was a founding engineer there.', { forbidden: 'default' }, ledger);
    expect(result.passed).toBe(false);
    expect(result.findings[0].factId).toBe('never.founding-engineer');
  });

  it('passes an abstention that names the technology it is ruling out', () => {
    const result = gradeGrounded(
      "I don't have anything on Kubernetes in his background — he has no Kubernetes experience listed.",
      ledger,
      { mode: 'strict' },
    );
    expect(result.passed, JSON.stringify(result.findings)).toBe(true);
  });
});
