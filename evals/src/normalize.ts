// Text normalization shared by every deterministic grader.
//
// The model writes "Software Trainer → Internal Tools Developer" with a real
// arrow, "Oct 2025 – Dec 2025" with an en dash, and links as
// [adammartinez.website](https://adammartinez.website). FACTS.md writes ASCII.
// Every comparison goes through here first so those differences never register
// as a factual discrepancy.

/** Unicode punctuation the model emits that FACTS.md writes as ASCII. */
const PUNCT_MAP: Array<[RegExp, string]> = [
  [/[‘’‛′]/g, "'"],
  [/[“”‟″]/g, '"'],
  [/[–—‒―]/g, '-'],
  [/[→⇒➡]/g, '->'],
  [/[×]/g, 'x'],
  [/[…]/g, '...'],
  [/[   ]/g, ' '],
];

/** Strips markdown that wraps otherwise-matching text. */
function stripMarkdown(text: string): string {
  return text
    // [label](url) -> "label url", so both halves stay searchable
    .replace(/\[([^\]]*)\]\(([^)]*)\)/g, '$1 $2')
    .replace(/[*_`~]+/g, '')
    .replace(/^#{1,6}\s+/gm, '');
}

/**
 * Canonical comparison form: markdown stripped, unicode punctuation folded to
 * ASCII, lowercased, whitespace collapsed. Preserves word characters, digits,
 * and the punctuation that carries meaning in a fact (`.`, `@`, `/`, `-`, `%`,
 * `+`, `#`) so emails, URLs, "C#", "100k+", and "2000%" survive intact.
 */
export function normalize(text: string): string {
  let out = stripMarkdown(text);
  for (const [pattern, replacement] of PUNCT_MAP) out = out.replace(pattern, replacement);
  return out
    .toLowerCase()
    // `>` is kept because the arrow fold above produces "->", which is how
    // FACTS.md writes the trainer -> developer title.
    .replace(/[^\w\s.@/\-%+#&:>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalized form with all whitespace removed — for URL and email matching. */
export function normalizeTight(text: string): string {
  return normalize(text).replace(/\s+/g, '');
}

/** Escapes a literal string for embedding in a RegExp. */
export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Whole-phrase containment on normalized text.
 *
 * Uses lookarounds rather than \b because \b breaks on the characters facts
 * actually contain: "c#" and "100k+" end in non-word characters, so \b would
 * never fire after them.
 */
export function containsPhrase(haystack: string, phrase: string): boolean {
  const normalizedPhrase = normalize(phrase);
  if (!normalizedPhrase) return false;
  const pattern = new RegExp(`(?<![\\w])${escapeRegex(normalizedPhrase)}(?![\\w])`);
  return pattern.test(normalize(haystack));
}

/** Returns the matched span from the ORIGINAL text, for reporting. */
export function findSpan(haystack: string, pattern: RegExp): string | undefined {
  const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g';
  const match = new RegExp(pattern.source, flags).exec(haystack);
  return match?.[0];
}

/** A short window of context around a match, so a finding reads in situ. */
export function excerpt(text: string, needle: string, radius = 60): string {
  const index = text.toLowerCase().indexOf(needle.toLowerCase());
  if (index === -1) return needle;
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + needle.length + radius);
  return (start > 0 ? '...' : '') + text.slice(start, end).replace(/\s+/g, ' ') + (end < text.length ? '...' : '');
}
