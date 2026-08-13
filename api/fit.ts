import { buildFitPrompt } from './_lib/buildFitPrompt';
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
        messages: [{ role: 'user', content: buildFitPrompt(jobDescription) }],
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
