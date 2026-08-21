import { SYSTEM_PROMPT } from '../src/data/context';

// Vercel Edge Function — plain fetch wrapper, no SDK. Holds GROQ_API_KEY server-side
// and streams the Groq response straight through to the client unmodified.
export const config = { runtime: 'edge' };

// llama-3.1-8b-instant was decommissioned by Groq and now returns
// `model_not_found`. gpt-oss-20b is its replacement, and it is a REASONING
// model, which matters twice on a route that pipes the stream through untouched:
//
//   `reasoning_format: 'hidden'` keeps the scratchpad OUT of `content`, so it
//   cannot render verbatim in the chat pane. Verified on the streaming path --
//   deltas carry only `role` and `content`. It belongs here rather than in a
//   client-side stripper, because a partially-streamed `<thin` is not yet
//   recognizable as anything.
//
//   `reasoning_effort: 'medium'` is a latency trade, not correctness: the model cannot
//   start writing until it stops thinking, so every reasoning token is dead air
//   in a streaming UI. At the default one call spent ~1,100 reasoning tokens.
//
// The eval harness sends both values, so it measures what ships.
const MODEL = 'openai/gpt-oss-20b';
const REASONING_FORMAT = 'hidden';
const REASONING_EFFORT = 'medium';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return jsonError('Method not allowed', 405);
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return jsonError('Server is missing GROQ_API_KEY.', 500);
  }

  let messages: ChatMessage[];
  let temperature: number | undefined;
  try {
    const body = await req.json();
    if (!Array.isArray(body?.messages)) throw new Error('Invalid body');
    messages = body.messages;
    // Optional, and omitted from the upstream call when absent so the app keeps
    // Groq's default. The eval harness sends 0 for graded runs — without this,
    // every measurement would be sampled at the default temperature and a
    // prompt diff would be indistinguishable from noise.
    if (typeof body.temperature === 'number' && Number.isFinite(body.temperature)) {
      temperature = Math.min(Math.max(body.temperature, 0), 2);
    }
  } catch {
    return jsonError('Invalid request body', 400);
  }

  let groqResponse: Response;
  try {
    groqResponse = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        reasoning_format: REASONING_FORMAT,
        reasoning_effort: REASONING_EFFORT,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        max_tokens: 4096,
        stream: true,
        ...(temperature !== undefined && { temperature }),
      }),
    });
  } catch {
    return jsonError('Failed to reach Groq.', 502);
  }

  // Groq/OpenAI-style error bodies nest the message as an object
  // ({ error: { message, type, code } }), not a plain string — normalize to
  // the flat { error: string } shape the client expects before it ever gets there.
  // Errors are returned synchronously even for stream:true requests, so it's
  // safe to buffer and inspect the body here.
  if (!groqResponse.ok) {
    const errorBody = await groqResponse.json().catch(() => null);
    const rawError = (errorBody as { error?: unknown } | null)?.error;
    const message =
      typeof rawError === 'string'
        ? rawError
        : rawError && typeof rawError === 'object' && typeof (rawError as { message?: unknown }).message === 'string'
          ? (rawError as { message: string }).message
          : `Groq API error ${groqResponse.status}`;
    return jsonError(message, groqResponse.status);
  }

  return new Response(groqResponse.body, {
    status: groqResponse.status,
    headers: {
      'content-type': groqResponse.headers.get('content-type') ?? 'text/event-stream',
    },
  });
}
