import type { FactsLedger } from '../facts.ts';
import { excerpt } from '../normalize.ts';
import type { Finding, GraderResult, NumericToleranceSpec } from '../types.ts';

// The grader that exists because the spec'd grounded-entity check would be
// WRONG without it.
//
// "How many years of professional experience does Adam have?" has a correct
// answer containing a number that appears nowhere in FACTS.md, because it is
// computed: Sigo Signs (3 months) + BodyCraft (4 months) = ~7 months. A
// string-matching grounded check fails every legitimate derived figure. So
// derived values are declared in FACTS.md with a formula and a tolerance band,
// recomputed here against the CURRENT date, and compared numerically.
//
// Recomputing rather than hardcoding is what keeps these cases from rotting:
// "how long since he graduated" has a different right answer every month.

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function parseAnchorDate(value: string): Date | undefined {
  const match = /([a-z]+)\.?\s+(\d{4})/i.exec(value);
  if (!match) return undefined;
  const month = MONTHS[match[1].toLowerCase()];
  if (!month) return undefined;
  return new Date(Number(match[2]), month - 1, 1);
}

function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

/**
 * Resolves a `derived.*` entry to a month count.
 *
 * Two formula shapes are supported, which is all the ledger needs:
 *   "now - education.grad_date(May 2025)"  → months from that date until today
 *   "dates.sigo(3) + dates.bodycraft(4)"   → sum of the entries' duration_months
 */
export function resolveDerived(
  derivedRef: string,
  ledger: FactsLedger,
  now = new Date(),
): { months: number; tolerance: number } | { error: string } {
  const entry = ledger.byId.get(derivedRef);
  if (!entry) return { error: `FACTS.md has no entry "${derivedRef}"` };

  const tolerance = entry.tolerance_months ?? 2;
  const formula = entry.formula ?? '';

  if (/^now\s*-/.test(formula)) {
    const ref = /([\w.\-]+)\s*\(/.exec(formula)?.[1];
    const anchorEntry = ref ? ledger.byId.get(ref) : undefined;
    const anchor = anchorEntry ? parseAnchorDate(anchorEntry.canonical) : undefined;
    if (!anchor) return { error: `cannot resolve anchor date for formula "${formula}"` };
    return { months: monthsBetween(anchor, now), tolerance };
  }

  const refs = [...formula.matchAll(/([\w.\-]+)\s*\(\s*\d+\s*\)/g)].map((m) => m[1]);
  if (refs.length > 0) {
    let total = 0;
    for (const ref of refs) {
      const part = ledger.byId.get(ref);
      if (!part?.duration_months) return { error: `entry "${ref}" has no duration_months` };
      total += part.duration_months;
    }
    return { months: total, tolerance };
  }

  if (entry.numeric !== undefined) return { months: entry.numeric, tolerance };
  return { error: `entry "${derivedRef}" has neither a usable formula nor a numeric value` };
}

/** Every (value, unit) pair the response states, converted to months. */
function extractMonths(response: string, extract: string): Array<{ months: number; span: string }> {
  const results: Array<{ months: number; span: string }> = [];
  let pattern: RegExp;
  try {
    pattern = new RegExp(extract, 'gi');
  } catch {
    return results;
  }
  for (const match of response.matchAll(pattern)) {
    const value = Number(match[1]);
    const unit = (match[2] ?? '').toLowerCase();
    if (!Number.isFinite(value)) continue;
    results.push({ months: unit.startsWith('y') ? value * 12 : value, span: match[0] });
  }
  return results;
}

export function gradeNumericTolerance(
  response: string,
  spec: NumericToleranceSpec | undefined,
  ledger: FactsLedger,
  now = new Date(),
): GraderResult {
  if (!spec) return { grader: 'numeric_tolerance', passed: true, findings: [], skipped: true };

  const resolved = resolveDerived(spec.derived_ref, ledger, now);
  if ('error' in resolved) {
    return {
      grader: 'numeric_tolerance',
      passed: false,
      findings: [{ grader: 'numeric_tolerance', detail: resolved.error }],
    };
  }

  const stated = extractMonths(response, spec.extract);
  if (stated.length === 0) {
    return {
      grader: 'numeric_tolerance',
      passed: false,
      findings: [
        {
          grader: 'numeric_tolerance',
          detail: `no duration stated — expected roughly ${resolved.months} months (+/-${resolved.tolerance})`,
        },
      ],
    };
  }

  const findings: Finding[] = [];
  const low = resolved.months - resolved.tolerance;
  const high = resolved.months + resolved.tolerance;
  // Every stated duration must be in band. A response that gives the right
  // figure and then a wrong one ("about 7 months — call it two years of
  // building") has still told the recruiter something false.
  for (const { months, span } of stated) {
    if (months >= low && months <= high) continue;
    findings.push({
      grader: 'numeric_tolerance',
      detail: `stated "${span.trim()}" (${months} months); canonical is ${resolved.months} months, band ${low}-${high}`,
      evidence: excerpt(response, span.trim()),
    });
  }

  return { grader: 'numeric_tolerance', passed: findings.length === 0, findings };
}
