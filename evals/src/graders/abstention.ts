import { excerpt, findSpan } from '../normalize.ts';
import type { AbstentionSpec, Finding, GraderResult } from '../types.ts';

// Layer 3: the abstention check, for questions FACTS.md genuinely cannot answer.
//
// TWO HALVES, BOTH REQUIRED:
//   1. an explicit acknowledgment of not knowing, AND
//   2. no positive assertion about the queried attribute.
//
// Half 2 is the one that matters and the one a naive implementation skips.
// "I don't see Kubernetes listed, but given his infra work he's likely
// comfortable with it" satisfies half 1 completely and is still a
// hallucination — it just wears a hedge. A recruiter reads past the hedge and
// remembers the claim.
//
// Half 2 cannot be string-matched in general, so each case authors its own
// `forbidden_assertions` next to its question. That is more work per case, and
// it keeps the logic in the YAML the user edits rather than buried here.

const ACKNOWLEDGMENT_MARKERS = [
  /\b(i )?don'?t have\b/i,
  /\b(i )?do not have\b/i,
  /\bnot (something|information|a detail|covered|listed|included|available|in|part of)\b/i,
  /\b(isn'?t|is not) (listed|covered|included|mentioned|something|in )\b/i,
  /\b(no|nothing) (information|details?|record|data|mention)\b/i,
  /\b(i )?can'?t (confirm|say|speak to|tell you)\b/i,
  /\b(i )?cannot (confirm|say|speak to|tell you)\b/i,
  /\b(doesn'?t|does not) (say|mention|specify|cover|appear)\b/i,
  /\b(not|nothing) (that i|i'?m) (know|aware|have)\b/i,
  /\bunable to (confirm|say|verify)\b/i,
  /\bwould need to ask\b/i,
  /\bnot (documented|specified|stated)\b/i,
];

const REDIRECT_MARKERS = [
  /\b(what (i|he) (do|does) have|what i can tell you|here'?s what)\b/i,
  /\b(you'?d want to|best to|worth) ask(ing)?\b/i,
  /\b(reach(?:ing)? out|contact(?:ing)?|ask(?:ing)? (?:adam|him)|recommend)\b/i,
  /\b(he (has|did|does)|his (actual|documented|recorded))\b/i,
  /\b(happy to|i can) (share|cover|tell|walk|suggest)\b/i,
  /\b(i(?:'d| would)? suggest|i recommend|you (?:could|might|may want to))\b/i,
  /\b(in an? (?:interview|conversation|call)|directly with him)\b/i,
  /\bhis (?:education|experience|resume|background|portfolio|details?)\b/i,
  /\bwhat (?:is|i) (?:do )?(?:have|know|can confirm)\b/i,
];

/**
 * @param spec        the case's abstention block
 * @param response    the model's answer
 */
export function gradeAbstention(response: string, spec: AbstentionSpec | undefined): GraderResult {
  if (!spec?.required) {
    return { grader: 'abstention', passed: true, findings: [], skipped: true };
  }

  const findings: Finding[] = [];

  // Half 1 — did it say it doesn't know?
  if (!ACKNOWLEDGMENT_MARKERS.some((pattern) => pattern.test(response))) {
    findings.push({
      grader: 'abstention',
      detail: 'no explicit acknowledgment of not knowing — the question is unanswerable from FACTS.md',
    });
  }

  // Half 2 — having hedged, did it then guess anyway?
  for (const source of spec.forbidden_assertions ?? []) {
    let pattern: RegExp;
    try {
      pattern = new RegExp(source, 'i');
    } catch (err) {
      findings.push({
        grader: 'abstention',
        detail: `invalid forbidden_assertions regex in case: /${source}/ (${(err as Error).message})`,
      });
      continue;
    }
    const span = findSpan(response, pattern);
    if (span !== undefined) {
      findings.push({
        grader: 'abstention',
        detail: `hedged, then asserted anyway — matched /${source}/`,
        evidence: excerpt(response, span),
      });
    }
  }

  // A bare "I don't know" is correct but useless to a recruiter. Only checked
  // when the case asks for it.
  if (spec.redirect_expected && !REDIRECT_MARKERS.some((pattern) => pattern.test(response))) {
    findings.push({
      grader: 'abstention',
      detail: 'declined without redirecting — no pointer to what IS known or who to ask',
    });
  }

  return { grader: 'abstention', passed: findings.length === 0, findings };
}
