# Ask Adam — eval harness

Catches factual regressions before they ship, and produces a diff you can read
in under 30 seconds after changing a prompt.

**Status:** slice 1 of 5. Cases and the fact ledger are in place; graders,
runner, reporting, and CI land in subsequent commits. Sections below marked
_(not yet implemented)_ describe the agreed design, not working code.

---

## Contents

- [The two sources of truth](#the-two-sources-of-truth)
- [Case taxonomy](#case-taxonomy)
- [Adding a case](#adding-a-case)
- [Case schema](#case-schema)
- [Grader reference](#grader-reference)
- [Reading a report](#reading-a-report) _(not yet implemented)_
- [Commands](#commands) _(not yet implemented)_

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

`retired` is why the ledger exists. Deleting a bad metric from a prompt doesn't
stop an LLM from reconstructing it — the phrasing still lives in the model's
sense of what a résumé sounds like. Recording *what was removed* is the only way
to assert it stays gone.

---

## Case taxonomy

60 cases, weighted toward the failure modes that cost an interview rather than
the ones that are easy to write.

| Category | n | What it catches | Primary grader |
|---|---|---|---|
| `factual_lookup` | 8 | a prompt edit dropped or garbled a fact | grounded-entity |
| `unanswerable` | 6 | guessing at something absent from the ledger | abstention |
| `leading_question` | 6 | folding when a recruiter states a false premise | forbidden + contradict |
| `overclaim_seniority` | 5 | **unprompted** inflation of role shape | forbidden + judge |
| `metric_inflation` | 5 | removed numbers reappearing in any phrasing | regex |
| `jd_fit` | 8 | schema validity, score-band calibration, invented evidence | schema + bands |
| `scope_boundary` | 5 | injection, prompt leakage, other candidates | deterministic |
| `negative_space` | 4 | refusing to say true unflattering things | judge (directness) |
| `conflicting_records` | 3 | averaging two records instead of giving the canonical one | deterministic |
| `multi_turn` | 3 | losing context, or folding under a contradiction | grounded-entity |
| `derived_arithmetic` | 2 | inflating computed numbers (years of experience) | numeric tolerance |
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

_(not yet implemented — lands with the reporting slice)_

Each run writes `evals/results/<timestamp>.json` plus a markdown summary showing
overall pass rate, pass rate by category, and a diff against
`evals/baseline.json` with **newly-failing cases listed first and marked as
regressions**. Each failure prints the question, the response, and the specific
grader output that tripped.

---

## Commands

_(not yet implemented — lands with the runner slice)_

```bash
npm run eval                        # full suite
npm run eval -- --filter=unanswerable   # one category
npm run eval -- --filter=lq-001         # one case
npm run eval -- --n=3                   # repeat each case, report variance
npm run eval:baseline                   # promote a run to baseline (confirms first)
```

Responses are cached by `hash(prompt + model + params)` in a gitignored
directory, so re-running graders doesn't re-spend Groq quota. Graded runs are
temperature 0; the report notes any case that was retried.
