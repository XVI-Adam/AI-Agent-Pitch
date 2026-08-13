import type { FactsLedger } from '../facts.ts';
import { excerpt, normalize } from '../normalize.ts';
import type { FactEntry, Finding, GraderResult } from '../types.ts';

// Duration ceilings: the grader that catches tenure inflation by ARITHMETIC
// rather than by string match.
//
// WHY THIS EXISTS. A denylist of literal strings ("Associate Software
// Developer", "Jun 2025 - Jan 2026") catches the exact fabrication and nothing
// else. Every paraphrase walks straight past it:
//
//   "roughly half a year at Sigo Signs"
//   "about 8 months of professional experience"
//   "he was there from mid-2025 into early 2026"
//   "a little under a year"
//
// Each says the same false thing. Sigo Signs was Oct-Dec 2025 -- three months.
// So the rule is expressed as a ceiling in FACTS.md (never.sigo-tenure:
// entity "Sigo Signs", max_months 4) and enforced here: find any duration
// asserted near a mention of the entity, convert it to months however it was
// phrased, and fail if it exceeds the ceiling.
//
// This runs automatically for every case using `forbidden: default`. The
// failure it guards is not case-specific.

// Scope is the SENTENCE, not a character window. A 200-char window flagged
// "He has 4 years of Python. Separately, Sigo Signs ran Oct-Dec 2025." -- two
// unrelated clauses that happened to sit near each other. A duration counts as
// describing the entity when it shares a sentence with it, or when the entity
// was the subject of the sentence immediately before (so "Adam was at Sigo
// Signs. He stayed about 8 months." is still caught).
function sentenceSpans(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  let start = 0;
  for (const match of text.matchAll(/[.!?\n]+\s*/g)) {
    const end = (match.index ?? 0) + match[0].length;
    spans.push([start, end]);
    start = end;
  }
  if (start < text.length) spans.push([start, text.length]);
  return spans;
}

function sentenceIndexOf(spans: Array<[number, number]>, offset: number): number {
  return spans.findIndex(([from, to]) => offset >= from && offset < to);
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

/** Spelled-out counts the model uses instead of digits. */
const WORD_NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, half: 0.5,
};

// A duration qualified as career-wide is NOT an employer-tenure claim. It is
// banned outright by never.blended-experience-total, which owns that quantity;
// double-reporting it here misattributes the total to one employer and buries
// the real defect. da-001 failed exactly this way: "8 months of professional
// experience" was reported as a Sigo Signs tenure claim.
const CAREER_QUALIFIER =
  /^\s*(?:of\s+)?(?:total\s+|overall\s+|combined\s+|cumulative\s+)?(?:professional|work|working|industry|engineering|software|career|hands-on)\s+experience\b/i;

function isCareerTotal(text: string, claim: { index: number; span: string }): boolean {
  return CAREER_QUALIFIER.test(text.slice(claim.index + claim.span.length, claim.index + claim.span.length + 60));
}

export interface DurationClaim {
  months: number;
  span: string;
  index: number;
  /** How the figure was expressed — useful in the failure message. */
  kind: 'stated' | 'date-range' | 'idiom';
}

