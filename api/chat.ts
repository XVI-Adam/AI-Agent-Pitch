import { SYSTEM_PROMPT } from '../src/data/context';

// Vercel Edge Function — plain fetch wrapper, no SDK. Holds GROQ_API_KEY server-side
// and streams the Groq response straight through to the client unmodified.
export const config = { runtime: 'edge' };

const MODEL = 'llama-3.1-8b-instant';
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
  try {
    const body = await req.json();
    if (!Array.isArray(body?.messages)) throw new Error('Invalid body');
    messages = body.messages;
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
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        max_tokens: 4096,
        stream: true,
      }),
    });
  } catch {
    return jsonError('Failed to reach Groq.', 502);
  }

  return new Response(groqResponse.body, {
    status: groqResponse.status,
    headers: {
      'content-type': groqResponse.headers.get('content-type') ?? 'text/event-stream',
    },
  });
}
