import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SYSTEM_PROMPT } from '../../src/data/context.ts';
import { buildFitPrompt } from '../../api/_lib/buildFitPrompt.ts';

// Identity of the thing under test.
//
// A baseline is only comparable to a run that used the SAME prompt and the same
// ledger. Three fact corrections previously invalidated a 61-case baseline
// silently, and the only thing standing between that and a wall of phantom
// regressions was a checklist item in a PR description. This makes it
// structural.

/** Hash of everything that decides what the model sees. */
export function promptHash(): string {
  const factsPath = fileURLToPath(new URL('../../FACTS.md', import.meta.url));
  return createHash('sha256')
    .update(SYSTEM_PROMPT)
    // A JD is interpolated at call time; hash the builder's own shape only.
    .update(buildFitPrompt('__JD__'))
    .update(readFileSync(factsPath, 'utf8'))
    .digest('hex')
    .slice(0, 16);
}

/**
 * Per-case cache key input.
 *
 * Keying on `context.ts` wholesale meant any edit anywhere invalidated all 61
 * cases — six hours of wall clock against a 6,000 TPM ceiling to re-earn
 * responses that had not changed. Keying on the BUILT PROMPT STRING means a
 * correction only invalidates the cases whose prompt actually differs.
 */
export function builtPromptFor(surface: 'chat' | 'fit', jobDescription = ''): string {
  return surface === 'fit' ? buildFitPrompt(jobDescription) : SYSTEM_PROMPT;
}
