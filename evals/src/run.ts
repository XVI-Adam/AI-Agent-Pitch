import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SYSTEM_PROMPT } from '../../src/data/context.ts';
import { buildFitPrompt } from '../../api/_lib/buildFitPrompt.ts';
import { filterCases, loadCases, loadJobDescription } from './cases.ts';
import { loadLedger } from './facts.ts';
import { complete, DEFAULT_JUDGE_MODEL, DEFAULT_MODEL, mapWithConcurrency } from './groq.ts';
import { gradeFactsConsistency, runDeterministicGraders } from './graders/index.ts';
import { runJudge } from './graders/judge.ts';
import { renderMarkdown, type CaseOutcome, type RunReport } from './report.ts';
import type { EvalCase, GraderResult } from './types.ts';

// The runner. Builds prompts from the SAME modules the endpoints use, calls
// Groq directly at temperature 0, grades, and writes a report.

const RESULTS_DIR = fileURLToPath(new URL('../results', import.meta.url));
const BASELINE_PATH = fileURLToPath(new URL('../baseline.json', import.meta.url));
const EXPECTED_FAILURES_PATH = fileURLToPath(new URL('../expected_failures.json', import.meta.url));

interface Args {
  filter?: string;
  n: number;
  concurrency: number;
  noCache: boolean;
  model: string;
  judgeModel: string;
  json: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { n: 1, concurrency: 1, noCache: false, model: DEFAULT_MODEL, judgeModel: DEFAULT_JUDGE_MODEL, json: false };
  for (const arg of argv) {
    const [flag, value] = arg.includes('=') ? arg.split(/=(.*)/s) : [arg, undefined];
    switch (flag) {
      case '--filter': args.filter = value; break;
      case '--n': args.n = Math.max(1, Number(value) || 1); break;
      case '--concurrency': args.concurrency = Math.max(1, Number(value) || 1); break;
      case '--no-cache': args.noCache = true; break;
      case '--model': if (value) args.model = value; break;
      case '--judge-model': if (value) args.judgeModel = value; break;
      case '--json': args.json = true; break;
      case '--help':
        console.log(`Usage: npm run eval -- [options]

  --filter=<category|id>   run one slice (comma-separated, e.g. unanswerable,lq-001)
  --n=<count>              repeat each case N times and report variance
  --concurrency=<count>    parallel requests (default 1; Groq free tier is 6000 TPM)
  --no-cache               ignore the response cache and re-spend quota
  --model=<id>             override the model under test (default ${DEFAULT_MODEL})
  --judge-model=<id>       override the judge (default ${DEFAULT_JUDGE_MODEL})
  --json                   print the JSON report to stdout instead of markdown`);
        process.exit(0);
    }
  }
  return args;
}

