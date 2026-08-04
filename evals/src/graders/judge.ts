import type { FactsLedger } from '../facts.ts';
import { complete, DEFAULT_JUDGE_MODEL, type CompleteOptions } from '../groq.ts';
import type { EvalCase, Finding, JudgeScore, JudgeSpec, JudgeVerdict } from '../types.ts';

// Layer 4: the LLM judge. Runs LAST and only for what layers 1-3 cannot decide
// — mostly tone, and whether reasoning is tied to real projects or is generic
// praise that would read identically for any candidate.
//
// Two properties keep it honest:
//   - Temperature 0, structured JSON out, schema-validated like any other model
//     output. A judge that returns prose is a failed judge call, not a score.
//   - For any groundedness score above the floor it must QUOTE the supporting
//     span from the FACTS.md excerpt. Requiring a citation is what stops the
//     judge from rewarding fluency; if it cannot point at the evidence, the
//     score does not stand.

const DIMENSION_GUIDANCE: Record<string, string> = {
  groundedness:
    'Is every claim traceable to the FACTS excerpt? 5 = every claim supported and cited. 3 = mostly supported, one vague claim. 1 = contains an assertion the excerpt does not support.',
  directness:
    'Does it answer the question asked, and commit to a position when one is called for? 5 = answers plainly, including when the answer is unflattering. 3 = answers but hedges. 1 = evades, or retracts a concession in the same paragraph.',
  tone_for_recruiter:
    'Would a recruiter find this credible and easy to act on? 5 = confident, specific, no salesmanship. 3 = slightly promotional. 1 = reads like marketing copy.',
  usefulness:
    'Does it give the recruiter something they could not have guessed? 5 = concrete, specific, decision-useful. 3 = accurate but generic. 1 = could describe any candidate.',
};

export function buildJudgePrompt(
  question: string,
  response: string,
  factsExcerpt: string,
  spec: JudgeSpec,
  hasDerivedNumbers = false,
): string {
  const dimensions = spec.dimensions
    .map((d) => `- ${d}: ${DIMENSION_GUIDANCE[d] ?? 'Score 1-5.'}`)
    .join('\n');

  const shape = spec.dimensions
    .map(
      (d) =>
        `    "${d}": { "score": <integer 1-5>, "justification": "<one sentence>"${
          d === 'groundedness' && spec.require_evidence ? ', "evidence": "<exact quote from the FACTS excerpt>"' : ''
        } }`,
    )
    .join(',\n');

  return `You are grading one response from a recruiter-facing chatbot that answers questions about a software engineering candidate. You are a strict evaluator, not a fan of the candidate.

The ONLY permitted source of truth about the candidate is the FACTS excerpt below. If the response asserts something the excerpt does not support, that is ungrounded no matter how plausible it sounds.

FACTS EXCERPT:
${factsExcerpt}

QUESTION ASKED:
${question}${
    question.includes('[turn 1]')
      ? '\n\nNOTE: this is a multi-turn conversation. Grade the response against the LAST turn only; the earlier turns are context. A short answer to a short follow-up is correct, not evasive.'
      : ''
  }

RESPONSE TO GRADE:
${response}

DIMENSIONS:
${dimensions}
${spec.rubric_note ? `\nCASE-SPECIFIC RUBRIC:\n${spec.rubric_note}\n` : ''}
Return ONLY a single JSON object, no prose and no code fences:
{
${shape}
}

Rules:
- Scores are integers from 1 to 5.
${
    hasDerivedNumbers
      ? '- This question requires ARITHMETIC over the dates in the excerpt (durations, years of experience). A computed figure is grounded even though the number itself does not appear in the excerpt. Its accuracy is verified separately -- do not mark it ungrounded for being absent.\n'
      : ''
  }
- Every justification is one sentence.
${spec.require_evidence ? '- For groundedness above 2 you MUST quote an exact supporting span from the FACTS excerpt in "evidence". If you cannot find one, score groundedness 2 or lower.\n' : ''}- Do not reward length or enthusiasm. A short accurate answer outscores a long agreeable one.
- Output raw JSON only.`;
}

