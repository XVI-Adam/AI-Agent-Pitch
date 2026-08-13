import type { Expectation, GraderResult, JudgeVerdict, Surface } from './types.ts';

// Reporting. The stated goal is a diff readable in under 30 seconds, so the
// ordering is: regressions first, then everything else. A failure prints the
// question, the response, and the grader output that tripped — a red X tells
// you nothing you can act on.

export interface CaseOutcome {
  id: string;
  category: string;
  surface: Surface;
  question: string;
  expect: Expectation;
  hypothesis?: string;
  response: string;
  passed: boolean;
  graders: GraderResult[];
  judge?: JudgeVerdict;
  latencyMs: number;
  tokens: number;
  retries: number;
  cached: boolean;
  sample: number;
}

export interface RunReport {
  timestamp: string;
  /** Hash of SYSTEM_PROMPT + fit prompt shape + FACTS.md. */
  promptHash?: string;
  model: string;
  judgeModel?: string;
  temperature: number;
  samples: number;
  /** Judge skipped — layers 1-3 only. */
  deterministicOnly?: boolean;
  filter?: string;
  consistency: GraderResult;
  outcomes: CaseOutcome[];
  errors: Array<{ id: string; message: string }>;
  expectedFailures: Record<string, string>;
}

const pct = (n: number, d: number) => (d === 0 ? '—' : `${Math.round((n / d) * 100)}%`);

/** Collapses repeated samples of one case: it passes only if every sample did. */
function byCase(outcomes: CaseOutcome[]): Map<string, CaseOutcome[]> {
  const map = new Map<string, CaseOutcome[]>();
  for (const outcome of outcomes) {
    const list = map.get(outcome.id) ?? [];
    list.push(outcome);
    map.set(outcome.id, list);
  }
  return map;
}

function isFlaky(samples: CaseOutcome[]): boolean {
  return samples.length > 1 && samples.some((s) => s.passed) && samples.some((s) => !s.passed);
}

function findingLines(outcome: CaseOutcome): string[] {
  const lines: string[] = [];
  for (const grader of outcome.graders) {
    for (const finding of grader.findings) {
      lines.push(`  - \`${finding.grader}\`${finding.factId ? ` [${finding.factId}]` : ''}: ${finding.detail}`);
      if (finding.evidence) lines.push(`      > ${finding.evidence.replace(/\n+/g, ' ').trim()}`);
    }
  }
  for (const finding of outcome.judge?.findings ?? []) {
    lines.push(`  - \`judge\`: ${finding.detail}`);
    if (finding.evidence) lines.push(`      > ${finding.evidence.replace(/\n+/g, ' ').trim()}`);
  }
  return lines;
}

