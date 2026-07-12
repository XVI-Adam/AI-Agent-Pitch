# Sample output

Representative output from each endpoint, so you can see what the app produces
without standing up Groq yourself.

| File | From | Shows |
|---|---|---|
| [`chat-transcript.md`](chat-transcript.md) | `POST /api/chat` | A grounded streaming answer + timing footer |
| [`fit-report.json`](fit-report.json) | `POST /api/fit` | A validated `FitReport` for a sample JD |

These are **illustrative** — model output is non-deterministic, so exact wording
and scores vary run to run. Regenerate real captures against a running server:

```bash
npm run dev                    # terminal 1 (holds GROQ_API_KEY)
npm run bench -- --save        # terminal 2 — overwrites the two files above
```

See [`../API.md#benchmarking`](../API.md#benchmarking) for the full benchmark
flow and the latency/throughput numbers it reports.
