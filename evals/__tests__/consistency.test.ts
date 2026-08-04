// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { SYSTEM_PROMPT } from '../../src/data/context.ts';
import { buildFitPrompt } from '../../api/_lib/buildFitPrompt.ts';
import { loadLedger, matchablePhrases } from '../src/facts.ts';
import { containsPhrase, normalize } from '../src/normalize.ts';
import { gradeFactsConsistency } from '../src/graders/index.ts';

describe('facts-consistency: context.ts is a subset of FACTS.md', () => {
  it('ships no claim the ledger does not know about', () => {
    const result = gradeFactsConsistency(
      [
        { name: 'SYSTEM_PROMPT', text: SYSTEM_PROMPT },
        { name: 'FIT_CONTEXT_SUMMARY', text: buildFitPrompt('') },
      ],
      loadLedger(),
    );
    if (!result.passed) {
      console.log('\n--- facts-consistency findings ---');
      for (const f of result.findings) console.log('  •', f.detail);
      console.log('---\n');
    }
    expect(result.findings.map((f) => f.detail)).toEqual([]);
  });
});

// The ban list must never become the delivery mechanism for the strings it
// bans. FACTS.md is grader-only BY CONVENTION -- this makes it an assertion.
//
// If a never_true phrase ever reaches the built prompt, the chat model can read
// it, and a banned claim becomes one the model was handed.
describe('prompt leak', () => {
  const prompts = [
    { name: 'SYSTEM_PROMPT', text: SYSTEM_PROMPT },
    { name: 'buildFitPrompt', text: buildFitPrompt('SAMPLE JOB DESCRIPTION') },
  ];

  it('ships no never_true string in any built prompt', () => {
    const ledger = loadLedger();
    const leaks: string[] = [];

    for (const { name, text } of prompts) {
      for (const entry of ledger.entries.filter((e) => e.status === 'never_true')) {
        for (const phrase of matchablePhrases(entry)) {
          if (containsPhrase(text, phrase)) leaks.push(`${name} contains [${entry.id}] "${phrase}"`);
        }
        for (const source of entry.patterns ?? []) {
          if (new RegExp(source, 'i').test(text)) leaks.push(`${name} matches [${entry.id}] /${source}/`);
        }
      }
    }

    expect(leaks).toEqual([]);
  });

  it('ships no retired string either', () => {
    const ledger = loadLedger();
    const leaks: string[] = [];
    for (const { name, text } of prompts) {
      for (const entry of ledger.entries.filter((e) => e.status === 'retired')) {
        for (const phrase of matchablePhrases(entry)) {
          if (containsPhrase(text, phrase)) leaks.push(`${name} contains [${entry.id}] "${phrase}"`);
        }
      }
    }
    expect(leaks).toEqual([]);
  });

  // A phrase cannot be both allowed and banned; whichever grader runs first wins
  // and the other is silently dead. "early 2026" was exactly this — an alias of
  // both a real date range and a fabricated one.
  it('has no phrase that is both canonical and forbidden', () => {
    const ledger = loadLedger();
    const banned = new Set<string>();
    for (const entry of ledger.forbidden) {
      for (const phrase of matchablePhrases(entry)) banned.add(normalize(phrase));
    }
    const conflicts = [...ledger.allowedPhrases].filter((p) => banned.has(p));
    expect(conflicts).toEqual([]);
  });
});