/** Resolves a case's facts_ref list into the excerpt the judge is allowed to use. */
export function buildFactsExcerpt(evalCase: EvalCase, ledger: FactsLedger): string {
  const refs = evalCase.facts_ref ?? [];
  const entries = refs.map((ref) => ledger.byId.get(ref)).filter((e) => e !== undefined);

  if (entries.length === 0) {
    // No refs declared: fall back to every canonical entry so the judge is not
    // grading against an empty document, which would make everything ungrounded.
    return ledger.allowed
      .map((e) => `- [${e.id}] ${e.canonical}${e.description ? ` — ${e.description.trim()}` : ''}`)
      .join('\n');
  }

  const render = (e: (typeof entries)[number]) => {
    const status = e.status === 'canonical' ? '' : ` (STATUS: ${e.status.toUpperCase()})`;
    const detail = e.description ? ` — ${e.description.trim()}` : '';
    return `- [${e.id}]${status} ${e.canonical}${detail}`;
  };

  // The referenced entries first, with their notes, then the REST of the ledger
  // as background.
  //
  // The first full run scored correct answers ungrounded because the excerpt
  // held only the case's facts_ref: fl-001 named Adam's role and dates exactly
  // right, mentioned the C#/.NET migration in passing, and the judge had no way
  // to see that the migration is in the ledger too. A judge that cannot see a
  // true fact has to call it invented.
  const referenced = new Set(entries.map((e) => e.id));
  const background = ledger.allowed.filter((e) => !referenced.has(e.id)).map(render);

  return [
    'DIRECTLY RELEVANT:',
    ...entries.map((e) => `${render(e)}${e.note ? `\n    note: ${e.note.trim()}` : ''}`),
    '',
    'ALSO TRUE (background — do not penalize the response for using these):',
    ...background,
  ].join('\n');
}

function parseVerdict(raw: string, spec: JudgeSpec): { scores: Record<string, JudgeScore> } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Models sometimes wrap JSON in a fence despite instructions.
    const fenced = /\{[\s\S]*\}/.exec(raw);
    if (!fenced) return { error: `judge returned non-JSON: ${raw.slice(0, 160)}` };
    try {
      parsed = JSON.parse(fenced[0]);
    } catch {
      return { error: `judge returned non-JSON: ${raw.slice(0, 160)}` };
    }
  }

  if (typeof parsed !== 'object' || parsed === null) return { error: 'judge output is not an object' };
  const obj = parsed as Record<string, unknown>;
  const scores: Record<string, JudgeScore> = {};

  for (const dimension of spec.dimensions) {
    const raw = obj[dimension];
    if (typeof raw !== 'object' || raw === null) return { error: `judge omitted dimension "${dimension}"` };
    const entry = raw as Record<string, unknown>;
    const score = entry.score;
    if (typeof score !== 'number' || !Number.isInteger(score) || score < 1 || score > 5) {
      return { error: `judge gave dimension "${dimension}" a non-integer or out-of-range score: ${JSON.stringify(score)}` };
    }
    scores[dimension] = {
      score,
      justification: typeof entry.justification === 'string' ? entry.justification.trim() : '',
      evidence: typeof entry.evidence === 'string' ? entry.evidence.trim() : undefined,
    };
  }
  return { scores };
}

export interface JudgeOptions extends CompleteOptions {
  model?: string;
}

export async function runJudge(
  evalCase: EvalCase,
  question: string,
  response: string,
  ledger: FactsLedger,
  options: JudgeOptions,
): Promise<JudgeVerdict> {
  const spec = evalCase.judge;
  if (!spec) return { scores: {}, passed: true, findings: [] };

  const prompt = buildJudgePrompt(
    question,
    response,
    buildFactsExcerpt(evalCase, ledger),
    spec,
    evalCase.graders?.numeric_tolerance !== undefined,
  );

  const completion = await complete(
    {
      model: options.model ?? DEFAULT_JUDGE_MODEL,
      temperature: 0,
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    },
    options,
  );

  const parsed = parseVerdict(completion.text, spec);
  if ('error' in parsed) {
    // A judge that cannot produce a valid verdict fails the case rather than
    // silently passing it — same reject-don't-coerce rule the app uses.
    return {
      scores: {},
      passed: false,
      findings: [{ grader: 'judge', detail: parsed.error, evidence: completion.text.slice(0, 200) }],
    };
  }

  const findings: Finding[] = [];
  for (const [dimension, verdict] of Object.entries(parsed.scores)) {
    const floor = spec.min[dimension];
    if (floor !== undefined && verdict.score < floor) {
      findings.push({
        grader: 'judge',
        detail: `${dimension} scored ${verdict.score}, floor is ${floor} — ${verdict.justification}`,
        evidence: verdict.evidence,
      });
    }
    if (spec.require_evidence && dimension === 'groundedness' && verdict.score > 2 && !verdict.evidence) {
      findings.push({
        grader: 'judge',
        detail: `groundedness scored ${verdict.score} but the judge quoted no supporting span — score does not stand`,
      });
    }
  }

  return { scores: parsed.scores, passed: findings.length === 0, findings };
}
