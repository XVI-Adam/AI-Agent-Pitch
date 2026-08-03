// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { SYSTEM_PROMPT, FIT_CONTEXT_SUMMARY } from '../../src/data/context.ts';
import { loadLedger } from '../src/facts.ts';
import { gradeFactsConsistency } from '../src/graders/index.ts';

describe('facts-consistency: context.ts is a subset of FACTS.md', () => {
  it('ships no claim the ledger does not know about', () => {
    const result = gradeFactsConsistency(
      [
        { name: 'SYSTEM_PROMPT', text: SYSTEM_PROMPT },
        { name: 'FIT_CONTEXT_SUMMARY', text: FIT_CONTEXT_SUMMARY },
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
