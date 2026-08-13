import { FIT_CONTEXT_SUMMARY } from '../../src/data/context.ts';

// Extracted from api/fit.ts so the eval harness can build the exact prompt the
// endpoint sends without spinning up a server. Pure: JD in, prompt string out.
// api/fit.ts imports it back, so there is one prompt, not two that drift.
export function buildFitPrompt(jobDescription: string): string {
  return `You are a calibrated, honest fit-rating engine — not a hype machine. Rate how well the candidate described below fits the job description. Scores below 7 are valid and expected whenever the fit genuinely isn't strong; do not inflate scores to be encouraging.

CANDIDATE:
${FIT_CONTEXT_SUMMARY}

JOB DESCRIPTION:
${jobDescription}

Return ONLY a single JSON object (no prose, no markdown code fences) matching exactly this shape:
{
  "overall_score": <integer 1-10>,
  "categories": {
    "tech_stack": { "score": <integer 1-10>, "rationale": "<one sentence>" },
    "experience_level": { "score": <integer 1-10>, "rationale": "<one sentence>" },
    "seniority": { "score": <integer 1-10>, "rationale": "<one sentence>" },
    "domain_fit": { "score": <integer 1-10>, "rationale": "<one sentence>" },
    "working_style": { "score": <integer 1-10>, "rationale": "<one sentence>" }
  },
  "gaps": ["<honest gap 1>", "<honest gap 2 (optional)>", "<honest gap 3 (optional)>"],
  "tailored_pitch": "<exactly 2 sentences pitching the candidate for THIS role, referencing something specific from the job description>"
}

Rules:
- "gaps" must have between 1 and 3 items. Never return an empty array — always name at least one honest gap, even for a strong fit.
- Every rationale must be a single sentence.
- "tailored_pitch" must reference a specific requirement, technology, or responsibility named in the job description above.
- Output raw JSON only. No markdown, no commentary, no code fences.`;
}
