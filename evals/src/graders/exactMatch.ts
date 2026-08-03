import type { FactsLedger } from '../facts';
import { normalizeTight } from '../normalize';
import type { ExactMatchSpec, Finding, GraderResult } from '../types';

// Contact details get an exact-match grader rather than the fuzzy phrase check.
//
// A near-miss email is worse than a refusal: the recruiter writes to
// adammartinez1629@gmail.com, hears nothing, and concludes Adam is
// unresponsive. Same for github.com/XVI-Adam, a handle with no obvious "adam"
// in it and therefore exactly the kind of string a model "corrects" to
// something more sensible.
//
// Matching is on the whitespace-stripped normalized form, so
// "[adammartinez.website](https://adammartinez.website)" and a bare mention both
// resolve to the same token, but a changed digit does not.

function matches(response: string, ledger: FactsLedger, factId: string): boolean {
  const entry = ledger.byId.get(factId);
  if (!entry) return false;
  const haystack = normalizeTight(response);
  return [entry.canonical, ...entry.aliases]
    .map(normalizeTight)
    .filter(Boolean)
    .some((candidate) => haystack.includes(candidate));
}

export function gradeExactMatch(
  response: string,
  spec: ExactMatchSpec | undefined,
  ledger: FactsLedger,
): GraderResult {
  if (!spec) return { grader: 'exact_match', passed: true, findings: [], skipped: true };

  const findings: Finding[] = [];

  for (const requirement of spec.all_of ?? []) {
    if (matches(response, ledger, requirement.facts_ref)) continue;
    const entry = ledger.byId.get(requirement.facts_ref);
    findings.push({
      grader: 'exact_match',
      factId: requirement.facts_ref,
      detail: entry
        ? `missing or altered: expected "${entry.canonical}"`
        : `case references unknown FACTS.md entry "${requirement.facts_ref}"`,
    });
  }

  const anyOf = spec.any_of ?? [];
  if (anyOf.length > 0 && !anyOf.some((r) => matches(response, ledger, r.facts_ref))) {
    const expected = anyOf
      .map((r) => ledger.byId.get(r.facts_ref)?.canonical ?? r.facts_ref)
      .map((value) => `"${value}"`)
      .join(' or ');
    findings.push({
      grader: 'exact_match',
      detail: `response contains none of: ${expected}`,
    });
  }

  return { grader: 'exact_match', passed: findings.length === 0, findings };
}
