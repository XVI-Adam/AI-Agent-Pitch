import type { FactsLedger } from '../facts.ts';
import type { EvalCase, GraderResult, GraderSpec } from '../types.ts';
import { gradeAbstention } from './abstention.ts';
import { gradeExactMatch } from './exactMatch.ts';
import { gradeEvidenceTrace, gradeFitSchema, gradeScoreBands } from './fitSchema.ts';
import { gradeDateRange, gradeForbidden, gradeLength, gradeMustContradict, gradeMustInclude } from './forbidden.ts';
import { gradeGrounded } from './grounded.ts';
import { gradeNumericTolerance } from './numeric.ts';

export { gradeFactsConsistency } from './grounded.ts';
export { resolveDerived } from './numeric.ts';

// Composes the deterministic layers for one case. Layer 4 (the LLM judge) runs
// separately in the runner, and only when everything here passes — there is no
// point spending a judge call to describe the tone of a response that already
// invented an employer.

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
    // Everything downstream reads fields off the report, so a schema failure is
    // terminal for this case rather than a first finding among many.
    if (!schema.report) {
      return { results, passed: false };
    }
    results.push(gradeScoreBands(schema.report, spec));
    results.push(gradeEvidenceTrace(schema.report, spec, ledger, options.jobDescription ?? ''));
    return finish(results);
  }

  results.push(gradeForbidden(response, spec, ledger));
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