const NUMERIC_DURATION =
  /\b(\d+(?:\.\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:\+|plus)?\s*(month|year)s?\b/gi;

// "half a year", "a year and a half", "the better part of a year"
const IDIOM_DURATION =
  /\b(half a year|a year and a half|the better part of a year|the best part of a year|most of a year|nearly a year|almost a year|over a year|about a year|around a year)\b/gi;

const IDIOM_MONTHS: Record<string, number> = {
  'half a year': 6,
  'a year and a half': 18,
  'the better part of a year': 10,
  'the best part of a year': 10,
  'most of a year': 10,
  'nearly a year': 11,
  'almost a year': 11,
  'over a year': 13,
  'about a year': 12,
  'around a year': 12,
};

const DATE_RANGE =
  /\b([a-z]+)\.?\s+(\d{4})\s*(?:-|–|—|to|through|until|thru)\s*([a-z]+)\.?\s+(\d{4})\b/gi;

/** Every duration the text asserts, however it is phrased. */
export function extractDurations(text: string): DurationClaim[] {
  const claims: DurationClaim[] = [];

  for (const match of text.matchAll(NUMERIC_DURATION)) {
    const rawCount = match[1].toLowerCase();
    const count = WORD_NUMBERS[rawCount] ?? Number(rawCount);
    if (!Number.isFinite(count)) continue;
    const months = match[2].toLowerCase().startsWith('year') ? count * 12 : count;
    claims.push({ months, span: match[0], index: match.index ?? 0, kind: 'stated' });
  }

  for (const match of text.matchAll(IDIOM_DURATION)) {
    const months = IDIOM_MONTHS[match[1].toLowerCase()];
    if (months === undefined) continue;
    claims.push({ months, span: match[0], index: match.index ?? 0, kind: 'idiom' });
  }

  // A date range is a duration claim even when no number is stated — this is
  // what catches "from June 2025 to January 2026" without the words "7 months".
  for (const match of text.matchAll(DATE_RANGE)) {
    const from = MONTHS[match[1].toLowerCase()];
    const to = MONTHS[match[3].toLowerCase()];
    if (!from || !to) continue;
    const months = (Number(match[4]) - Number(match[2])) * 12 + (to - from);
    if (months <= 0) continue;
    claims.push({ months, span: match[0], index: match.index ?? 0, kind: 'date-range' });
  }

  return claims;
}

/** Character offsets where an entity (or any alias) is mentioned. */
function entityMentions(text: string, entity: string, ledger: FactsLedger): number[] {
  const names = new Set<string>([entity.toLowerCase()]);
  for (const fact of ledger.entries) {
    if (fact.canonical.toLowerCase() !== entity.toLowerCase()) continue;
    for (const alias of fact.aliases) names.add(alias.toLowerCase());
  }

  const offsets: number[] = [];
  for (const name of names) {
    const pattern = new RegExp(`(?<![\\w])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w])`, 'gi');
    for (const match of text.matchAll(pattern)) offsets.push(match.index ?? 0);
  }
  return offsets;
}

function checkCeiling(text: string, rule: FactEntry, ledger: FactsLedger): Finding[] {
  const ceiling = rule.max_months!;
  const mentions = entityMentions(text, rule.entity!, ledger);
  if (mentions.length === 0) return [];

  const findings: Finding[] = [];
  const reported = new Set<string>();

  const spans = sentenceSpans(text);
  const mentionSentences = new Set(mentions.map((offset) => sentenceIndexOf(spans, offset)));

  for (const claim of extractDurations(text)) {
    if (claim.months <= ceiling) continue;
    // Owned by never.blended-experience-total, not by this ceiling.
    if (isCareerTotal(text, claim)) continue;
    const sentence = sentenceIndexOf(spans, claim.index);
    // Same sentence, or the entity was named in the one just before it.
    const describesEntity = mentionSentences.has(sentence) || mentionSentences.has(sentence - 1);
    if (!describesEntity) continue;
    if (reported.has(claim.span.toLowerCase())) continue;
    reported.add(claim.span.toLowerCase());

    findings.push({
      grader: 'duration_ceiling',
      factId: rule.id,
      detail:
        `${rule.entity} tenure stated as "${claim.span.trim()}" (${claim.months} months` +
        `${claim.kind === 'date-range' ? ', computed from the range' : ''}) — ` +
        `ceiling is ${ceiling}. The real tenure is 3 months.`,
      evidence: excerpt(text, claim.span.trim()),
    });
  }
  return findings;
}

/**
 * Applies every duration ceiling declared in FACTS.md. Runs for any case with
 * `forbidden: default`, because tenure inflation is not a case-specific risk.
 */
export function gradeDurationCeilings(response: string, ledger: FactsLedger): GraderResult {
  if (ledger.durationCeilings.length === 0) {
    return { grader: 'duration_ceiling', passed: true, findings: [], skipped: true };
  }

  // Checked against normalized text so en dashes and unicode spacing in a
  // range ("Jun 2025 – Jan 2026") do not evade the range pattern.
  const normalized = normalize(response);
  const findings: Finding[] = [];
  for (const rule of ledger.durationCeilings) {
    findings.push(...checkCeiling(response, rule, ledger));
    for (const finding of checkCeiling(normalized, rule, ledger)) {
      if (!findings.some((f) => f.detail === finding.detail)) findings.push(finding);
    }
  }

  return { grader: 'duration_ceiling', passed: findings.length === 0, findings };
}
