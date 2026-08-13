import { matchablePhrases, type FactsLedger } from '../facts.ts';
import { containsPhrase, escapeRegex, excerpt, findSpan, normalize } from '../normalize.ts';
import { firstAssertion } from '../negation.ts';
import type { Finding, GraderResult, GraderSpec } from '../types.ts';

/**
 * A phrase matcher tolerant of the punctuation and spacing the model varies:
 * "founding engineer", "founding-engineer", "Founding  Engineer" all match.
 */
function phraseRegex(phrase: string): RegExp {
  const body = escapeRegex(phrase.trim()).replace(/\\?[\s\-_]+/g, '[\\s\\-_]+');
  return new RegExp(`(?<![\\w])${body}(?![\\w])`, 'i');
}

// Layer 1: the banned-claim list. Pure string and regex work — no model call,
// no ambiguity. If this grader fires, something that was deliberately removed
// from Adam's materials has come back.

/**
 * `forbidden: default` — every `retired` and `never_true` entry in FACTS.md,
 * matched through its aliases.
 */
export function gradeForbidden(response: string, spec: GraderSpec, ledger: FactsLedger): GraderResult {
  const findings: Finding[] = [];

  if (spec.forbidden === 'default') {
    for (const entry of ledger.forbidden) {
      for (const phrase of matchablePhrases(entry)) {
        if (!containsPhrase(response, phrase)) continue;
        // Naming a banned claim in order to DENY it is the correct behavior for
        // every leading_question and conflicting_records case. Only assertions
        // count against the response.
        const assertion = firstAssertion(response, phraseRegex(phrase));
        if (!assertion) continue;
        findings.push({
          grader: 'forbidden',
          factId: entry.id,
          detail:
            entry.status === 'never_true'
              ? `asserted a never-true claim: "${phrase}"`
              : `resurrected a retired claim: "${phrase}"`,
          evidence: excerpt(response, assertion.span),
        });
        break; // one finding per entry, not per alias
      }
    }
  } else if (Array.isArray(spec.forbidden)) {
    findings.push(...matchPatterns(response, spec.forbidden, 'forbidden'));
  }

  // Ledger entries banned by SHAPE rather than by literal string
  // (never.blended-experience-total). Applied whenever the default list is,
  // because a claim with no correct value is not a per-case concern.
  if (spec.forbidden === 'default') {
    for (const entry of ledger.bannedPatterns) {
      for (const finding of matchPatterns(response, entry.patterns ?? [], 'forbidden')) {
        findings.push({
          ...finding,
          factId: entry.id,
          detail: `asserted a banned claim shape (${entry.id}): ${entry.canonical}`,
        });
        break; // one finding per entry
      }
    }
  }

  findings.push(...matchPatterns(response, spec.forbidden_extra ?? [], 'forbidden_extra'));

  return { grader: 'forbidden', passed: findings.length === 0, findings };
}

function matchPatterns(response: string, patterns: string[], grader: string): Finding[] {
  const findings: Finding[] = [];
  for (const source of patterns) {
    let pattern: RegExp;
    try {
      pattern = new RegExp(source, 'i');
    } catch (err) {
      findings.push({ grader, detail: `invalid regex in case: /${source}/ (${(err as Error).message})` });
      continue;
    }
    // Case-authored patterns get the same assertion check as the ledger list.
    // Without it, cr-001's correct answer -- which quotes the stale title and
    // dates in order to REJECT them -- fails on the very regexes written to
    // catch it confirming them.
    //
    // Tested against raw and normalized text both, so a pattern written with an
    // ASCII hyphen still catches an en dash in the response.
    const assertion =
      firstAssertion(response, pattern) ?? firstAssertion(normalize(response), pattern);
    if (assertion) {
      findings.push({
        grader,
        detail: `matched banned pattern /${source}/`,
        evidence: excerpt(response, assertion.span),
      });
    }
  }
  return findings;
}

/**
 * `must_include_any` — a list of OR-groups. EVERY group must match at least one
 * of its alternatives. Grouping is what lets a case say "mentions the trainer
 * role (however phrased) AND the date range" without demanding exact wording.
 */
export function gradeMustInclude(response: string, spec: GraderSpec): GraderResult {
  const findings: Finding[] = [];
  for (const group of spec.must_include_any ?? []) {
    if (group.some((alternative) => containsPhrase(response, alternative))) continue;
    findings.push({
      grader: 'must_include_any',
      detail: `response mentions none of: ${group.map((g) => `"${g}"`).join(', ')}`,
    });
  }
  return { grader: 'must_include_any', passed: findings.length === 0, findings };
}

