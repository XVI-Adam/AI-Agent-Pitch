// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../../api/fit.ts';

// api/fit.ts had no test at all: every branch between the browser and Groq
// (rate limit, timeout, malformed output) was exercised only in production.
// These run the real handler against a stubbed upstream `fetch`.

const VALID_REPORT = {
  overall_score: 7,
  categories: {
    tech_stack: { score: 8, rationale: 'Good overlap.' },
    experience_level: { score: 7, rationale: 'Close enough.' },
    seniority: { score: 5, rationale: 'A bit junior.' },
    domain_fit: { score: 7, rationale: 'Adjacent domain.' },
    working_style: { score: 8, rationale: 'Fits the pace.' },
  },
  gaps: ['No on-call experience.'],
  tailored_pitch: 'Adam ships end to end. He would ramp quickly on the React work.',
};

const KEY = 'gsk_test_key_do_not_log';
const JD = 'We need a React engineer who has shipped TypeScript.';

function request(body: unknown, method = 'POST'): Request {
  return new Request('http://localhost/api/fit', {
    method,
    headers: { 'content-type': 'application/json' },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
}

function groqOk(content: unknown, finishReason = 'stop'): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content }, finish_reason: finishReason }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

let fetchMock: ReturnType<typeof vi.fn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv('GROQ_API_KEY', KEY);
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('api/fit: request handling', () => {
  it('rejects non-POST with 405', async () => {
    const res = await handler(request(undefined, 'GET'));
    expect(res.status).toBe(405);
  });

  it('returns 500 when the server has no key, without calling Groq', async () => {
    vi.stubEnv('GROQ_API_KEY', '');
    const res = await handler(request({ jobDescription: JD }));
    expect(res.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 400 for a blank JD, without calling Groq', async () => {
    const res = await handler(request({ jobDescription: '   ' }));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('caps the JD at 3000 characters before it reaches the prompt', async () => {
    fetchMock.mockResolvedValue(groqOk(JSON.stringify(VALID_REPORT)));
    await handler(request({ jobDescription: 'a'.repeat(5000) }));
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const prompt: string = sent.messages[0].content;
    expect(prompt).toContain('a'.repeat(3000));
    expect(prompt).not.toContain('a'.repeat(3001));
  });
});

describe('api/fit: success', () => {
  it('returns the validated report', async () => {
    fetchMock.mockResolvedValue(groqOk(JSON.stringify(VALID_REPORT)));
    const res = await handler(request({ jobDescription: JD }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, report: VALID_REPORT });
  });

  it('bounds the upstream call with a timeout signal', async () => {
    fetchMock.mockResolvedValue(groqOk(JSON.stringify(VALID_REPORT)));
    await handler(request({ jobDescription: JD }));
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});

describe('api/fit: failures carry a reason', () => {
  it('reports a Groq 429 as rate_limited with the stated wait', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 429, headers: { 'retry-after': '7' } }));
    const res = await handler(request({ jobDescription: JD }));
    expect(res.status).toBe(200); // documented contract: failure is in the body
    expect(await res.json()).toEqual({ ok: false, reason: 'rate_limited', retryAfterSeconds: 7 });
  });

  it('omits retryAfterSeconds when Groq gives no usable retry-after', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 429 }));
    const body = await (await handler(request({ jobDescription: JD }))).json();
    expect(body).toEqual({ ok: false, reason: 'rate_limited' });
  });

  it('reports other upstream HTTP errors as upstream_error', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 503 }));
    const body = await (await handler(request({ jobDescription: JD }))).json();
    expect(body).toEqual({ ok: false, reason: 'upstream_error' });
  });

  it('reports a stalled upstream as timeout', async () => {
    fetchMock.mockRejectedValue(new DOMException('The operation timed out.', 'TimeoutError'));
    const body = await (await handler(request({ jobDescription: JD }))).json();
    expect(body).toEqual({ ok: false, reason: 'timeout' });
  });

  it('reports a network failure as upstream_error', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const body = await (await handler(request({ jobDescription: JD }))).json();
    expect(body).toEqual({ ok: false, reason: 'upstream_error' });
  });

  it('reports non-JSON model output as invalid_output and logs finish_reason', async () => {
    fetchMock.mockResolvedValue(groqOk('{"overall_score": 7, "categ', 'length'));
    const body = await (await handler(request({ jobDescription: JD }))).json();
    expect(body).toEqual({ ok: false, reason: 'invalid_output' });
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('finish_reason=length'));
  });

  it('reports schema-invalid output as invalid_output', async () => {
    fetchMock.mockResolvedValue(groqOk(JSON.stringify({ ...VALID_REPORT, gaps: [] })));
    const body = await (await handler(request({ jobDescription: JD }))).json();
    expect(body).toEqual({ ok: false, reason: 'invalid_output' });
  });

  it('reports a missing message body as invalid_output', async () => {
    fetchMock.mockResolvedValue(groqOk(null));
    const body = await (await handler(request({ jobDescription: JD }))).json();
    expect(body).toEqual({ ok: false, reason: 'invalid_output' });
  });

  it('never logs the API key or the JD text', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 503 }));
    await handler(request({ jobDescription: JD }));
    const logged = errorSpy.mock.calls.flat().join(' ');
    expect(logged).toContain('[api/fit]');
    expect(logged).not.toContain(KEY);
    expect(logged).not.toContain('React engineer');
  });
});
