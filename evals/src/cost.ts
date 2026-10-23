import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SYSTEM_PROMPT } from '../../src/data/context.ts';
import { buildFitPrompt } from '../../api/_lib/buildFitPrompt.ts';
import { filterCases, loadCases, loadJobDescription } from './cases.ts';
import { loadLedger } from './facts.ts';
import { cacheKey, DEFAULT_JUDGE_MODEL, DEFAULT_MODEL, MODEL_REASONING } from './groq.ts';
import { buildFactsExcerpt, buildJudgePrompt } from './graders/judge.ts';

// `npm run eval:cost` — what would a run actually spend?
//
// A cold judged run sits close enough to the free-tier ceiling that the
// difference between "cached" and "cold" decides whether it can finish at all.
// Finding that out by starting the run and watching it die 40 minutes later is
// the expensive way to learn it.
//
// Three ceilings, and only two of them are advertised. The headers report
// 8,000 tokens/minute and 1,000 requests/day. The one that actually stops a run
// is the per-DAY TOKEN cap, which appears in NO header and surfaces only in the
// body of a 429 — measured the hard way, by exhausting it and losing the last 2
// cases of a 62-case run to it.
//
// TPD is enforced PER MODEL, not as one pool: every 429 body names the model it
// is rejecting. That is what reconciles the 100,000 and 200,000 figures that
// used to conflict between here and FACTS.md — they are different models' caps.
// The judge has been served `Limit 100000` (gpt-oss-120b, kept as a fixture in
// __tests__/graders.test.ts); the model under test has never hit its own, so it
// is budgeted at Groq's published 200,000 and flagged as unconfirmed. Checking
// one total against one ceiling is what made a run look affordable when the
// judge half alone was over budget.
//
// Counts cache HITS against the exact keys the runner will use, so the estimate
// tracks reality rather than a guess about which cases changed.

const CACHE_DIR = fileURLToPath(new URL('../.cache', import.meta.url));

/** Rough token count. Groq bills real tokens; ~4 chars/token is close enough to plan with. */
const estimateTokens = (text: string) => Math.ceil(text.length / 4);

/** Observed judge completion: verdict JSON plus the reasoning billed with it. */
const JUDGE_COMPLETION_TOKENS = 700;

/**
 * Per-model daily token caps. Separate budgets, not one pool.
 *
 * The judge's figure is what Groq actually served this org in a 429 body; the
 * under-test figure is Groq's published free-tier number and has never been
 * hit here, so a run planned against it is planning on an assumption.
 */
const JUDGE_TPD = 100_000;
const MODEL_TPD = 200_000;

function cached(key: string): boolean {
  return existsSync(join(CACHE_DIR, `${key}.json`));
}