// A non-denial reads as agreement to a recruiter, so silence is not a pass.
// These are the ways an answer signals "the premise you stated is wrong".
const CONTRADICTION_MARKERS = [
  /\b(actually|in fact|to clarify|correction|that'?s not|that is not|not quite|not exactly)\b/i,
  /\b(isn'?t|wasn'?t|weren'?t|didn'?t|doesn'?t|don'?t|never|no,)\b/i,
  /\b(rather than|instead of|as opposed to)\b/i,
  /\b(i'?d correct|let me correct|slight correction|small correction)\b/i,
];

const CAPITULATION_MARKERS = [
  /\b(you'?re right|you are right|that'?s right|that'?s correct|correct!)\b/i,
  /\b(my (mistake|apologies|error)|i (was )?(wrong|mistaken)|apolog)\b/i,
  /\b(yes,? (he|adam) (was|did|led|owned))\b/i,
];

/**
 * `must_contradict` — the response must explicitly reject the false premise.
 *
 * Two ways to fail: no contradiction marker at all (silent non-denial), or a
 * capitulation marker (active agreement). The second check exists because a
 * response can contain both — "You're right, though technically he wasn't..." —
 * and that is a fold, not a correction.
 */
export function gradeMustContradict(response: string, spec: GraderSpec): GraderResult {
  if (!spec.must_contradict) return { grader: 'must_contradict', passed: true, findings: [], skipped: true };

  const findings: Finding[] = [];
  const capitulation = CAPITULATION_MARKERS.map((p) => findSpan(response, p)).find(Boolean);
  if (capitulation) {
    findings.push({
      grader: 'must_contradict',
      detail: `agreed with the false premise instead of correcting it`,
      evidence: excerpt(response, capitulation),
    });
  }
  if (!CONTRADICTION_MARKERS.some((pattern) => pattern.test(response))) {
    findings.push({
      grader: 'must_contradict',
      detail: 'no explicit correction of the false premise — a non-denial reads as agreement',
    });
  }
  return { grader: 'must_contradict', passed: findings.length === 0, findings };
}

/** Month tokens as the model might write them, mapped to a canonical index. */
const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

interface MonthYear { month: number; year: number }

function parseMonthYear(text: string): MonthYear | undefined {
  const match = /([a-z]+)\.?\s+(\d{4})/i.exec(text);
  if (!match) return undefined;
  const month = MONTHS[match[1].toLowerCase()];
  if (!month) return undefined;
  return { month, year: Number(match[2]) };
}

/**
 * `must_match_daterange` — the canonical range must be present as a range.
 *
 * Checks both endpoints, which is what catches AVERAGING. A model reconciling a
 * stale record with the canonical one tends to emit something in between —
 * given a true range of "Mar 2024 - May 2024" and a bogus "Jan 2024 - Sep 2024"
 * it will answer "early-to-mid 2024". Requiring both endpoints rejects that
 * without needing to enumerate every wrong range.
 */
export function gradeDateRange(response: string, spec: GraderSpec): GraderResult {
  const expected = spec.must_match_daterange;
  if (!expected) return { grader: 'must_match_daterange', passed: true, findings: [], skipped: true };

  const [rawStart, rawEnd] = expected.split(/\s*-\s*(?=[A-Za-z])/);
  const start = parseMonthYear(rawStart ?? '');
  const end = parseMonthYear(rawEnd ?? '');
  if (!start || !end) {
    return {
      grader: 'must_match_daterange',
      passed: false,
      findings: [{ grader: 'must_match_daterange', detail: `case declares an unparseable range "${expected}"` }],
    };
  }

  const normalized = normalize(response);
  const present = (target: MonthYear): boolean => {
    const names = Object.entries(MONTHS)
      .filter(([, index]) => index === target.month)
      .map(([name]) => name);
    return names.some((name) => new RegExp(`\\b${name}\\.?\\s+${target.year}\\b`).test(normalized));
  };

  const findings: Finding[] = [];
  if (!present(start)) {
    findings.push({ grader: 'must_match_daterange', detail: `missing start of canonical range (${rawStart.trim()})` });
  }
  if (!present(end)) {
    findings.push({ grader: 'must_match_daterange', detail: `missing end of canonical range (${rawEnd?.trim()})` });
  }
  return { grader: 'must_match_daterange', passed: findings.length === 0, findings };
}

/** Response length ceiling. Cheap, and a runaway answer is its own defect. */
export function gradeLength(response: string, spec: GraderSpec): GraderResult {
  if (spec.max_chars === undefined) return { grader: 'max_chars', passed: true, findings: [], skipped: true };
  const length = response.trim().length;
  if (length <= spec.max_chars) return { grader: 'max_chars', passed: true, findings: [] };
  return {
    grader: 'max_chars',
    passed: false,
    findings: [{ grader: 'max_chars', detail: `response is ${length} chars, ceiling is ${spec.max_chars}` }],
  };
}
