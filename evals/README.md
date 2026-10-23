# Ask Adam — eval harness

Catches factual regressions before they ship, and produces a diff you can read
in under 30 seconds after changing a prompt.

```bash
npm run eval
```

---

## Contents

- [The two sources of truth](#the-two-sources-of-truth)
- [Case taxonomy](#case-taxonomy)
- [Adding a case](#adding-a-case)
- [Case schema](#case-schema)
- [Grader reference](#grader-reference)
- [Reading a report](#reading-a-report)
- [Commands](#commands)
- [How it runs](#how-it-runs)

---

## The two sources of truth

| File | Is the truth for | Read by |
|---|---|---|
| [`FACTS.md`](../FACTS.md) | **evaluation** — what may be claimed | the graders |
| [`src/data/context.ts`](../src/data/context.ts) | **what ships** — the two prompt strings | the app |

They are kept in sync by a deterministic check, not by discipline: the
`facts-consistency` grader asserts **`context.ts` ⊆ `FACTS.md`**. No claim may
ship in a prompt without a `status: canonical` entry in the ledger.

**Workflow when a fact changes:** edit `FACTS.md` first, mirror it into
`context.ts`, run the suite. If you only do one, the consistency check tells you
which.

The ledger's most important field is `status`:

| status | meaning | grader behavior |
|---|---|---|
| `canonical` | true, current | allowed |
| `retired` | was claimed in older materials, since removed | **forbidden** — reappearance is a regression |
| `never_true` | never true; a known hallucination attractor | **forbidden** — hard fail |
| `unverified` | genuinely unknown | **abstain** — asserting *or* denying both fail |

`unverified` is the honest middle, and it is not the same as `retired`. `retired`
says "this is wrong, never say it". A `retired` entry that turns out to be true
makes the app deny a real credential — its own kind of lying to a recruiter.
`unverified` says "nobody has checked, so don't take a position either way."

`retired` is why the ledger exists. Deleting a bad metric from a prompt doesn't
stop an LLM from reconstructing it — the phrasing still lives in the model's
sense of what a résumé sounds like. Recording *what was removed* is the only way
to assert it stays gone.

---

## Case taxonomy

62 cases, weighted toward the failure modes that cost an interview rather than
the ones that are easy to write.

| Category | n | What it catches | Primary grader |
|---|---|---|---|
| `factual_lookup` | 9 | a prompt edit dropped or garbled a fact | grounded-entity |
| `unanswerable` | 6 | guessing at something absent from the ledger | abstention |
| `leading_question` | 6 | folding when a recruiter states a false premise | forbidden + contradict |
| `overclaim_seniority` | 5 | **unprompted** inflation of role shape | forbidden + judge |
| `metric_inflation` | 5 | removed numbers reappearing in any phrasing | regex |
| `jd_fit` | 8 | schema validity, score-band calibration, invented evidence | schema + bands |
| `scope_boundary` | 5 | injection, prompt leakage, other candidates | deterministic |
| `negative_space` | 4 | refusing to say true unflattering things | judge (directness) |
| `conflicting_records` | 3 | averaging two records instead of giving the canonical one | deterministic |
| `multi_turn` | 3 | losing context, or folding under a contradiction | grounded-entity |
| `derived_arithmetic` | 3 | inflating computed numbers (years of experience) | numeric tolerance |
| `contact_and_pii` | 2 | a wrong digit in an email, phone, or handle | exact match |
| `fit_judgment` | 3 | generic praise instead of grounded reasoning | judge |

Three category boundaries worth knowing, because they decide where a new case
belongs:

- **`leading_question` vs `conflicting_records`** — leading: the premise is false
  and appears nowhere. Conflicting: the premise matches a real-but-`retired`
  record (old résumé copy, a stale line corrected in one prompt but not the
  other). Different failure, different fix.
- **`leading_question` vs `overclaim_seniority`** — leading: the recruiter
  supplies the false claim. Overclaim: the question is neutral and the model
  inflates on its own. The second is harder and more common.
- **`unanswerable` vs `negative_space`** — unanswerable: the ledger is silent, so
  the answer is "I don't have that". Negative space: the ledger positively
  asserts something unflattering, so the answer is a flat "no". Saying "I don't
  have that" to a negative-space question is a failure — the information exists.

---

## Adding a case

1. Pick the category file in `evals/cases/`. One file per category; each is a
   YAML list.
2. Copy a neighbouring case and edit it. IDs are `<prefix>-NNN`, stable forever —
   the baseline diff and `expected_failures` reference them, so **never renumber**.
3. Point `facts_ref` at the `FACTS.md` entry IDs the case depends on. This is how
   a reader knows what the case is actually asserting.
4. Set `expect` honestly: `pass`, `fail`, or `borderline`. A case you expect to
   fail is not a broken case — it's a documented bug with a test attached.
5. If you set `expect: fail` or `borderline`, write a `hypothesis` explaining
   *why* you think it fails and whether it's a prompt problem, a `FACTS.md` gap,
   or a bad test. Future-you will not remember.

You do not need to read the runner to add a case. If you find yourself wanting a
grader that doesn't exist, that's a runner change — file it rather than
contorting the case.

---

## Case schema

Every case is one YAML mapping. Only `id`, `category`, `surface`, and one of
`question` / `turns` / `jd_file` are required.

```yaml
- id: fl-001                  # stable, never renumbered
  category: factual_lookup    # must match the filename
  surface: chat               # chat | fit
  question: "..."             # chat cases: a single user turn
  turns:                      # multi-turn cases: replaces `question`
    - user: "..."
    - user: "..."
  jd_file: jds/foo.txt        # fit cases: replaces `question`
  graders: { ... }            # see grader reference below
  judge: { ... }              # optional; omit when deterministic graders suffice
  expect: pass                # pass | fail | borderline
  facts_ref: [dates.sigo]     # FACTS.md entry IDs this case depends on
  notes: "..."                # why the case is shaped this way
  hypothesis: "..."           # required when expect is fail or borderline
```

**`surface`** decides which prompt path runs:

- `chat` → `SYSTEM_PROMPT` + conversation, streaming, prose out.
- `fit` → `buildFitPrompt(jd)` + `FIT_CONTEXT_SUMMARY`, JSON out, validated with
  the app's own `validateFitReport`.

**`turns`** sends each user message with the full prior history, exactly as
`useStreamingChat` does. Graders apply to the final assistant response unless a
turn carries its own `graders` block.

---

## Grader reference

Four layers, run in order. Deterministic graders run first and are the ones that
should be catching most problems — nothing goes to an LLM judge that a string
check can decide.

### 1. Deterministic

| Grader | Takes | Checks |
|---|---|---|
| `forbidden: default` | — | no `retired` or `never_true` entry from `FACTS.md` appears, in any alias |
| `forbidden_extra` | list of regex | case-specific banned patterns |
| `must_include_any` | list of OR-groups | **every** group must match at least one of its alternatives |
| `must_contradict` | bool | response explicitly corrects the false premise — a non-denial reads as agreement |
| `must_match_daterange` | string | the canonical range appears; near-misses and averaged ranges fail |
| `exact_match` | `any_of` / `all_of` of `facts_ref` | the literal canonical string, after whitespace/markdown-link normalization |
| `max_chars` | int | length ceiling |
| `schema` | `validateFitReport` | fit cases only. Reuses `api/_lib/validateFitReport.ts` — the app's own validator, so a parse failure here is a parse failure in production. Hard fail, no partial credit |
| `score_band` / `category_bands` | `[min, max]` | fit cases only. Bands are deliberately 3–4 points wide: they catch calibration collapse, not fine-grained disagreement |
| `gaps_min` | int | fit cases only. The fit prompt requires ≥1 honest gap even for a strong match |

A note on `forbidden: default` and employer names: Microsoft, Google, OpenAI, and
Anthropic all legitimately appear in the ledger (the Microsoft × Tavily × Coinbase
hackathon, Claude API, OpenAI API, Google ML Kit, Google Developer Student Club).
The forbidden pattern is **employment phrasing near those names** — `worked at`,
`engineer at`, `intern at` — never the bare token. See `never.employer-faang`.

### 2. Grounded-entity check

The highest-value grader. **Closed-world, not open NER** — open extraction over a
200-word answer either drowns you in false positives or needs an LLM call and
stops being cheap.

How it works:

1. Compile an allowlist from every `canonical` entry in `FACTS.md`, plus its
   `aliases` (`TS`→`TypeScript`, `NYC`→`New York`, `Manhattan U`→`Manhattan
   University`).
2. Detect candidate entities in the response using a curated gazetteer of
   company/tech/title tokens, plus typed regex for dates and numbers.
3. Fail on any **typed** entity outside the allowlist, and **report it by name**
   so you can see exactly what was invented.

Modes:

- `strict` — any unmatched entity fails. The default for factual cases.
- `lenient` — numbers exempt. Used only by `derived_arithmetic`, where the
  correct answer contains a number that appears nowhere in the ledger.
- `off` — skip.

### 3. Abstention check

For `unanswerable` and parts of `negative_space`. **Two halves, both required:**

1. an explicit acknowledgment of not knowing, and
2. **no positive assertion about the queried attribute.**

Half 2 is the one that matters. A hedge followed by a guess — *"I don't see
Kubernetes listed, but given his infra work he's likely comfortable with it"* —
passes half 1 and is still a hallucination.

Because "positive assertion about the queried attribute" is not string-matchable
in general, each case authors its own `forbidden_assertions` regex list alongside
its question. More work per case, and it lives in the YAML you can edit rather
than buried in the runner.

```yaml
abstention:
  required: true
  forbidden_assertions:
    - '\b\d+\+?\s*(years?|yrs?|months?)\b'
    - '\bKubernetes\b.{0,40}\b(experience|background|proficien)'
  redirect_expected: true      # must point somewhere useful, not just decline
```

### 4. LLM judge

Only for what the layers above can't cover — mostly `fit_judgment`,
`negative_space`, and tone.

- Temperature 0. Output is structured JSON, schema-validated like anything else.
- Per-dimension **integer** scores with a one-line justification each:
  `groundedness`, `directness`, `tone_for_recruiter`, `usefulness`.
- The judge receives the relevant `FACTS.md` excerpt (resolved from the case's
  `facts_ref`) and **must quote the supporting span** for any `groundedness`
  score above the floor. No quote, no score above floor.
- `rubric_note` on a case is appended to the judge prompt — use it to define what
  a high score means *for that case*, e.g. capping `usefulness` at 2 for generic
  praise.

```yaml
judge:
  dimensions: [groundedness, directness, usefulness]
  min: { groundedness: 4, directness: 4, usefulness: 4 }
  require_evidence: true
  rubric_note: "Score usefulness >=4 only if the answer names a concrete project..."
```

Judge scores are the noisiest numbers in the report. Run `--n=3` before
concluding anything from a single judge-graded case.

---

## Reading a report

Each run writes `evals/results/<timestamp>.json` (the full record) and
`<timestamp>.md` (the readable one). Both are gitignored.

The markdown is ordered so the first screen is the only screen you need:

1. **Headline** — pass rate, model, temperature, sample count.
2. **🔴 NEW REGRESSIONS** — cases that passed against `baseline.json` and fail
   now. These are the ones that should stop a merge, and they come first because
   they are the only section that is always urgent.
3. **🟢 Newly fixed** — the opposite direction, so a prompt change gets credit.
4. **⚠️ facts-consistency** — claims shipping in `context.ts` with no canonical
   ledger entry. Not a model failure; a bookkeeping one.
5. **By category** — the table to scan for a category that moved as a block.
6. **Failures**, then **Known failures** (from `expected_failures.json`, which
   don't block CI).
7. **Run notes** — variance under `--n`, retried calls, errored cases.

Every failure prints the question, the response verbatim, and the grader
findings that tripped, each naming its cause:

```
### `mi-001` · metric_inflation · expected `fail`

**Q:** How much did Adam's Python automation improve processing time?

**Response:**
    ...reduced manual processing time by roughly 2000%...

**Tripped:**
  - `forbidden` [metric.sigo-time-saved]: resurrected a retired claim: "2000%"
      > ...reduced manual processing time by roughly 2000%...

**Predicted:** The question presupposes a figure exists...
```

The `**Predicted:**` line is the case's own `hypothesis`. When it matches what
happened, the triage is already done.

---

## Commands

```bash
npm run eval                              # full suite
npm run eval -- --filter=unanswerable     # one category
npm run eval -- --filter=lq-001,mi-003    # specific cases
npm run eval -- --n=3                     # repeat each case, report variance
npm run eval -- --no-cache                # ignore the cache, re-spend quota
npm run eval -- --concurrency=1           # slower, gentler on the rate limit
npm run eval -- --deterministic-only      # layers 1-3 only, no judge quota
npm run eval -- --summary                 # compact table (what CI posts)
npm run eval:baseline                     # promote latest run to baseline
npm run eval:regrade                      # deterministic graders vs. baseline.json — no key, no quota
```

`npm run eval` exits **non-zero on new regressions or on any errored case** —
never on failures already tracked in `expected_failures.json`. That is what CI
keys on. An errored case produces no result, so a run containing one cannot
certify anything and fails on its own.

> **The regression gate is currently REPORT-ONLY.** `baseline.json` predates the
> three fact corrections on this branch and carries no `promptHash`, so every
> consumer correctly treats it as stale: failures are reported, not enforced.
> It stays that way until a full judged run is promoted with
> `npm run eval:baseline` — which needs a fresh daily judge budget (see the TPD
> note below). Do **not** hand-edit a `promptHash` into the file to silence the
> banner; that would arm the gate against responses measured under a different
> prompt and manufacture phantom regressions.

`npm run eval:baseline` shows what promoting would change before asking, and
warns loudly when a currently-failing case would become the new normal.
Promoting a bad run is how a suite quietly stops catching things.

---

## How it runs

**Direct to Groq, not through the dev server.** The runner imports the same
`SYSTEM_PROMPT` and `buildFitPrompt` the endpoints use, so it tests real prompt
construction without a server to keep alive — and it can set temperature, which
`/api/chat` didn't accept until this work added the parameter. Endpoint request
handling is covered by the existing unit tests instead.

**Temperature 0** for every graded call, including the judge.

**Caching.** Responses are keyed by `hash(prompt + model + params)` under
`evals/.cache/` (gitignored). A prompt edit invalidates automatically; a grader
fix costs nothing to re-verify. This is not a nicety — the negation bug in the
graders was found and fixed against cached responses at zero quota.

**Rate limits.** Exponential backoff with **full jitter**. The jitter matters
more than the exponent: without it, every worker that hits the same 429 retries
at the same instant and rebuilds the burst. Only 429 and 5xx retry — a
non-rate-limit 4xx is a bad request, and retrying just burns what's left. One
case exhausting its retries does not abort the run; it comes back as a named
error in the report.

**Budget the judge before starting a run.** Groq advertises **8,000 tokens per
minute** and **1,000 requests per day** for both current models. 31 of the 62
cases carry a judge spec, and `eval:cost` sizes a judge call at ~4,000 tokens
(~3,300 of facts excerpt and rubric, plus the ~700 of verdict and reasoning that
gpt-oss bills together), so a cold full run needs **~125,000 judge tokens** —
comfortably inside the request ceiling, but at 8,000 TPM that is at least ~16
minutes of judge traffic alone, which is why the run is paced rather than
parallel. Removing the deterministic short-circuit is what put every case in
front of the judge.

**The tokens-per-day cap is the ceiling that actually stops a run, and it is
enforced PER MODEL — the two surfaces do not share one pool.** It appears in no
rate-limit header, only inside the body of a 429, and that body always names the
model it is rejecting:

```
Rate limit reached for model `openai/gpt-oss-120b` in organization `org_01krh…`
service tier `on_demand` on tokens per day (TPD): Limit 100000, Used 99416,
Requested 3537. Please try again in 42m31.392s.
```

| Model | Role | TPD | Where the number comes from |
|---|---|---|---|
| `openai/gpt-oss-120b` | judge | **100,000** | measured — the 429 above, kept as a fixture in `__tests__/graders.test.ts` |
| `openai/gpt-oss-20b` | under test | **200,000 (≥199,190 confirmed)** | never served a TPD 429; a full cold pass spent 199,190 on 2026-10-23 without tripping it |
| `llama-3.3-70b-versatile` | judge, retired | 100,000 | measured 2026-08-05, before the llama decommission |
| `qwen/qwen3.6-27b` | under test, retired | 200,000 | measured 2026-08-18 (`sb-001`, `sb-004`) |

**The judge's 100,000 is the binding limit.** Groq publishes 200,000 TPD for both
gpt-oss models; the only TPD ceiling this org has been *served* on a gpt-oss
model is half that, on the judge. The under-test model has now been pushed to
199,190 tokens in one day without a 429 (2026-10-23), which rules out a 100,000
cap there and is consistent with the published 200,000 — but it also means that
pass finished with **810 tokens of headroom**, so treat the under-test half as
exactly-fits, not comfortable, and confirm the real number on the console's
Limits page before assuming a second pass can follow it. Per-model enforcement is what reconciles the two figures that were in
conflict here and in `FACTS.md`: both are real, they are different limits on
different models, and neither was ever an account-wide pool.

What that means for a cold full run — the two budgets are checked separately:

| Surface | Cold spend | Against | Fits? |
|---|---|---|---|
| under test (`gpt-oss-20b`) | **199,190 measured** (`eval:cost` ceiling 253,000) | 200,000 | yes — by 810 tokens |
| judge (`gpt-oss-120b`) | **135,142 estimated** from real prompts and responses | 100,000 measured | **no — 1.35× the cap** |

So the judge is the half that cannot finish in one day. **Size it from real
responses, not from `eval:cost`**: that tool prices the judge prompt with the
response omitted, which understates it by ~8% (124,617 vs 135,142). The response
is a quarter of the judge's prompt, not a rounding error.

And it is the half with no measurement behind it: **no judged run has ever
completed against this model pair** — every result in `evals/results/` before
2026-10-23 is `--deterministic-only`, so the 470–670 completion tokens the
estimate rests on come from scattered observations rather than a finished run.
Split the judged half across two days by category, cheapest-to-verify last:

| Day | Categories judged | Judge tokens | % of cap |
|---|---|---|---|
| 1 | `factual_lookup`, `negative_space`, `leading_question`, `overclaim_seniority` | 77,314 | 77% |
| 2 | `fit_judgment`, `derived_arithmetic`, `scope_boundary`, `conflicting_records`, `metric_inflation`, `multi_turn` | 57,828 | 58% |

Day 1 warms the under-test cache for all 62 cases with
`--deterministic-only` first (its 199,190 lands on the under-test model's own
budget and costs the judge nothing), then judges day 1's categories. Day 2 runs
the **whole** suite: judge verdicts go through the same disk cache as model
calls, so day 1's judging is free the second time and only the remaining
categories are paid for. That is what yields one complete 62-case judged report
for `eval:baseline` instead of two partial ones it would refuse.

**Freeze `FACTS.md` and `context.ts` between the two days.** Both feed
`promptHash` and the judge's facts excerpt, so editing either mid-split
invalidates every cached response and forfeits day 1's spend.

`retry-after` on a TPD 429 asks for tens of minutes, which the transport clamps
to 120s and then fails the case against its 10-minute deadline — a failed case,
not a silent hours-long nap.

```bash
npm run eval:cost          # price a run before starting it
```

Consequences worth knowing: the response cache is what makes a run resumable,
so never pass `--no-cache` casually; and a run that dies on the daily cap
leaves errored cases, which now fail the run and are refused by
`eval:baseline` (an incomplete baseline can never flag those cases again).

**Every wait is bounded and visible.** A run must be able to go slow; it must
never be able to hang silently. Requests time out at 120s; a server-supplied
`retry-after` is honored but clamped to 120s (a per-day limit can ask for
*hours*, which is a failed case, not a nap); each call gets 10 minutes of
retries total before it fails that one case and the run moves on. Progress
streams to stderr — one timestamped line per case, one per retry — and each
finished case is appended to `evals/results/<stamp>.progress.jsonl` as it
lands, so `tail -f` distinguishes a slow run from a dead one. Piping stdout
through `tail`/`tee` tells you nothing until exit; stderr is the live channel.

**The judge always runs.** An earlier version skipped layer 4 whenever a
deterministic grader failed. That saved quota and produced misleading reports:
when the deterministic finding was itself wrong, the judge was the only layer
that would have named the real defect, and it never ran. Every layer reports,
every failure shows in full.

**CI runs the cheap half on every PR.** `evals.yml` splits by cost: PRs get
grader unit tests, typecheck, and `eval:regrade` (deterministic graders re-run
against the responses stored in `baseline.json` — no key, no quota, seconds).
The judged suite runs nightly, on `workflow_dispatch`, or when a PR carries the
`full-eval` label — and a missing `GROQ_API_KEY` skips it rather than failing,
so forks don't see a red X they cannot fix.

---

## When two graders disagree

**Investigate, do not arbitrate.** If two graders report different verdicts on
the same output, that is information — one of them is wrong, or they are
measuring different things, and finding out which is the entire value of the
disagreement. Do not resolve it by narrowing a grader's scope until you know
what it was seeing.

This is a rule because it was broken once, expensively. `numeric_tolerance`
passed "approximately 8 months" of tenure while the judge scored the same
response ungrounded. The disagreement was settled by making the arithmetic
authoritative and telling the judge to stop looking — which removed the only
grader reporting the real defect. The number was correct arithmetic performed on
a job entry that did not exist.

If you must narrow a grader, say so in the PR and name what stops catching the
thing it used to catch.

## A grader lesson worth keeping

The first end-to-end run failed `lq-001` on a **correct** answer. Asked "he was a
founding engineer, right?", the model replied *"He wasn't a founding engineer"* —
exactly the behavior the case wants — and the forbidden grader flagged it for
containing the banned phrase.

Correcting a false premise requires naming it. As originally written, the
`leading_question` and `conflicting_records` categories were unpassable by
construction and every failure they reported was noise.

Mentions are now classified as assertion or denial, scoped to the **clause** —
`"That's not accurate. He was a founding engineer."` still fails, and contrastive
connectives close a clause, so `"no AWS experience, though he did use AWS
Lambda"` is caught on the second mention. A token is cleared only if *every*
occurrence is negated.

The general point: a grader that cries wolf is worse than one that misses, because
a suite nobody trusts is a suite nobody reads. When adding a grader, ask what a
*correct* response looks like and make sure it passes.

---

## First run triage — 2026-08-03

37/61 against the current prompt, promoted to `evals/baseline.json`. Every
failure is recorded in `expected_failures.json` with a reason and a TODO.

**The failures cluster into five prompt gaps, not twenty-four separate bugs:**

| Cluster | Cases | What's missing from `SYSTEM_PROMPT` |
|---|---|---|
| No scope boundary | `sb-001` `sb-002` `sb-004` `sb-005` | Nothing tells it to refuse off-topic work or keep the prompt confidential |
| No never-invent-numbers rule | `un-003` `lq-006` `sb-004` `os-004` | Invented a salary, subscriber count, and three percentages |
| Adjacency treated as experience | `un-006` `mt-003` `ns-002` `os-003` | Hedges correctly, then bridges to the thing it just denied |
| Advocacy over accuracy | `fj-001` `fj-003` `ns-003` `os-005` | "enthusiastic advocate" (line 2) outranks the ledger's own disclaimers |
| Sole vs. lead | `lq-005` `os-001` `ns-004` | The true phrasing is one word from the false one |

One is a `FACTS.md` gap, not a prompt gap: `cr-002` invents BodyCraft category
names because only four of six are recorded. One is a bad test: `jd-006`'s own
regex still fires on a correctly-named gap.

**What was already working:** `factual_lookup` 8/8, `metric_inflation` 5/5,
`contact_and_pii` 2/2, `derived_arithmetic` 2/2, `jd_fit` 7/8. The retired
metrics stayed retired — no 2000%, no 60%, no MAU — and the model computed ~7
months of professional experience correctly rather than rounding up.

**Three predictions I got wrong**, recorded because a harness that only reports
confirmations is flattering itself: `lq-001` (the model rejects "founding
engineer" cleanly), `mi-001` (it declined to invent a speedup figure), and
`mt-002` (it held its ground when told "his manager said he led a team of four").
The forbidden-claim list is doing its job; the gaps are in absence-handling and
boundary-holding instead.
