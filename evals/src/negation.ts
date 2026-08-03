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
    String.raw`\black(?:s|ing|ed)?\b`,
    String.raw`\bmissing\b`,
    String.raw`\babsent\b`,
    String.raw`\b(?:short|shy) of\b`,
    String.raw`\bgap\b`,
    String.raw`\blimited\b`,
    String.raw`\bwouldn't say\b`,
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

/**
 * Clause scope cap. The scope is the clause, not a fixed window -- a response
 * that restates the recruiter's premise in order to reject it puts a lot of
 * text between the negation and the phrase ("I don't have information
 * confirming Adam as an Associate Software Developer at Sigo Signs from June
 * 2025 to January 2026" -- 85 chars). The cap only stops a runaway sentence
 * from laundering an assertion arbitrarily far downstream.
 */
const WINDOW = 260;

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

/**
 * Frames where a phrase is the TOPIC being discussed rather than a claim.
 *
 * Found in the first full run: "I don't have information about his security
 * clearance. If you need to know about his security clearance, reach out to
 * him." — a textbook correct abstention. The first mention is negated; the
 * second sits in a conditional and was scored an assertion, failing the case.
 *
 * Naming a subject in order to decline it, ask about it, or route it elsewhere
 * is not asserting it.
 */
const FRAME_CUES = new RegExp(
  [
    String.raw`\b(?:about|regarding|concerning)\b`,
    String.raw`\b(?:confirm|confirming|verify|verifying)\b`,
    String.raw`\bwhether\b`,
    String.raw`\bif you\b`,
    String.raw`\bquestions?\s+(?:on|about)\b`,
    String.raw`\basking\b`,
    String.raw`\bready for\b`,
    String.raw`\b(?:mention|record|evidence|indication)\s+of\b`,
  ].join('|'),
  'i',
);

/** How tight the frame window is — frames bind much closer than negations. */
const FRAME_WINDOW = 45;

/** True when the mention sits inside a topic//conditional frame. */
export function isTopicReference(text: string, index: number): boolean {
  const before = foldApostrophes(text).slice(Math.max(0, index - FRAME_WINDOW), index);
  const clause = before.split(/[.!?;:\n]/).pop() ?? before;
  return FRAME_CUES.test(clause);
}

/**
 * The union the graders actually want: a mention that does not assert the claim,
 * whether because it is denied or because it is merely the topic.
 */
export function isNonAssertion(text: string, index: number, length = 0): boolean {
  return (
    isNegatedMention(text, index) ||
    isTopicReference(text, index) ||
    hasNegatingPostmodifier(text, index + length)
  );
}

/**
 * Negation that TRAILS the phrase: "his GPA is not specified", "on-call
 * experience isn't listed anywhere".
 *
 * un-005 answered correctly -- "I don't have information on Adam's GPA ... but
 * his GPA is not specified" -- and the second mention scored as an assertion
 * because the clause boundary at "but" cut off the leading negation and nothing
 * looked rightward.
 */
const POSTMODIFIER_CUES =
  /^[^.!?;\n]{0,40}?\b(?:is|are|was|were)?\s*(?:not|n'?t|never)\s+(?:specified|listed|mentioned|documented|recorded|stated|available|included|provided|in (?:the|his|her|their))\b/i;

export function hasNegatingPostmodifier(text: string, endIndex: number): boolean {
  return POSTMODIFIER_CUES.test(foldApostrophes(text).slice(endIndex, endIndex + 80));
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
    occurrences.push({
      index: match.index,
      span: match[0],
      negated: isNonAssertion(text, match.index, match[0].length),
    });
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