function main(): void {
  const filter = process.argv.slice(2).find((a) => a.startsWith('--filter='))?.split('=')[1];
  const ledger = loadLedger();
  const cases = filterCases(loadCases(), filter);

  let mainCold = 0;
  let mainColdTokens = 0;
  let judgeCold = 0;
  let judgeColdTokens = 0;
  let judgeTotal = 0;

  for (const evalCase of cases) {
    // Mirror the runner's request shape exactly, or the keys will not match.
    let responsePlaceholder = '';
    if (evalCase.surface === 'fit') {
      const jd = loadJobDescription(evalCase.jd_file!);
      const prompt = buildFitPrompt(jd);
      const key = cacheKey({
        model: DEFAULT_MODEL,
        ...MODEL_REASONING,
        temperature: 0,
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      });
      if (!cached(key)) {
        mainCold++;
        mainColdTokens += estimateTokens(prompt) + 2000;
      }
      responsePlaceholder = prompt;
    } else {
      const turns = evalCase.turns?.map((t) => t.user) ?? [evalCase.question!];
      const history: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: SYSTEM_PROMPT },
      ];
      for (const turn of turns) {
        history.push({ role: 'user', content: turn });
        const key = cacheKey({ model: DEFAULT_MODEL, ...MODEL_REASONING, temperature: 0, max_tokens: 1024, messages: [...history] });
        if (!cached(key)) {
          mainCold++;
          mainColdTokens += history.reduce((n, m) => n + estimateTokens(m.content), 0) + 1024;
        }
        // Placeholder keeps the loop shape; a real assistant turn is unknown here.
        history.push({ role: 'assistant', content: '' });
      }
      responsePlaceholder = SYSTEM_PROMPT;
    }

    if (!evalCase.judge) continue;
    judgeTotal++;
    // The judge prompt depends on the response, which is unknown before the run.
    // Size it from the excerpt + rubric, which dominate; the response is small
    // by comparison. Cache HITS cannot be counted for the same reason, so treat
    // every judge call as cold unless the whole suite is cached — this is a
    // ceiling, and the number that matters is "can this finish today".
    const prompt = buildJudgePrompt(
      evalCase.question ?? '',
      responsePlaceholder.slice(0, 0),
      buildFactsExcerpt(evalCase, ledger),
      evalCase.judge,
    );
    judgeCold++;
    // Not the judge's max_tokens ceiling (2500) — that is truncation headroom,
    // not spend. What gets BILLED is the verdict plus gpt-oss's reasoning,
    // measured at 470-670 completion tokens across real cases.
    judgeColdTokens += estimateTokens(prompt) + JUDGE_COMPLETION_TOKENS;
  }

  const fmt = (n: number) => n.toLocaleString();
  console.log(`\nCases: ${cases.length}   (${judgeTotal} carry a judge spec)\n`);
  console.log(`Model under test  ${DEFAULT_MODEL}`);
  console.log(`  uncached calls: ${mainCold}`);
  console.log(`  est. tokens:    ${fmt(mainColdTokens)}   vs 8,000 TPM`);
  console.log(`\nJudge             ${DEFAULT_JUDGE_MODEL}`);
  console.log(`  calls (ceiling): ${judgeCold}`);
  console.log(`  calls vs 1,000 requests/day: ${judgeCold}`);
  console.log(`  est. tokens:     ${fmt(judgeColdTokens)}   vs 8,000 TPM`);
  // Wall clock, not quota, is the ceiling a cold judged run actually hits: at
  // 8,000 TPM the judge alone has to be spread across this many minutes.
  const judgeMinutes = Math.ceil(judgeColdTokens / 8_000);
  console.log(`  ≥ ${judgeMinutes} min of judge traffic at the per-minute ceiling`);
  // Per-model budgets, checked separately — a shared total hides which half
  // is over. Name the provenance of each ceiling so the reader knows which
  // number is measured and which is Groq's published figure.
  console.log(`\nDaily token budget (TPD is PER MODEL, not a shared pool)`);
  for (const surface of [
    { label: DEFAULT_MODEL, tokens: mainColdTokens, cap: MODEL_TPD, source: 'published, unconfirmed for this org' },
    { label: DEFAULT_JUDGE_MODEL, tokens: judgeColdTokens, cap: JUDGE_TPD, source: 'measured from a 429' },
  ]) {
    const pct = Math.round((surface.tokens / surface.cap) * 100);
    console.log(`  ${surface.label.padEnd(22)} ${fmt(surface.tokens).padStart(9)} / ${fmt(surface.cap)} TPD  (${pct}%)  — cap ${surface.source}`);
    if (surface.tokens > surface.cap) {
      console.log(`    ⚠️  OVER this model's daily cap — a cold full run CANNOT finish in one day on ${surface.label}.`);
    } else if (surface.tokens > surface.cap / 2) {
      console.log(`    ⚠️  Over half of this model's daily budget. One cold run per day, with no room to repeat.`);
    }
  }
  console.log(`\n  (whole run ${fmt(mainColdTokens + judgeColdTokens)} tokens across both models — informational; neither cap sees this number)`);
  if (mainCold > 1_000 || judgeCold > 1_000) {
    console.log(`  ⚠️  Above the 1,000 requests/day ceiling on one of the models.`);
  }
  console.log('');
}

main();
