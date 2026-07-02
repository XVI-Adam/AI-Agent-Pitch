import { FIT_CONTEXT_SUMMARY } from '../src/data/context';
import { validateFitReport } from './_lib/validateFitReport';

// Vercel Edge Function — plain fetch wrapper, no SDK. Non-streaming: a single
// JSON response is simpler to parse and validate than an SSE stream here.
export const config = { runtime: 'edge' };

const MODEL = 'llama-3.1-8b-instant';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MAX_JD_LENGTH = 3000;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function buildPrompt(jobDescription: string): string {
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

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, 405);
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return json({ ok: false, error: 'Server is missing GROQ_API_KEY.' }, 500);
  }

  let jobDescription: string;
  try {
    const body = await req.json();
    if (typeof body?.jobDescription !== 'string' || !body.jobDescription.trim()) {
      return json({ ok: false, error: 'Paste a job description to get your fit score.' }, 400);
    }
    jobDescription = body.jobDescription.trim().slice(0, MAX_JD_LENGTH);
  } catch {
    return json({ ok: false, error: 'Invalid request body' }, 400);
  }

  try {
    const groqResponse = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: buildPrompt(jobDescription) }],
        max_tokens: 600,
        temperature: 0.3,
        stream: false,
        response_format: { type: 'json_object' },
      }),
    });

    if (!groqResponse.ok) {
      return json({ ok: false }, 200);
    }

    const data = await groqResponse.json();
    const raw = data?.choices?.[0]?.message?.content;
    if (typeof raw !== 'string') return json({ ok: false }, 200);

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return json({ ok: false }, 200);
    }

    const report = validateFitReport(parsed);
    if (!report) return json({ ok: false }, 200);

    return json({ ok: true, report }, 200);
  } catch {
    return json({ ok: false }, 200);
  }
}