/** Reads GROQ_API_KEY from the environment or a .env, including the parent repo's. */
function resolveApiKey(): string {
  if (process.env.GROQ_API_KEY) return process.env.GROQ_API_KEY;
  const candidates = [
    fileURLToPath(new URL('../../.env', import.meta.url)),
    // This harness is often run inside a git worktree at
    // <repo>/.claude/worktrees/<name>, where the key lives in the main repo.
    fileURLToPath(new URL('../../../../../.env', import.meta.url)),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const match = /^GROQ_API_KEY\s*=\s*(.+)$/m.exec(readFileSync(path, 'utf8'));
    if (match) return match[1].trim().replace(/^["']|["']$/g, '');
  }
  throw new Error('No GROQ_API_KEY found. Set it in the environment or in a .env at the repo root.');
}

/** The question text a case presents, for reporting and for the judge. */
function questionOf(evalCase: EvalCase): string {
  if (evalCase.question) return evalCase.question;
  if (evalCase.turns) return evalCase.turns.map((t, i) => `[turn ${i + 1}] ${t.user}`).join('\n');
  return `[JD] ${evalCase.jd_file}`;
}

async function runOnce(
  evalCase: EvalCase,
  args: Args,
  apiKey: string,
  sample: number,
): Promise<CaseOutcome> {
  const ledger = loadLedger();
  const cacheSalt = sample > 0 ? `sample-${sample}` : undefined;
  const options = { apiKey, noCache: args.noCache, cacheSalt };

  let responseText: string;
  let jobDescription: string | undefined;
  let latencyMs = 0;
  let tokens = 0;
  let retries = 0;
  let cached = false;

  if (evalCase.surface === 'fit') {
    jobDescription = loadJobDescription(evalCase.jd_file!);
    const result = await complete(
      {
        model: args.model,
        temperature: 0,
        max_tokens: 600,
        messages: [{ role: 'user', content: buildFitPrompt(jobDescription) }],
        response_format: { type: 'json_object' },
      },
      options,
    );
    ({ text: responseText, latencyMs, retries, cached } = result);
    tokens = result.promptTokens + result.completionTokens;
  } else {
    // Multi-turn sends the accumulated history exactly as useStreamingChat does.
    const history: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: SYSTEM_PROMPT },
    ];
    const userTurns = evalCase.turns?.map((t) => t.user) ?? [evalCase.question!];
    responseText = '';
    for (const turn of userTurns) {
      history.push({ role: 'user', content: turn });
      const result = await complete(
        { model: args.model, temperature: 0, max_tokens: 1024, messages: [...history] },
        options,
      );
      history.push({ role: 'assistant', content: result.text });
      responseText = result.text;
      latencyMs += result.latencyMs;
      tokens += result.promptTokens + result.completionTokens;
      retries += result.retries;
      cached = cached || result.cached;
    }
  }

  const deterministic = runDeterministicGraders(evalCase, responseText, ledger, { jobDescription });

  // The judge only runs when the cheap layers are clean. Grading the tone of a
  // response that already invented an employer is wasted quota.
  let judge = undefined;
  if (evalCase.judge && deterministic.passed) {
    judge = await runJudge(evalCase, questionOf(evalCase), responseText, ledger, {
      ...options,
      model: args.judgeModel,
    });
  }

  const passed = deterministic.passed && (judge?.passed ?? true);
  return {
    id: evalCase.id,
    category: evalCase.category,
    surface: evalCase.surface,
    question: questionOf(evalCase),
    expect: evalCase.expect,
    hypothesis: evalCase.hypothesis,
    response: responseText,
    passed,
    graders: deterministic.results.filter((r: GraderResult) => !r.skipped),
    judge,
    latencyMs,
    tokens,
    retries,
    cached,
    sample,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = resolveApiKey();
  const ledger = loadLedger();
  const all = loadCases();
  const selected = filterCases(all, args.filter);

  if (selected.length === 0) {
    console.error(`No cases matched --filter=${args.filter}`);
    process.exit(1);
  }

  // Runs first and needs no quota: if the shipping prompts assert something the
  // ledger doesn't know, every downstream grounded check is measured against a
  // ledger that is already out of date.
  const consistency = gradeFactsConsistency(
    [{ name: 'SYSTEM_PROMPT', text: SYSTEM_PROMPT }, { name: 'FIT_CONTEXT_SUMMARY', text: buildFitPrompt('') }],
    ledger,
  );

  const jobs = selected.flatMap((c) => Array.from({ length: args.n }, (_, sample) => ({ evalCase: c, sample })));
  process.stderr.write(`Running ${selected.length} case(s)${args.n > 1 ? ` x${args.n}` : ''} at concurrency ${args.concurrency}...\n`);

  let done = 0;
  const settled = await mapWithConcurrency(jobs, args.concurrency, async (job) => {
    const outcome = await runOnce(job.evalCase, args, apiKey, job.sample);
    done++;
    process.stderr.write(`\r  ${done}/${jobs.length}  ${outcome.passed ? 'PASS' : 'FAIL'} ${outcome.id}          `);
    return outcome;
  });
  process.stderr.write('\n');

  const outcomes: CaseOutcome[] = [];
  const errors: Array<{ id: string; message: string }> = [];
  for (const [index, result] of settled.entries()) {
    if (result.ok) outcomes.push(result.value);
    else errors.push({ id: jobs[index].evalCase.id, message: result.error.message });
  }

  const expectedFailures: Record<string, string> = existsSync(EXPECTED_FAILURES_PATH)
    ? JSON.parse(readFileSync(EXPECTED_FAILURES_PATH, 'utf8')).cases ?? {}
    : {};
  const baseline: RunReport | undefined = existsSync(BASELINE_PATH)
    ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
    : undefined;

  const report: RunReport = {
    timestamp: new Date().toISOString(),
    model: args.model,
    judgeModel: args.judgeModel,
    temperature: 0,
    samples: args.n,
    filter: args.filter,
    consistency,
    outcomes,
    errors,
    expectedFailures,
  };

  mkdirSync(RESULTS_DIR, { recursive: true });
  const stamp = report.timestamp.replace(/[:.]/g, '-');
  writeFileSync(join(RESULTS_DIR, `${stamp}.json`), JSON.stringify(report, null, 2));

  const markdown = renderMarkdown(report, baseline);
  writeFileSync(join(RESULTS_DIR, `${stamp}.md`), markdown);
  console.log(args.json ? JSON.stringify(report, null, 2) : markdown);
  process.stderr.write(`\nWrote evals/results/${stamp}.json and .md\n`);

  // Exit non-zero only on NEW regressions, so pre-existing known failures
  // tracked in expected_failures.json don't block every PR.
  const regressions = newRegressions(report, baseline);
  process.exit(regressions.length > 0 ? 1 : 0);
}

export function newRegressions(report: RunReport, baseline: RunReport | undefined): string[] {
  const baselinePassing = new Set(
    (baseline?.outcomes ?? []).filter((o) => o.passed).map((o) => o.id),
  );
  const nowFailing = new Set(report.outcomes.filter((o) => !o.passed).map((o) => o.id));
  return [...nowFailing].filter((id) => baselinePassing.has(id) && !(id in report.expectedFailures));
}

main().catch((err) => {
  console.error(`\n${(err as Error).message}\n`);
  process.exit(2);
});