export function renderMarkdown(report: RunReport, baseline?: RunReport): string {
  const grouped = byCase(report.outcomes);
  const cases = [...grouped.entries()].map(([id, samples]) => ({
    id,
    samples,
    passed: samples.every((s) => s.passed),
    flaky: isFlaky(samples),
    representative: samples.find((s) => !s.passed) ?? samples[0],
  }));

  const passing = cases.filter((c) => c.passed);
  const failing = cases.filter((c) => !c.passed);

  const baselinePassing = new Set((baseline?.outcomes ?? []).filter((o) => o.passed).map((o) => o.id));
  const baselineKnown = new Set((baseline?.outcomes ?? []).map((o) => o.id));

  const stale = isBaselineStale(report, baseline);
  const regressions = stale
    ? []
    : failing.filter((c) => baselinePassing.has(c.id) && !(c.id in report.expectedFailures));
  const known = failing.filter((c) => c.id in report.expectedFailures);
  const other = failing.filter((c) => !regressions.includes(c) && !known.includes(c));
  const fixed = stale
    ? []
    : [...grouped.keys()].filter(
        (id) => baselineKnown.has(id) && !baselinePassing.has(id) && grouped.get(id)!.every((s) => s.passed),
      );

  const out: string[] = [];
  out.push(`# Ask Adam eval — ${report.timestamp}`);
  out.push('');
  out.push(
    `**${passing.length}/${cases.length} passing (${pct(passing.length, cases.length)})** · ` +
      `model \`${report.model}\`` +
      (report.judgeModel ? ` · judge \`${report.judgeModel}\`` : '') +
      ` · temperature ${report.temperature}` +
      (report.deterministicOnly ? ' · deterministic only (judge skipped)' : '') +
      (report.samples > 1 ? ` · ${report.samples} samples/case` : '') +
      (report.filter ? ` · filter \`${report.filter}\`` : ''),
  );
  out.push('');

  if (!baseline) {
    out.push('> No `evals/baseline.json` yet — nothing to diff against. Promote a run with `npm run eval:baseline`.');
    out.push('');
  } else if (stale) {
    out.push(
      '> **baseline stale — regression diff suppressed.** The baseline was measured against a ' +
        `different prompt or ledger (\`${baseline.promptHash ?? 'none'}\` vs \`${report.promptHash}\`). ` +
        'Every diff against it would be noise. Re-run and `npm run eval:baseline` to re-anchor.',
    );
    out.push('');
  }

  // Errored cases produce no outcome, so every count and rate below silently
  // excludes them. Say so above the numbers, not in a footnote under them.
  if (report.errors.length > 0) {
    out.push(`## ⚠️ INCOMPLETE — ${report.errors.length} case(s) errored`);
    out.push('');
    out.push('These produced no result and are **not** included in any count or rate below.');
    out.push('');
    for (const error of report.errors) out.push(`- \`${error.id}\` — ${error.message}`);
    out.push('');
  }

  // Regressions first and unmissable: this is the number that should block a PR.
  if (regressions.length > 0) {
    out.push(`## 🔴 ${regressions.length} NEW REGRESSION${regressions.length === 1 ? '' : 'S'}`);
    out.push('');
    out.push('These passed against the baseline and fail now.');
    out.push('');
    for (const c of regressions) out.push(...renderFailure(c.representative, c.flaky, c.samples.length));
  }

  if (fixed.length > 0) {
    out.push(`## 🟢 ${fixed.length} newly fixed`);
    out.push('');
    out.push(fixed.map((id) => `\`${id}\``).join(', '));
    out.push('');
  }

  if (!report.consistency.passed) {
    out.push('## ⚠️ facts-consistency');
    out.push('');
    out.push('`src/data/context.ts` ships claims with no canonical `FACTS.md` entry:');
    out.push('');
    for (const finding of report.consistency.findings) out.push(`- ${finding.detail}`);
    out.push('');
  }

  out.push('## By category');
  out.push('');
  out.push('| Category | Pass | Rate |');
  out.push('|---|---|---|');
  const categories = [...new Set(cases.map((c) => c.representative.category))].sort();
  for (const category of categories) {
    const inCategory = cases.filter((c) => c.representative.category === category);
    const passed = inCategory.filter((c) => c.passed).length;
    out.push(`| ${category} | ${passed}/${inCategory.length} | ${pct(passed, inCategory.length)} |`);
  }
  out.push('');

  if (other.length > 0) {
    out.push(`## Failures (${other.length})`);
    out.push('');
    for (const c of other) out.push(...renderFailure(c.representative, c.flaky, c.samples.length));
  }

  if (known.length > 0) {
    out.push(`## Known failures (${known.length})`);
    out.push('');
    out.push('Tracked in `evals/expected_failures.json`. These do not block CI.');
    out.push('');
    for (const c of known) {
      out.push(`- \`${c.id}\` — ${report.expectedFailures[c.id]}`);
    }
    out.push('');
  }

  const retried = report.outcomes.filter((o) => o.retries > 0);
  const flaky = cases.filter((c) => c.flaky);
  if (retried.length > 0 || flaky.length > 0 || report.errors.length > 0) {
    out.push('## Run notes');
    out.push('');
    if (flaky.length > 0) {
      out.push(`- **Variance:** ${flaky.map((c) => `\`${c.id}\``).join(', ')} passed on some samples and failed on others.`);
    }
    if (retried.length > 0) {
      out.push(`- **Retried:** ${retried.length} call(s) hit a rate limit or transient error and were retried with backoff.`);
    }
    for (const error of report.errors) out.push(`- **Errored:** \`${error.id}\` — ${error.message}`);
    out.push('');
  }

  return out.join('\n');
}

