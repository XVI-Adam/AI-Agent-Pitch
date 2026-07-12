#!/usr/bin/env node
// Benchmark the Ask Adam Edge Functions against a running server.
//
// Measures streaming latency for /api/chat (time-to-first-token, total time,
// tokens/sec) and round-trip latency for /api/fit, averaged over N runs. Makes
// REAL Groq calls, so a server holding GROQ_API_KEY must be running first:
//
//   npm run dev            # terminal 1
//   npm run bench          # terminal 2
//
// Flags:
//   --url <base>   target server (default http://localhost:5173)
//   --runs <n>     runs per endpoint to average (default 3)
//   --save         write representative output to docs/samples/
//
// No dependencies — uses global fetch (Node 18+).

import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SAMPLES_DIR = join(HERE, '..', 'docs', 'samples');

function parseArgs(argv) {
  const args = { url: 'http://localhost:5173', runs: 3, save: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') args.url = argv[++i];
    else if (a === '--runs') args.runs = Math.max(1, Number(argv[++i]) || 1);
    else if (a === '--save') args.save = true;
    else if (a === '--help' || a === '-h') {
      console.log('Usage: node scripts/benchmark.mjs [--url <base>] [--runs <n>] [--save]');
      process.exit(0);
    }
  }
  return args;
}

const CHAT_PROMPT = 'In one sentence, what makes Adam a strong forward-deployed engineer?';
const SAMPLE_JD =
  'Forward-deployed / solutions engineer at an AI-native startup. React + ' +
  'TypeScript, comfortable talking directly to customers, ships fast, works ' +
  'across the stack, and translates messy user needs into working software.';

const ms = (n) => `${n.toFixed(0)} ms`;
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// One streaming chat call. Returns timing + the accumulated text.
async function benchChat(base) {
  const start = performance.now();
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: CHAT_PROMPT }] }),
  });

  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `chat failed: HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let tokens = 0;
  let ttft = null;

  outer: while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') break outer;
      try {
        const token = JSON.parse(data)?.choices?.[0]?.delta?.content;
        if (token) {
          if (ttft === null) ttft = performance.now() - start;
          tokens++;
          text += token;
        }
      } catch {
        // skip malformed SSE line
      }
    }
  }

  const total = performance.now() - start;
  return { ttft: ttft ?? total, total, tokens, tps: tokens / (total / 1000), text };
}

// One fit call. Returns timing + the validated report (or throws).
async function benchFit(base) {
  const start = performance.now();
  const res = await fetch(`${base}/api/fit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jobDescription: SAMPLE_JD }),
  });
  const total = performance.now() - start;
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok || !data.report) {
    throw new Error(data?.error || `fit failed: HTTP ${res.status} (ok=${data?.ok})`);
  }
  return { total, report: data.report };
}

async function series(label, fn, runs) {
  const results = [];
  process.stdout.write(`${label}: `);
  for (let i = 0; i < runs; i++) {
    try {
      results.push(await fn());
      process.stdout.write('●');
    } catch (err) {
      process.stdout.write('✕');
      throw err;
    }
  }
  process.stdout.write('\n');
  return results;
}

async function main() {
  const { url, runs, save } = parseArgs(process.argv.slice(2));
  const base = url.replace(/\/$/, '');

  console.log(`\nAsk Adam — endpoint benchmark`);
  console.log(`target: ${base}   runs: ${runs}\n`);

  let chatRuns, fitRuns;
  try {
    chatRuns = await series('/api/chat', () => benchChat(base), runs);
    fitRuns = await series('/api/fit ', () => benchFit(base), runs);
  } catch (err) {
    console.error(`\n✗ ${err.message}`);
    console.error(
      `\nIs the server running with a GROQ_API_KEY?  npm run dev  (then re-run the bench)\n`
    );
    process.exit(1);
  }

  const ttft = chatRuns.map((r) => r.ttft);
  const chatTotal = chatRuns.map((r) => r.total);
  const tps = chatRuns.map((r) => r.tps);
  const fitTotal = fitRuns.map((r) => r.total);

  console.log(`\n  chat  time-to-first-token   avg ${ms(avg(ttft))}   median ${ms(median(ttft))}`);
  console.log(`  chat  total stream time      avg ${ms(avg(chatTotal))}   median ${ms(median(chatTotal))}`);
  console.log(`  chat  throughput             avg ${avg(tps).toFixed(1)} tok/s`);
  console.log(`  fit   total round-trip       avg ${ms(avg(fitTotal))}   median ${ms(median(fitTotal))}`);
  console.log(`  fit   report validated       ${fitRuns.length}/${runs} ✓\n`);

  if (save) {
    await mkdir(SAMPLES_DIR, { recursive: true });
    const chat = chatRuns[chatRuns.length - 1];
    const fit = fitRuns[fitRuns.length - 1];
    const stamp = new Date().toISOString();

    const transcript =
      `# Sample chat transcript\n\n` +
      `> Captured by \`scripts/benchmark.mjs --save\` on ${stamp}.\n` +
      `> Live model output — re-run to regenerate.\n\n` +
      `**User:** ${CHAT_PROMPT}\n\n` +
      `**Ask Adam:** ${chat.text.trim()}\n\n` +
      `---\n\n` +
      `_TTFT ${ms(chat.ttft)} · ${chat.tokens} tokens · ` +
      `${chat.tps.toFixed(1)} tok/s over ${ms(chat.total)}._\n`;
    await writeFile(join(SAMPLES_DIR, 'chat-transcript.md'), transcript);

    const report = {
      _meta: { captured: stamp, source: 'scripts/benchmark.mjs --save', jobDescription: SAMPLE_JD },
      ...fit.report,
    };
    await writeFile(join(SAMPLES_DIR, 'fit-report.json'), JSON.stringify(report, null, 2) + '\n');

    console.log(`  saved docs/samples/chat-transcript.md and fit-report.json\n`);
  }
}

main();
