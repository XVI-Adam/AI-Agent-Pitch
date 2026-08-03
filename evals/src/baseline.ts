import { createInterface } from 'node:readline/promises';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RunReport } from './report.ts';

// `npm run eval:baseline` — promote the most recent run to evals/baseline.json.
//
// Confirms first, and shows what the promotion would change, because promoting
// a bad run is how a harness quietly stops catching things: every current
// failure becomes "expected" and the next real regression looks like the
// status quo.

const RESULTS_DIR = fileURLToPath(new URL('../results', import.meta.url));
const BASELINE_PATH = fileURLToPath(new URL('../baseline.json', import.meta.url));

function latestRun(): { path: string; report: RunReport } {
  const files = readdirSync(RESULTS_DIR).filter((f) => f.endsWith('.json')).sort();
  if (files.length === 0) throw new Error('No runs in evals/results/. Run `npm run eval` first.');
  const path = join(RESULTS_DIR, files[files.length - 1]);
  return { path, report: JSON.parse(readFileSync(path, 'utf8')) as RunReport };
}

function passingIds(report: RunReport | undefined): Set<string> {
  const byId = new Map<string, boolean>();
  for (const outcome of report?.outcomes ?? []) {
    byId.set(outcome.id, (byId.get(outcome.id) ?? true) && outcome.passed);
  }
  return new Set([...byId].filter(([, passed]) => passed).map(([id]) => id));
}

async function main(): Promise<void> {
  const { path, report } = latestRun();

  let current: RunReport | undefined;
  try {
    current = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as RunReport;
  } catch {
    current = undefined;
  }

  const before = passingIds(current);
  const after = passingIds(report);
  const newlyPassing = [...after].filter((id) => !before.has(id) && current !== undefined);
  const newlyFailing = [...before].filter((id) => !after.has(id));

  console.log(`\nPromoting: ${path.split('/').pop()}`);
  console.log(`  ${after.size} passing of ${new Set(report.outcomes.map((o) => o.id)).size} cases`);
  if (current) {
    console.log(`  ${newlyPassing.length} newly passing: ${newlyPassing.join(', ') || '(none)'}`);
    // The dangerous direction — this is what silently lowers the bar.
    console.log(`  ${newlyFailing.length} newly failing: ${newlyFailing.join(', ') || '(none)'}`);
    if (newlyFailing.length > 0) {
      console.log(`\n  ⚠️  Promoting will make those ${newlyFailing.length} failure(s) the new normal.`);
      console.log('     A future regression in them will not be flagged.');
    }
  } else {
    console.log('  (no existing baseline — this becomes the first)');
  }

  if (process.argv.includes('--yes')) {
    writeFileSync(BASELINE_PATH, JSON.stringify(report, null, 2));
    console.log('\nPromoted (--yes).\n');
    return;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('\nPromote this run to baseline? [y/N] ');
  rl.close();

  if (answer.trim().toLowerCase() !== 'y') {
    console.log('Cancelled.\n');
    return;
  }
  writeFileSync(BASELINE_PATH, JSON.stringify(report, null, 2));
  console.log('Promoted to evals/baseline.json.\n');
}

main().catch((err) => {
  console.error(`\n${(err as Error).message}\n`);
  process.exit(1);
});
