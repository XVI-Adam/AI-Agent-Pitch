import type { FactsLedger } from '../facts.ts';
import type { EvalCase, GraderResult, GraderSpec } from '../types.ts';
import { gradeAbstention } from './abstention.ts';
import { gradeDurationCeilings } from './duration.ts';
import { gradeExactMatch } from './exactMatch.ts';
import { gradeEvidenceTrace, gradeFitSchema, gradeScoreBands } from './fitSchema.ts';
import { gradeDateRange, gradeForbidden, gradeLength, gradeMustContradict, gradeMustInclude } from './forbidden.ts';
import { gradeGrounded } from './grounded.ts';
import { gradeNumericTolerance } from './numeric.ts';

export { gradeFactsConsistency } from './grounded.ts';
export { resolveDerived } from './numeric.ts';

// Composes the deterministic layers for one case.
//
// NOTHING SHORT-CIRCUITS. An earlier version stopped at the first failing layer
// and skipped the judge whenever any deterministic grader failed. That made the
// report actively misleading: da-001 surfaced a single line about
// duration_ceiling -- which turned out to be a misattribution -- while the
// judge, which would have named the real defect in the response's reasoning,
// never ran at all. A report that shows one arbitrary failure out of several is
// worse than a slow one.
//
// Every layer runs, every failure is reported, and results come back in layer
// order so the cheap deterministic findings read first.

export interface DeterministicOutcome {
  results: GraderResult[];
  passed: boolean;
}

export function runDeterministicGraders(
  evalCase: EvalCase,
  response: string,
  ledger: FactsLedger,
  options: { jobDescription?: string; now?: Date } = {},
): DeterministicOutcome {
  const spec: GraderSpec = evalCase.graders ?? {};
  const results: GraderResult[] = [];

  if (evalCase.surface === 'fit') {
    const schema = gradeFitSchema({ raw: response, jobDescription: options.jobDescription ?? '' });
    results.push(schema);
    if (schema.report) {
      results.push(gradeScoreBands(schema.report, spec));
      results.push(gradeEvidenceTrace(schema.report, spec, ledger, options.jobDescription ?? ''));
    } else {
      // No parsed report, so the band and evidence graders have nothing to read
      // — but the raw text can still carry a banned claim, and saying so is more
      // useful than reporting only "invalid JSON".
      results.push(gradeForbidden(response, spec, ledger));
      results.push(gradeDurationCeilings(response, ledger));
    }
    return finish(results);
  }

  results.push(gradeForbidden(response, spec, ledger));
  // Duration ceilings run with the forbidden list rather than per-case: tenure
  // inflation is not a case-specific risk, and a string denylist cannot catch
  // "roughly half a year".
  if (spec.forbidden === 'default') results.push(gradeDurationCeilings(response, ledger));
  results.push(gradeMustInclude(response, spec));
  results.push(gradeMustContradict(response, spec));
  results.push(gradeDateRange(response, spec));
  results.push(gradeLength(response, spec));
  results.push(gradeExactMatch(response, spec.exact_match, ledger));
  results.push(gradeAbstention(response, spec.abstention));
  results.push(gradeNumericTolerance(response, spec.numeric_tolerance, ledger, options.now));
  // The question's own words are fair game in the answer: ns-001 asks "is he
  // ready for a STAFF ENGINEER role?" and the correct answer -- "not ready for
  // a staff engineer role" -- has to use the phrase. Fit cases already get this
  // via the JD; chat cases need it via the prompt.
  const askedText = [
    evalCase.question ?? '',
    ...(evalCase.turns ?? []).map((t) => t.user),
    options.jobDescription ?? '',
  ].filter(Boolean);

  results.push(
    gradeGrounded(response, ledger, {
      mode: spec.grounded_entities ?? 'off',
      extraAllowed: askedText,
    }),
  );

  return finish(results);
}

function finish(results: GraderResult[]): DeterministicOutcome {
  return { results, passed: results.every((r) => r.passed) };
}
