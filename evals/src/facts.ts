import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { normalize } from './normalize.ts';
import type { FactEntry, FactStatus } from './types.ts';

// Parses FACTS.md. The prose is commentary; the ```yaml fences ARE the data.
// Everything outside a fence is ignored, which is what lets the file read as a
// document to a human and as a table to the graders without keeping two copies
// in sync.

const YAML_FENCE = /```yaml\n([\s\S]*?)```/g;
const VALID_STATUS = new Set<FactStatus>(['canonical', 'retired', 'never_true', 'unverified']);

export interface FactsLedger {
  entries: FactEntry[];
  byId: Map<string, FactEntry>;
  /** canonical + unverified — everything that may legitimately appear. */
  allowed: FactEntry[];
  /** retired + never_true — everything whose appearance is a failure. */
  forbidden: FactEntry[];
  /** Neither assert nor deny. */
  unverified: FactEntry[];
  /** Every phrase (canonical + aliases) an allowed entry may surface as. */
  allowedPhrases: Set<string>;
  /** Every number that appears anywhere in an allowed entry. */
  allowedNumbers: Set<number>;
}

export function parseFactsMarkdown(markdown: string): FactEntry[] {
  const entries: FactEntry[] = [];
  const seen = new Set<string>();

  for (const [, body] of markdown.matchAll(YAML_FENCE)) {
    let parsed: unknown;
    try {
      parsed = parse(body);
    } catch (err) {
      throw new Error(`FACTS.md: malformed YAML block: ${(err as Error).message}`, { cause: err });
    }
    if (!Array.isArray(parsed)) {
      throw new Error('FACTS.md: every yaml block must be a list of entries');
    }

    for (const raw of parsed as Array<Record<string, unknown>>) {
      const id = raw.id;
      if (typeof id !== 'string' || !id) throw new Error('FACTS.md: entry is missing an id');
      if (seen.has(id)) throw new Error(`FACTS.md: duplicate entry id "${id}"`);
      seen.add(id);

      const status = raw.status as FactStatus;
      if (!VALID_STATUS.has(status)) {
        throw new Error(`FACTS.md: entry "${id}" has invalid status "${String(raw.status)}"`);
      }
      if (typeof raw.canonical !== 'string' || !raw.canonical.trim()) {
        throw new Error(`FACTS.md: entry "${id}" is missing a canonical value`);
      }

      entries.push({
        id,
        type: typeof raw.type === 'string' ? raw.type : 'attribute',
        canonical: raw.canonical.trim(),
        aliases: Array.isArray(raw.aliases) ? (raw.aliases as string[]).filter((a) => typeof a === 'string') : [],
        status,
        numeric: typeof raw.numeric === 'number' ? raw.numeric : undefined,
        duration_months: typeof raw.duration_months === 'number' ? raw.duration_months : undefined,
        tolerance_months: typeof raw.tolerance_months === 'number' ? raw.tolerance_months : undefined,
        formula: typeof raw.formula === 'string' ? raw.formula : undefined,
        note: typeof raw.note === 'string' ? raw.note : undefined,
        description: typeof raw.description === 'string' ? raw.description : undefined,
      });
    }
  }

  if (entries.length === 0) throw new Error('FACTS.md: no yaml blocks found');
  return entries;
}

/**
 * Whether a canonical value is a literal claim or a human description of a
 * class of claims.
 *
 * `never.employer-faang` has canonical "employment at Google / Meta / Amazon /
 * ..." — a label for the rule, not a string anyone would ever emit. Matching it
 * literally would be dead weight; matching its ALIASES ("worked at Google") is
 * what actually catches the failure. The heuristic: a value carrying a `/`
 * separator, an " or ", or more than eight words is descriptive, and only its
 * aliases are matched.
 */
export function isLiteralClaim(value: string): boolean {
  if (/\s\/\s/.test(value)) return false;
  if (/\bor\b/i.test(value)) return false;
  if (value.trim().split(/\s+/).length > 8) return false;
  return true;
}

/** Every phrase an entry may surface as, minus descriptive canonicals. */
export function matchablePhrases(entry: FactEntry): string[] {
  const phrases = isLiteralClaim(entry.canonical)
    ? [entry.canonical, ...entry.aliases]
    : [...entry.aliases];
  return phrases.map((p) => p.trim()).filter(Boolean);
}

const NUMBER_IN_TEXT = /\d[\d,.]*/g;

function collectNumbers(entry: FactEntry, into: Set<number>): void {
  if (entry.numeric !== undefined) into.add(entry.numeric);
  if (entry.duration_months !== undefined) into.add(entry.duration_months);
  const haystack = [entry.canonical, ...entry.aliases, entry.description ?? ''].join(' ');
  for (const [raw] of haystack.matchAll(NUMBER_IN_TEXT)) {
    const value = Number(raw.replace(/[,.]$/, '').replace(/,/g, ''));
    if (Number.isFinite(value)) into.add(value);
  }
}

export function buildLedger(entries: FactEntry[]): FactsLedger {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const allowed = entries.filter((e) => e.status === 'canonical' || e.status === 'unverified');
  const forbidden = entries.filter((e) => e.status === 'retired' || e.status === 'never_true');
  const unverified = entries.filter((e) => e.status === 'unverified');

  const allowedPhrases = new Set<string>();
  const allowedNumbers = new Set<number>();
  for (const entry of entries) {
    if (entry.status !== 'canonical' && entry.status !== 'unverified') continue;
    for (const phrase of [entry.canonical, ...entry.aliases, entry.description ?? '']) {
      const value = normalize(phrase);
      if (value) allowedPhrases.add(value);
    }
    collectNumbers(entry, allowedNumbers);
  }

  return { entries, byId, allowed, forbidden, unverified, allowedPhrases, allowedNumbers };
}

let cached: FactsLedger | undefined;

export function loadLedger(path = new URL('../../FACTS.md', import.meta.url)): FactsLedger {
  if (cached) return cached;
  cached = buildLedger(parseFactsMarkdown(readFileSync(path, 'utf8')));
  return cached;
}

/** Test seam — drop the module-level cache. */
export function resetLedgerCache(): void {
  cached = undefined;
}
