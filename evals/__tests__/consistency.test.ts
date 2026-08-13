// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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

// `src/data/context.ts` is a PURE DATA MODULE: exported constants, no imports,
// no I/O. It ships in the browser bundle, so a `node:` specifier there is a
// build break, and any disk read makes the grounding data depend on a runtime
// that two of its three consumers (browser, Edge function) do not have.
//
// The harness may read FACTS.md from disk as much as it likes — that I/O lives
// in evals/, which nothing in the app imports. The dependency runs one way:
// evals -> app, never app -> evals. These assert that boundary instead of
// trusting it, because the pressure to "just read the ledger here" is exactly
// the kind of convenience that looks fine until the bundle breaks.
describe('app/harness boundary', () => {
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

  const PURE_MODULES = [
    '../../src/data/context.ts',
    '../../api/_lib/buildFitPrompt.ts', // Edge runtime — no fs there either
  ];

  it.each(PURE_MODULES)('%s declares no runtime I/O', (rel) => {
    const source = read(rel);
    const banned: Array<[RegExp, string]> = [
      [/from\s+['"]node:/, 'imports a node: builtin'],
      [/require\s*\(/, 'uses require()'],
      [/\breadFileSync\b|\breadFile\b|\bwriteFileSync\b/, 'performs file I/O'],
      [/\bprocess\.(?:env|cwd|argv)\b/, 'reads process state'],
      [/\bimport\.meta\.(?:url|dirname)\b/, 'resolves paths at runtime'],
      [/\b__dirname\b|\b__filename\b/, 'uses CommonJS path globals'],
    ];
    for (const [pattern, why] of banned) {
      expect(pattern.test(source), `${rel} ${why}`).toBe(false);
    }
  });

  it('context.ts imports nothing at all', () => {
    const source = read('../../src/data/context.ts');
    const imports = source.match(/^\s*import\b.*$/gm) ?? [];
    expect(imports).toEqual([]);
  });

  // The eval runner executes api/_lib/*.ts directly under Node type-stripping,
  // which requires relative specifiers to carry their literal `.ts` extension.
  // Vercel's edge builder transpiles those files to `.js` but leaves specifiers
  // untouched, so a `.ts` specifier survives into the bundle and the DEPLOY
  // (not `vercel build`, which passes) fails with "unsupported modules".
  // `rewriteRelativeImportExtensions` is what reconciles the two runtimes; if it
  // is dropped, nothing else fails until the next deploy. Deep check after any
  // vercel build: scripts/check-edge-bundle.mjs.
  it('api/tsconfig.json keeps rewriteRelativeImportExtensions for edge deploys', () => {
    // Text match, not JSON.parse — tsconfig is JSONC (comments).
    expect(read('../../api/tsconfig.json')).toMatch(/"rewriteRelativeImportExtensions":\s*true/);
  });

  it('context.ts exports only constants', () => {
    const source = read('../../src/data/context.ts');
    const exports = (source.match(/^export\s+\S+\s+\S+/gm) ?? []).map((line) => line.trim());
    expect(exports.every((line) => line.startsWith('export const'))).toBe(true);
    expect(exports.length).toBeGreaterThan(0);
  });

  // One-directional: the harness reaches into the app, never the reverse.
  it('no app module imports the harness', () => {
    const appFiles = [
      '../../src/data/context.ts',
      '../../api/_lib/buildFitPrompt.ts',
      '../../api/_lib/validateFitReport.ts',
    ];
    for (const rel of appFiles) {
      expect(/from\s+['"][^'"]*evals\//.test(read(rel)), `${rel} imports from evals/`).toBe(false);
    }
  });
});