function renderFailure(outcome: CaseOutcome, flaky: boolean, sampleCount: number): string[] {
  const out: string[] = [];
  const tags = [
    outcome.expect !== 'pass' ? `expected \`${outcome.expect}\`` : null,
    flaky ? `flaky (${sampleCount} samples)` : null,
    outcome.cached ? 'cached' : null,
  ].filter(Boolean);

  out.push(`### \`${outcome.id}\` · ${outcome.category}${tags.length ? ` · ${tags.join(' · ')}` : ''}`);
  out.push('');
  out.push(`**Q:** ${outcome.question.replace(/\n/g, '  \n')}`);
  out.push('');
  out.push('**Response:**');
  out.push('');
  out.push('```');
  out.push(outcome.response.trim().slice(0, 1200) + (outcome.response.length > 1200 ? '\n…[truncated]' : ''));
  out.push('```');
  out.push('');
  out.push('**Tripped:**');
  out.push(...findingLines(outcome));
  if (outcome.hypothesis) {
    out.push('');
    out.push(`**Predicted:** ${outcome.hypothesis.trim().replace(/\n+/g, ' ')}`);
  }
  out.push('');
  return out;
}

/** Compact table for the PR comment — the summary, not the full report. */
export function renderSummaryTable(report: RunReport, baseline?: RunReport): string {
  const grouped = byCase(report.outcomes);
  const cases = [...grouped.entries()].map(([id, samples]) => ({ id, passed: samples.every((s) => s.passed) }));
  const stale = isBaselineStale(report, baseline);
  const baselinePassing = new Set((baseline?.outcomes ?? []).filter((o) => o.passed).map((o) => o.id));
  const regressions = stale
    ? []
    : cases.filter((c) => !c.passed && baselinePassing.has(c.id) && !(c.id in report.expectedFailures));

  const passed = cases.filter((c) => c.passed).length;
  const lines = [
    `**Ask Adam evals:** ${passed}/${cases.length} passing (${pct(passed, cases.length)})`,
    '',
    stale
      ? '⚠️ **baseline stale — regression diff suppressed.** Prompt or ledger changed since the baseline was taken.'
      : regressions.length > 0
        ? `🔴 **${regressions.length} new regression(s):** ${regressions.map((c) => `\`${c.id}\``).join(', ')}`
        : '✅ No new regressions.',
    '',
  ];

  // An errored case has no outcome, so it is absent from the counts above.
  // Saying "50/50 passing" while 12 cases never ran is the failure mode this
  // line exists to prevent — state it where nobody can miss it.
  if (report.errors.length > 0) {
    lines.push(
      `⚠️ **Incomplete run — ${report.errors.length} case(s) errored and are NOT counted above:** ` +
        report.errors.map((e) => `\`${e.id}\``).join(', '),
      '',
    );
  }

  lines.push('| Category | Pass | Rate |', '|---|---|---|');

  const outcomeById = new Map(report.outcomes.map((o) => [o.id, o]));
  const categories = [...new Set(report.outcomes.map((o) => o.category))].sort();
  for (const category of categories) {
    const inCategory = cases.filter((c) => outcomeById.get(c.id)?.category === category);
    const categoryPassed = inCategory.filter((c) => c.passed).length;
    lines.push(`| ${category} | ${categoryPassed}/${inCategory.length} | ${pct(categoryPassed, inCategory.length)} |`);
  }
  return lines.join('\n');
}

/**
 * The only thing CI actually blocks on: cases that passed against the baseline
 * and fail now, minus anything tracked in expected_failures.json.
 *
 * A case that was ALREADY failing is not a regression, and a case absent from
 * the baseline (newly added) is not one either -- otherwise every new
 * `expect: fail` case would break the build the day it lands.
 */
/**
 * A baseline only means something against the prompt it measured. When they
 * differ, every diff is noise and the honest move is to say so rather than
 * emit regressions nobody can act on.
 */
export function isBaselineStale(report: RunReport, baseline: RunReport | undefined): boolean {
  if (!baseline) return false;
  return baseline.promptHash !== report.promptHash;
}

export function newRegressions(report: RunReport, baseline: RunReport | undefined): string[] {
  if (isBaselineStale(report, baseline)) return [];
  const grouped = byCase(report.outcomes);
  const baselineGrouped = byCase(baseline?.outcomes ?? []);

  const baselinePassing = new Set(
    [...baselineGrouped.entries()].filter(([, s]) => s.every((o) => o.passed)).map(([id]) => id),
  );
  const nowFailing = [...grouped.entries()].filter(([, s]) => s.some((o) => !o.passed)).map(([id]) => id);

  return nowFailing.filter((id) => baselinePassing.has(id) && !(id in report.expectedFailures));
}
