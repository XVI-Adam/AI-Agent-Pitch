import { GAZETTEER, type GazetteerEntry } from '../gazetteer.ts';
import type { FactsLedger } from '../facts.ts';
import { excerpt, normalize } from '../normalize.ts';
import { isNegatedMention } from '../negation.ts';
import type { Finding, GraderResult, GroundedMode } from '../types.ts';

// Layer 2: the grounded-entity check. The highest-value grader in the harness.
//
// CLOSED-WORLD, NOT OPEN NER. The naive reading of "extract every named entity
// and assert it appears in FACTS.md" cannot be built deterministically: open
// extraction over prose flags common nouns, and constraining it needs a model,
// which costs the speed and determinism that make this layer worth running
// first. So: detect only tokens from a curated vocabulary (gazetteer.ts) plus
// typed date and number patterns, and check those against an allowlist compiled
// from the ledger. It can miss; it cannot cry wolf.
//
// Every failure names the invented entity, because "this response is
// ungrounded" is not actionable and "invented technology: Kubernetes" is.

/** Numbers too common to be worth grounding — counts, small ordinals, ratings. */
const TRIVIAL_NUMBER_CEILING = 10;

const NUMBER_PATTERN = /\b(\d[\d,]*(?:\.\d+)?)\s*(%|percent|k\b|\+)?/gi;
const YEAR_PATTERN = /\b(19|20)\d{2}\b/g;

export interface GroundedOptions {
  mode: GroundedMode;
  /** Extra phrases the case itself makes legitimate (e.g. the JD's own text). */
  extraAllowed?: string[];
}

/**
 * Detects gazetteer tokens present in the response, longest match wins.
 *
 * `negated` is per-occurrence, and a token is only cleared if EVERY occurrence
 * is a denial — "he has no AWS experience, though he did use AWS Lambda" denies
 * once and asserts once, and the assertion is the misleading half.
 */
export function detectEntities(
  response: string,
): Array<{ entry: GazetteerEntry; span: string; negated: boolean }> {
  const haystack = normalize(response);
  const found: Array<{ entry: GazetteerEntry; span: string; negated: boolean }> = [];
  const claimed: Array<[number, number]> = [];

  for (const entry of GAZETTEER) {
    // Lookarounds rather than \b: tokens like "c#", ".net", and "node.js" end
    // or start with non-word characters, where \b never fires.
    const pattern = new RegExp(`(?<![\\w])${entry.token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w])`, 'g');
    const occurrences: Array<{ span: string; negated: boolean }> = [];
    for (let match = pattern.exec(haystack); match; match = pattern.exec(haystack)) {
      const start = match.index;
      const end = start + match[0].length;
      // Skip if a longer token already covered this span ("react" inside
      // "react native").
      if (claimed.some(([s, e]) => start >= s && end <= e)) continue;
      claimed.push([start, end]);
      occurrences.push({ span: match[0], negated: isNegatedMention(haystack, start) });
    }
    if (occurrences.length === 0) continue;
    const asserted = occurrences.find((o) => !o.negated);
    found.push({ entry, span: (asserted ?? occurrences[0]).span, negated: asserted === undefined });
  }
  return found;
}

function isAllowedPhrase(token: string, ledger: FactsLedger, extra: Set<string>): boolean {
  // `extra` holds whole documents (a JD's full text), not single phrases, so
  // this has to be containment rather than equality — otherwise a rationale
  // that correctly quotes the JD's own requirement reads as an invention.
  const pattern = new RegExp(`(?<![\\w])${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w])`);
  for (const phrase of extra) {
    if (phrase === token || pattern.test(phrase)) return true;
  }
  for (const phrase of ledger.allowedPhrases) {
    if (phrase === token || pattern.test(phrase)) return true;
  }
  return false;
}

export function gradeGrounded(
  response: string,
  ledger: FactsLedger,
  options: GroundedOptions,
): GraderResult {
  if (options.mode === 'off') {
    return { grader: 'grounded_entities', passed: true, findings: [], skipped: true };
  }

  const findings: Finding[] = [];
  const extra = new Set((options.extraAllowed ?? []).map(normalize).filter(Boolean));
  const reported = new Set<string>();

  for (const { entry, span, negated } of detectEntities(response)) {
    if (reported.has(entry.token)) continue;
    if (isAllowedPhrase(entry.token, ledger, extra)) continue;
    // "He has no Kubernetes experience" names an ungrounded technology in order
    // to rule it out — that is the correct answer to an unanswerable case, not
    // an invention. Only asserted mentions count.
    if (negated) continue;
    reported.add(entry.token);
    findings.push({
      grader: 'grounded_entities',
      detail: `invented ${entry.kind}: "${entry.token}" — no canonical FACTS.md entry`,
      evidence: excerpt(response, span),
    });
  }

  // Numbers are grounded separately: `lenient` exempts them, which is what
  // derived_arithmetic cases need — their correct answer contains a computed
  // figure that appears nowhere in the ledger by design.
  if (options.mode === 'strict') {
    findings.push(...gradeNumbers(response, ledger, extra));
  }

  return { grader: 'grounded_entities', passed: findings.length === 0, findings };
}

function gradeNumbers(response: string, ledger: FactsLedger, extra: Set<string>): Finding[] {
  const findings: Finding[] = [];
  const reported = new Set<number>();
  const years = new Set<number>();
  for (const [match] of response.matchAll(YEAR_PATTERN)) years.add(Number(match));

  for (const match of response.matchAll(NUMBER_PATTERN)) {
    const raw = match[1];
    const suffix = (match[2] ?? '').toLowerCase();
    let value = Number(raw.replace(/,/g, ''));
    if (!Number.isFinite(value)) continue;
    if (suffix === 'k') value *= 1000;

    // Bare small integers are counting words, not claims.
    if (!suffix && value <= TRIVIAL_NUMBER_CEILING) continue;
    // Years are grounded through date entries, not the numeric allowlist.
    if (!suffix && years.has(value) && value >= 1900) continue;
    if (reported.has(value)) continue;

    const isAllowed =
      ledger.allowedNumbers.has(value) ||
      ledger.allowedNumbers.has(Number(raw.replace(/,/g, ''))) ||
      [...extra].some((phrase) => phrase.includes(raw.toLowerCase()));

    if (!isAllowed) {
      reported.add(value);
      findings.push({
        grader: 'grounded_entities',
        detail: `invented number: "${match[0].trim()}" — no canonical FACTS.md entry carries this figure`,
        evidence: excerpt(response, match[0].trim()),
      });
    }
  }
  return findings;
}

/**
 * facts-consistency: asserts `context.ts` ⊆ `FACTS.md`.
 *
 * Runs the SAME extractor over the shipping prompt strings. Any typed entity in
 * a prompt that has no canonical ledger entry means a claim is shipping that
 * evaluation does not know about — which is how SYSTEM_PROMPT and
 * FIT_CONTEXT_SUMMARY drifted apart on BodyCraft's MAU and category count in
 * the first place.
 */
export function gradeFactsConsistency(
  prompts: Array<{ name: string; text: string }>,
  ledger: FactsLedger,
): GraderResult {
  const findings: Finding[] = [];
  for (const { name, text } of prompts) {
    const result = gradeGrounded(text, ledger, { mode: 'strict' });
    for (const finding of result.findings) {
      findings.push({
        ...finding,
        grader: 'facts_consistency',
        detail: `${name}: ${finding.detail.replace('invented', 'ships unledgered')}`,
      });
    }
  }
  return { grader: 'facts_consistency', passed: findings.length === 0, findings };
}
