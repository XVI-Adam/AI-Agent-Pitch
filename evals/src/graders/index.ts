import type { FactsLedger } from '../facts';
import type { EvalCase, GraderResult, GraderSpec } from '../types';
import { gradeAbstention } from './abstention';
import { gradeExactMatch } from './exactMatch';
import { gradeEvidenceTrace, gradeFitSchema, gradeScoreBands } from './fitSchema';
import { gradeDateRange, gradeForbidden, gradeLength, gradeMustContradict, gradeMustInclude } from './forbidden';
import { gradeGrounded } from './grounded';
import { gradeNumericTolerance } from './numeric';

export { gradeFactsConsistency } from './grounded';
export { resolveDerived } from './numeric';

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
  results.push(
    gradeGrounded(response, ledger, {
      mode: spec.grounded_entities ?? 'off',
      extraAllowed: options.jobDescription ? [options.jobDescription] : [],
    }),
  );

  return finish(results);
}

function finish(results: GraderResult[]): DeterministicOutcome {
  return { results, passed: results.every((r) => r.passed) };
}
