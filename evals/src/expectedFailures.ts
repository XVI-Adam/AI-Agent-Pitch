import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// expected_failures.json, loaded and VALIDATED.
//
// The file used to map a case id to one free-text string. That is how known-bad
// becomes permanent: an id with a sentence next to it reads as triaged whether
// or not anyone still knows what it means, and nothing forces the entry to say
// when it was filed or what would retire it. Every field below is required, and
// a malformed entry throws rather than being skipped -- a silently ignored
// entry is a case that stops being guarded without anyone choosing that.

const PATH = fileURLToPath(new URL('../expected_failures.json', import.meta.url));

/** Why the failure is known-bad. Mirrors the taxonomy in the file's own _readme. */
export type FailureClass = 'PROMPT' | 'LEDGER' | 'TEST' | 'DISPUTE';

const CLASSES = new Set<FailureClass>(['PROMPT', 'LEDGER', 'TEST', 'DISPUTE']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface ExpectedFailure {
  class: FailureClass;
  /** Must match the case's own category, so a renumbered or moved case is caught. */
  category: string;
  /** What was actually observed — the failure mode, not a restatement of the case. */
  failure: string;
  /** ISO date the entry was filed, so an entry can be seen to have gone stale. */
  since: string;
  /** What would remove this entry. An entry without one is furniture. */
  fix_by: string;
}

export type ExpectedFailures = Record<string, ExpectedFailure>;

export function loadExpectedFailures(path = PATH): ExpectedFailures {
  if (!existsSync(path)) return {};
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { cases?: Record<string, unknown> };
  const cases = parsed.cases ?? {};
  const out: ExpectedFailures = {};

  for (const [id, raw] of Object.entries(cases)) {
    if (typeof raw === 'string') {
      throw new Error(
        `expected_failures.json: "${id}" is a bare string. Every entry needs ` +
          '{ class, category, failure, since, fix_by } — see the file\'s _readme.',
      );
    }
    if (typeof raw !== 'object' || raw === null) {
      throw new Error(`expected_failures.json: "${id}" is not an object`);
    }
    const entry = raw as Record<string, unknown>;
    const missing = (['class', 'category', 'failure', 'since', 'fix_by'] as const).filter(
      (k) => typeof entry[k] !== 'string' || !(entry[k] as string).trim(),
    );
    if (missing.length > 0) {
      throw new Error(`expected_failures.json: "${id}" is missing or has empty ${missing.join(', ')}`);
    }
    if (!CLASSES.has(entry.class as FailureClass)) {
      throw new Error(
        `expected_failures.json: "${id}" has class "${String(entry.class)}"; ` +
          `expected one of ${[...CLASSES].join(', ')}`,
      );
    }
    if (!ISO_DATE.test(entry.since as string)) {
      throw new Error(`expected_failures.json: "${id}" has since "${String(entry.since)}"; expected YYYY-MM-DD`);
    }
    out[id] = {
      class: entry.class as FailureClass,
      category: (entry.category as string).trim(),
      failure: (entry.failure as string).trim(),
      since: entry.since as string,
      fix_by: (entry.fix_by as string).trim(),
    };
  }
  return out;
}

/** One-line form for a report. */
export function describe(id: string, entry: ExpectedFailure): string {
  return `\`${id}\` · ${entry.category} · **[${entry.class}]** filed ${entry.since} — ${entry.failure}\n    - **fix by:** ${entry.fix_by}`;
}
