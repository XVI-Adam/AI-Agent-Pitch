import { validateFitReport } from '../../../api/_lib/validateFitReport.ts';
import type { FitReport } from '../../../src/types/fit.ts';
import type { FactsLedger } from '../facts.ts';
import type { Finding, GraderResult, GraderSpec } from '../types.ts';
import { gradeGrounded } from './grounded.ts';
import { gradeForbidden } from './forbidden.ts';

// JD Fit Rater graders.
//
// The schema check imports the APP'S OWN validator rather than reimplementing
// it. That is the whole point: if validateFitReport rejects a payload here, the
// user would have seen "Couldn't analyze this JD" in production. A second
// schema definition would drift and start disagreeing with the thing that
// actually ships.

export interface FitGradeInput {
  /** The raw string the model returned, before JSON.parse. */
  raw: string;
  /** The JD text, so its own vocabulary doesn't count as invented. */
  jobDescription: string;
}

export function gradeFitSchema(input: FitGradeInput): GraderResult & { report?: FitReport } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.raw);
  } catch (err) {
    return {
      grader: 'schema',
      passed: false,
      findings: [
        {
          grader: 'schema',
          detail: `response is not valid JSON — in production this renders as "Couldn't analyze this JD" (${(err as Error).message})`,
          evidence: input.raw.slice(0, 200),
        },
      ],
    };
  }

  const report = validateFitReport(parsed);
  if (!report) {
    return {
      grader: 'schema',
      passed: false,
      findings: [
        {
          grader: 'schema',
          // validateFitReport rejects rather than coerces, so it returns null
          // without saying why. Re-derive the reason for the report.
          detail: `parsed as JSON but failed validateFitReport: ${explainSchemaFailure(parsed)}`,
          evidence: input.raw.slice(0, 300),
        },
      ],
    };
  }

  return { grader: 'schema', passed: true, findings: [], report };
}

const REQUIRED_CATEGORIES = ['tech_stack', 'experience_level', 'seniority', 'domain_fit', 'working_style'];

function explainSchemaFailure(parsed: unknown): string {
  if (typeof parsed !== 'object' || parsed === null) return 'top level is not an object';
  const obj = parsed as Record<string, unknown>;

  const score = obj.overall_score;
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 1 || score > 10) {
    return `overall_score is ${JSON.stringify(score)} (must be a number 1-10)`;
  }
  if (typeof obj.categories !== 'object' || obj.categories === null) return 'categories is missing';
  const categories = obj.categories as Record<string, unknown>;
  for (const key of REQUIRED_CATEGORIES) {
    const raw = categories[key];
    if (typeof raw !== 'object' || raw === null) return `categories.${key} is missing`;
    const category = raw as Record<string, unknown>;
    const categoryScore = category.score;
    if (typeof categoryScore !== 'number' || categoryScore < 1 || categoryScore > 10) {
      return `categories.${key}.score is ${JSON.stringify(categoryScore)} (must be 1-10)`;
    }
    if (typeof category.rationale !== 'string' || !category.rationale.trim()) {
      return `categories.${key}.rationale is empty`;
    }
  }
  if (!Array.isArray(obj.gaps)) return 'gaps is not an array';
  if (obj.gaps.length < 1 || obj.gaps.length > 3) return `gaps has ${obj.gaps.length} items (must be 1-3)`;
  if (typeof obj.tailored_pitch !== 'string' || !obj.tailored_pitch.trim()) return 'tailored_pitch is empty';
  return 'unknown validation failure';
}

/**
 * Score bands are deliberately 3-4 points wide. They catch calibration
 * collapse — a rater that scores a staff-level Kubernetes role a 7 for a
 * candidate with neither — not fine-grained disagreement about whether a fit is
 * a 6 or a 7.
 */
export function gradeScoreBands(report: FitReport, spec: GraderSpec): GraderResult {
  const findings: Finding[] = [];

  const overall = spec.score_band?.overall;
  if (overall && (report.overall_score < overall[0] || report.overall_score > overall[1])) {
    findings.push({
      grader: 'score_band',
      detail: `overall_score ${report.overall_score} is outside the expected band ${overall[0]}-${overall[1]}`,
      evidence: report.tailored_pitch,
    });
  }

  for (const [category, band] of Object.entries(spec.category_bands ?? {})) {
    const scored = report.categories[category as keyof FitReport['categories']];
    if (!scored) {
      findings.push({ grader: 'score_band', detail: `case references unknown category "${category}"` });
      continue;
    }
    if (scored.score < band[0] || scored.score > band[1]) {
      findings.push({
        grader: 'score_band',
        detail: `${category} scored ${scored.score}, expected ${band[0]}-${band[1]}`,
        evidence: scored.rationale,
      });
    }
  }

  if (spec.gaps_min !== undefined && report.gaps.length < spec.gaps_min) {
    findings.push({
      grader: 'score_band',
      detail: `named ${report.gaps.length} gap(s), case requires at least ${spec.gaps_min}`,
    });
  }

  return { grader: 'score_band', passed: findings.length === 0, findings };
}

/**
 * evidence_trace — every entity the report names in a rationale, gap, or pitch
 * must resolve to FACTS.md.
 *
 * The JD's own text is added to the allowlist: a rationale that says "the role
 * asks for Kubernetes, which he lacks" is correctly quoting the JD, not
 * inventing a credential. Without that allowance this grader would fire on
 * every honest gap.
 */
export function gradeEvidenceTrace(
  report: FitReport,
  spec: GraderSpec,
  ledger: FactsLedger,
  jobDescription: string,
): GraderResult {
  if (spec.evidence_trace !== 'strict') {
    return { grader: 'evidence_trace', passed: true, findings: [], skipped: true };
  }

  const prose = [
    ...Object.values(report.categories).map((c) => c.rationale),
    ...report.gaps,
    report.tailored_pitch,
  ].join('\n');

  const grounded = gradeGrounded(prose, ledger, { mode: 'strict', extraAllowed: [jobDescription] });
  const forbidden = gradeForbidden(prose, spec, ledger);

  const findings = [
    ...grounded.findings.map((f) => ({ ...f, grader: 'evidence_trace' })),
    ...forbidden.findings.map((f) => ({ ...f, grader: 'evidence_trace' })),
  ];
  return { grader: 'evidence_trace', passed: findings.length === 0, findings };
}
