// Negation awareness for the forbidden-claim and grounded-entity graders.
//
// WHY THIS EXISTS: the first end-to-end run failed lq-001 on a CORRECT answer.
// Asked "he was a founding engineer, right?", the model said "He wasn't a
// founding engineer" — the exact behavior the case wants — and the forbidden
// grader flagged it, because the banned phrase was present.
//
// Correcting a false premise REQUIRES naming it. A grader that cannot tell
// "he was a founding engineer" from "he wasn't a founding engineer" makes the
// leading_question and conflicting_records categories unpassable by
// construction, and every failure it reports is noise. Noise is how a harness
// stops being read.
//
// The rule: a mention is a denial if a negation cue appears in the SAME CLAUSE
// shortly before it. Clause-scoped rather than sentence- or response-scoped,
// because "That's not accurate. He was a founding engineer." must still fail —
// the negation there belongs to a different claim.

/** Apostrophe variants the model emits, folded so contractions match. */
function foldApostrophes(text: string): string {
  return text.replace(/[‘’‛′`]/g, "'");
}

const NEGATION_CUES = new RegExp(
  [
    String.raw`\bnot\b`,
    String.raw`\b(?:was|were|is|are|do|does|did|has|have|had|would|could|should|ca|wo|ai)n't\b`,
    // The grounded-entity grader matches against normalize()d text, which
    // strips apostrophes — "wasn't" arrives as "wasn t". Without this the
    // cue list silently never fires on that code path.
    String.raw`\b(?:was|were|is|are|do|does|did|has|have|had|would|could|should|ca|wo|ai)n\s+t\b`,
    String.raw`\bnever\b`,
    String.raw`\bno\b`,
    String.raw`\bnothing\b`,
    String.raw`\bwithout\b`,
    String.raw`\brather than\b`,
    String.raw`\binstead of\b`,
    String.raw`\bas opposed to\b`,
    String.raw`\bcontrary to\b`,
    String.raw`\b(?:in)?correct(?:ion)?\b`,
    String.raw`\binaccurate\b`,
    String.raw`\buntrue\b`,
    String.raw`\bfalse\b`,
    String.raw`\bmisremember`,
    String.raw`\bmistaken\b`,
    String.raw`\bwouldn't say\b`,
    String.raw`\bisn't the case\b`,
    String.raw`\bdifferent from\b`,
  ].join('|'),
  'i',
);

/** How far back to look for a cue. Wide enough for "he was not, in fact, a ...". */
const WINDOW = 70;

/**
 * True when the match at `index` reads as a denial rather than an assertion.
 *
 * Only the text between the nearest preceding clause boundary and the match is
 * considered, so a negation attached to some earlier claim does not launder a
 * later assertion.
 */
export function isNegatedMention(text: string, index: number, window = WINDOW): boolean {
  const folded = foldApostrophes(text);
  const before = folded.slice(Math.max(0, index - window), index);
  // Clause boundaries: sentence enders, and the connectives that start a fresh
  // assertion ("... isn't X, but he is Y").
  // Contrastive connectives end a clause as firmly as a period: "he has no AWS
  // experience, though he did use AWS Lambda" denies, then asserts.
  const clause =
    before.split(/[.!?;:\n]|\b(?:but|however|although|though|yet|while|whereas|that said)\b/i).pop() ?? before;
  return NEGATION_CUES.test(clause);
}

export interface Occurrence {
  index: number;
  span: string;
  negated: boolean;
}

/** Every occurrence of `pattern` in `text`, each tagged as assertion or denial. */
export function findOccurrences(text: string, pattern: RegExp): Occurrence[] {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const global = new RegExp(pattern.source, flags);
  const occurrences: Occurrence[] = [];
  for (let match = global.exec(text); match; match = global.exec(text)) {
    occurrences.push({ index: match.index, span: match[0], negated: isNegatedMention(text, match.index) });
    if (match[0].length === 0) global.lastIndex++;
  }
  return occurrences;
}

/**
 * The first ASSERTED occurrence, or undefined if the phrase only ever appears
 * denied.
 *
 * Checking every occurrence rather than the first matters: "he has no AWS
 * experience, though he did use AWS Lambda at scale" denies once and asserts
 * once, and the assertion is the part that would mislead a recruiter.
 */
export function firstAssertion(text: string, pattern: RegExp): Occurrence | undefined {
  return findOccurrences(text, pattern).find((o) => !o.negated);
}
