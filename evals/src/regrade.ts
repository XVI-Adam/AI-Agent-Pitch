import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SYSTEM_PROMPT } from '../../src/data/context.ts';
import { buildFitPrompt } from '../../api/_lib/buildFitPrompt.ts';
import { loadCases, loadJobDescription } from './cases.ts';
import { loadLedger } from './facts.ts';
import { promptHash } from './promptHash.ts';
import { gradeFactsConsistency, runDeterministicGraders } from './graders/index.ts';
import type { RunReport } from './report.ts';

// `npm run eval:regrade` — the PR gate's quota-free half.
//
// Re-runs the DETERMINISTIC graders over the responses stored in
// evals/baseline.json (the committed record of what the model said; the
// response cache in evals/.cache is deliberately untracked). No API key, no
// quota, seconds not minutes — so it can block every PR, which the judged
// suite never should.
//
// What it catches: a grader change that flips verdicts on known responses, a
// ledger edit that contradicts something previously graded fine, and
// expected_failures bookkeeping drift. What it cannot catch: how the model
// answers NOW — that is the judged suite's job.
//
// Same staleness rule as the runner: if the prompt or ledger changed since the
// baseline was taken, old responses are not evidence about the new prompt, so
// the regrade reports but does not fail. The judged run + `eval:baseline`
// re-anchor.

const BASELINE_PATH = fileURLToPath(new URL('../baseline.json', import.meta.url));
const EXPECTED_FAILURES_PATH = fileURLToPath(new URL('../expected_failures.json', import.meta.url));

function main(): void {
  if (!existsSync(BASELINE_PATH)) {
    console.error('No evals/baseline.json — nothing to regrade. Run the full suite and `npm run eval:baseline`.');
    process.exit(1);
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as RunReport;
  const expectedFailures: Record<string, string> = existsSync(EXPECTED_FAILURES_PATH)
    ? (JSON.parse(readFileSync(EXPECTED_FAILURES_PATH, 'utf8')).cases ?? {})
    : {};

  const ledger = loadLedger();
  const casesById = new Map(loadCases().map((c) => [c.id, c]));

  // The consistency check needs no stored responses and is never suppressed:
  // the shipping prompts either match the ledger right now or they do not.
  const consistency = gradeFactsConsistency(
    [{ name: 'SYSTEM_PROMPT', text: SYSTEM_PROMPT }, { name: 'FIT_CONTEXT_SUMMARY', text: buildFitPrompt('') }],
    ledger,
  );
  if (!consistency.passed) {
    console.error('facts-consistency FAILED — a shipping prompt asserts something the ledger does not:');
    for (const finding of consistency.findings) console.error(`  - ${finding.detail}`);
  }

  const stale = baseline.promptHash !== promptHash();
  const newlyFailing: string[] = [];
  let regraded = 0;

  for (const outcome of baseline.outcomes) {
    const evalCase = casesById.get(outcome.id);
    if (!evalCase) continue; // case retired since the baseline; regen will drop it
    const jobDescription = evalCase.surface === 'fit' ? loadJobDescription(evalCase.jd_file!) : undefined;
    const now = runDeterministicGraders(evalCase, outcome.response, ledger, { jobDescription });
    regraded++;

    const before = outcome.graders.every((g) => g.passed); // deterministic verdict as recorded
    if (before && !now.passed && !(outcome.id in expectedFailures)) {
      newlyFailing.push(outcome.id);
      console.error(`\n${outcome.id}: deterministic graders now fail a response they passed at baseline:`);
      for (const result of now.results.filter((r) => !r.passed)) {
        for (const finding of result.findings) console.error(`  - ${finding.grader}: ${finding.detail}`);
      }
    }
  }

  console.log(`\nRegraded ${regraded} stored response(s) against the current ledger and graders.`);
  if (newlyFailing.length === 0) console.log('No new deterministic failures.');

  if (stale && newlyFailing.length > 0) {
    console.log(
      `\n⚠️  ${newlyFailing.length} flip(s) found, but the baseline is STALE ` +
        `(prompt/ledger hash ${baseline.promptHash ?? 'none'} vs ${promptHash()}). ` +
        'Stored responses predate this change, so these are reported, not enforced. ' +
        'Run the full suite and `npm run eval:baseline` to re-anchor.',
    );
  }

  const enforced = stale ? [] : newlyFailing;
  if (enforced.length > 0) {
    console.error(`\n${enforced.length} new deterministic failure(s): ${enforced.join(', ')}`);
  }
  process.exit(!consistency.passed || enforced.length > 0 ? 1 : 0);
}

main();
