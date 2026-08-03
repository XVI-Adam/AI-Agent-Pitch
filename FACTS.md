# FACTS.md — the fact ledger

Every factual claim Ask Adam is allowed to make about Adam Martinez lives here.

This file is **the source of truth for evaluation**. `src/data/context.ts` is the
source of truth for what *ships* — it holds the two prompt strings (`SYSTEM_PROMPT`
for chat, `FIT_CONTEXT_SUMMARY` for the JD Fit Rater). The relationship between
them is enforced, not assumed:

- The eval graders read **this file** to decide whether a model response invented
  something.
- A deterministic test (`facts-consistency`) asserts **`context.ts` ⊆ `FACTS.md`** —
  no claim may ship in a prompt that isn't in the ledger.

So: correct a fact here first, then mirror it into `context.ts`. If you only change
one, the consistency test tells you.

---

## How to read this file

Prose is commentary. The ```yaml fenced blocks **are the data** — the parser
concatenates every yaml block in this file and ignores everything else. Edit the
yaml; the prose is for humans.

Every entry has the same shape:

```
- id:        stable slug, referenced from eval cases (never renumber)
  type:      company | title | date_range | metric | technology | project
             | education | contact | attribute | disclaimer
  canonical: the one correct value
  aliases:   other spellings a response may legitimately use
  status:    canonical | retired | never_true
```

**`status` is the important field:**

| status | meaning | grader behavior |
|---|---|---|
| `canonical` | true, current, safe to assert | allowed |
| `retired` | was once claimed in materials, since removed as unverifiable or wrong | **forbidden** — reappearance is a regression |
| `never_true` | never true; a known hallucination attractor | **forbidden** — hard fail |

`retired` is what makes this file worth keeping. Deleting a bad metric from a
prompt doesn't stop an LLM from reconstructing it — the phrasing still lives in
the model's sense of what a résumé sounds like. Recording *what was removed* is
the only way to assert it stays gone.

---

## Open questions

Three things I inferred rather than knew. Correct any line and the graders follow.

1. **BodyCraft platforms.** You restated it as "live as a PWA" and didn't mention
   iOS, so I dropped the iOS claim (`platform.bodycraft-ios`, now `retired`). If
   it *is* on the App Store, flip that entry back to `canonical`.
2. **BodyCraft category names.** 6 categories with resistance-band empty. I know
   four names (calisthenics, yoga, powerlifting, resistance band) from the old
   copy; the other two are recorded as unknown, so the grader won't accept an
   invented sixth name.
3. **AnG community size.** You gave 60 tournaments / 10,645 attendees, which
   replaces "40+ weekly tournaments". You didn't address the separate "2,500+
   member community" figure, so I left it `canonical`. If it's unverifiable like
   the others were, say so and it becomes `retired`.

---

## Identity & contact

```yaml
- id: person.name
  type: attribute
  canonical: "Adam Martinez"
  aliases: ["Adam"]
  status: canonical

- id: contact.email
  type: contact
  canonical: "adammartinez.martinez2@gmail.com"
  aliases: []
  status: canonical

- id: contact.phone
  type: contact
  canonical: "(347)-375-1047"
  aliases: ["347-375-1047", "(347) 375-1047", "3473751047"]
  status: canonical

- id: contact.portfolio
  type: contact
  canonical: "adammartinez.website"
  aliases: ["https://adammartinez.website", "www.adammartinez.website"]
  status: canonical

- id: contact.github
  type: contact
  canonical: "github.com/XVI-Adam"
  aliases: ["XVI-Adam", "@XVI-Adam"]
  status: canonical

- id: location.primary
  type: attribute
  canonical: "New York City"
  aliases: ["NYC", "New York", "New York, NY", "NY"]
  status: canonical
```

## Education

```yaml
- id: education.degree
  type: education
  canonical: "B.S. Computer Information Systems, CS Minor"
  aliases:
    - "B.S. in Computer Information Systems"
    - "BS Computer Information Systems"
    - "Computer Information Systems"
    - "CIS"
  status: canonical

- id: education.school
  type: company
  canonical: "Manhattan University"
  aliases: ["Manhattan U"]
  status: canonical

- id: education.grad_date
  type: date_range
  canonical: "May 2025"
  aliases: ["2025"]
  status: canonical

- id: education.school-college
  type: company
  canonical: "Manhattan College"
  aliases: []
  status: retired
  note: >
    Corrected in 133b733. The institution renamed; "Manhattan College" is the
    stale name and must not appear.

- id: education.graduate-degree
  type: education
  canonical: "Master's / M.S. / MBA / PhD"
  aliases: ["Masters", "M.S.", "MS in Computer Science", "PhD", "doctorate"]
  status: never_true
  note: Adam holds a bachelor's only.
```

---

## Employment

### BodyCraft / StackedLabs

```yaml
- id: company.stackedlabs
  type: company
  canonical: "StackedLabs"
  aliases: ["Stacked Labs", "BodyCraft / StackedLabs"]
  status: canonical

- id: title.bodycraft
  type: title
  canonical: "Full Stack Engineer"
  aliases: ["Full-Stack Engineer", "Fullstack Engineer"]
  status: canonical

- id: dates.bodycraft
  type: date_range
  canonical: "Jan 2026 - Apr 2026"
  aliases: ["January 2026 - April 2026", "Jan 2026 – Apr 2026", "early 2026"]
  duration_months: 4
  status: canonical

- id: project.bodycraft
  type: project
  canonical: "BodyCraft"
  aliases: ["Body Craft"]
  status: canonical
  description: >
    Freemium fitness mobile app, built entirely solo with Flutter/Dart and
    Firebase. Gamified skill tree and battle/challenge system (The Nightmare Set,
    DBZ Warmup, 6 Pack Attack). Real-time Firestore sync. Deployment via Firebase
    Hosting; Firestore seeding via Node.js + Firebase Admin SDK.

- id: metric.bodycraft-workouts
  type: metric
  canonical: "117 workouts across 6 categories"
  aliases: ["117 workouts", "117 workout programs", "117+ workouts", "6 categories"]
  numeric: 117
  status: canonical

- id: metric.bodycraft-categories-populated
  type: metric
  canonical: "5 of 6 categories populated (resistance band is currently empty)"
  numeric: 5
  status: canonical
  note: >
    6 categories exist; the resistance-band category has no content yet. A
    response may say 6 categories or 5 populated — both are true. Claiming all
    six are filled is not.

- id: metric.bodycraft-exercises
  type: metric
  canonical: "114-exercise library"
  aliases: ["114 exercises", "114 exercise library"]
  numeric: 114
  status: canonical

- id: technology.bodycraft-categories-known
  type: attribute
  canonical: "calisthenics, yoga, powerlifting, resistance band"
  aliases: ["calisthenics", "yoga", "powerlifting", "resistance band", "resistance bands"]
  status: canonical
  note: >
    Four of the six category names are known. The remaining two are NOT recorded,
    so any other named category is an invention and must fail.

- id: platform.bodycraft-pwa
  type: attribute
  canonical: "live as a PWA at bodycraft-57154.web.app"
  aliases: ["PWA", "progressive web app", "bodycraft-57154.web.app"]
  status: canonical

- id: platform.bodycraft-ios
  type: attribute
  canonical: "live on iOS"
  aliases: ["App Store", "on iOS", "iOS app"]
  status: retired
  note: >
    See open question 1. Restated by Adam as PWA-only; the iOS claim is withdrawn
    pending confirmation. Flip to canonical if it is in fact shipped on iOS.

- id: metric.bodycraft-ttfw
  type: metric
  canonical: "time-to-first-workout under 3 minutes"
  aliases: ["under 3 minutes", "sub-3-minute"]
  numeric: 3
  status: canonical

- id: research.bodycraft-pose
  type: attribute
  canonical: "currently researching rep-counting via pose estimation"
  aliases: ["pose estimation", "rep counting", "rep-counting"]
  status: canonical
  note: >
    Research direction, not shipped. Must be described as exploratory. Google
    ML Kit is the named candidate library; MediaPipe was removed from the skills
    list (see technology.mediapipe).

- id: metric.bodycraft-mau
  type: metric
  canonical: "25+ MAU within 4 months of launch"
  aliases: ["25 MAU", "25+ monthly active users", "monthly active users", "MAU"]
  numeric: 25
  status: retired
  note: >
    Unverifiable. 133b733 removed it from FIT_CONTEXT_SUMMARY but MISSED it in
    SYSTEM_PROMPT (context.ts:38), where it shipped until this ledger was created.
    This is the exact drift FACTS.md exists to catch.

- id: metric.bodycraft-concurrent
  type: metric
  canonical: "real-time Firestore sync for 50+ concurrent users"
  aliases: ["50+ concurrent users", "50 concurrent"]
  numeric: 50
  status: retired
  note: Removed in 133b733 as unverifiable. Plain "real-time Firestore sync" is fine.

- id: metric.bodycraft-paying
  type: metric
  canonical: "paying users"
  aliases: ["paid users", "paying customers", "revenue", "subscribers"]
  status: never_true
  note: >
    The app is freemium. No paying-user claim has ever been substantiated. Live
    users / real users is the accurate framing.
```

### Sigo Signs

```yaml
- id: company.sigo-signs
  type: company
  canonical: "Sigo Signs"
  aliases: ["Sigo", "SigoSigns"]
  status: canonical

- id: title.sigo
  type: title
  canonical: "Software Trainer -> Internal Tools Developer"
  aliases:
    - "Software Trainer"
    - "Internal Tools Developer"
    - "software trainer"
    - "internal-tools developer"
    - "trainer turned developer"
    - "trainer-turned-developer"
  status: canonical

- id: dates.sigo
  type: date_range
  canonical: "Oct 2025 - Dec 2025"
  aliases: ["October 2025 - December 2025", "Oct 2025 – Dec 2025", "late 2025", "Q4 2025"]
  duration_months: 3
  status: canonical

- id: title.sigo-associate
  type: title
  canonical: "Associate Software Developer"
  aliases: ["Associate Developer", "Associate Software Engineer"]
  status: retired
  note: >
    THE canonical-record conflict. Older materials (résumé, LinkedIn) carried this
    title with a Jun 2025 - Jan 2026 range. Corrected in 133b733. When a recruiter
    asserts the stale version, the app must give the canonical one — not average
    the two, not hedge between them.

- id: dates.sigo-stale
  type: date_range
  canonical: "Jun 2025 - Jan 2026"
  aliases: ["June 2025 - January 2026", "mid-2025", "summer 2025"]
  status: retired
  note: Paired with title.sigo-associate. Same conflict.

- id: attribute.sigo-role
  type: attribute
  canonical: "sole developer shipping features during the C#/.NET -> TypeScript platform migration"
  aliases: ["sole developer", "only developer"]
  status: canonical
  note: >
    SOLE, not LEAD. He was the only person shipping features on it; he did not
    lead, own, drive, architect, or manage the migration, and did not manage
    anyone. See disclaimer.no-management.

- id: project.sigo-order-tool
  type: project
  canonical: "rebuilt legacy C#/.NET internal order-management tool on Next.js"
  aliases: ["order management system", "order-management workflow", "order system"]
  status: canonical
  description: >
    Replaced a UI that froze during processing with a responsive dashboard showing
    loading states. Used daily by ops.

- id: metric.sigo-orders
  type: metric
  canonical: "6,000+ active orders"
  aliases: ["6000+ orders", "6,000 orders", "6k orders"]
  numeric: 6000
  status: canonical

- id: project.sigo-automation
  type: project
  canonical: "Python automation for large-scale file operations"
  aliases: ["Python automation", "automation pipeline", "file automation"]
  status: canonical
  description: >
    100k+ files using generators, throttled moves/deletes, permission-error
    handling (WinError 5), retries/backoff, dry-run vs. apply modes, CSV audit
    trails. Plus quick-turn ops scripts (service restarts, file ACL fixes,
    printer/registry setup).

- id: metric.sigo-files
  type: metric
  canonical: "100k+ file operations"
  aliases: ["100,000+ files", "100k files", "100k+ files"]
  numeric: 100000
  status: canonical

- id: project.sigo-api
  type: project
  canonical: "self-documented .NET Core API (Controllers, Services, DI; Swagger)"
  aliases: [".NET Core API", "internal API"]
  status: canonical

- id: project.sigo-warehouse-tools
  type: project
  canonical: "ASIN Dimensions, Bed Sizes, Report Damages"
  aliases: ["ASIN Dimensions", "Bed Sizes", "Report Damages"]
  status: canonical
  description: Internal warehouse tooling — data normalization, incident logging/routing.

- id: metric.sigo-time-saved
  type: metric
  canonical: "reduced manual processing time by 2000%"
  aliases: ["2000%", "2,000%", "20x faster", "cut processing time by 2000%"]
  numeric: 2000
  status: retired
  note: >
    Removed in 133b733 as unverifiable AND arithmetically incoherent (you cannot
    reduce anything by more than 100%). No time-saving figure of any size is
    substantiated. The correct answer to "how much faster?" is that the volume is
    documented (100k+ files) but the speedup is not quantified.

- id: metric.sigo-tickets
  type: metric
  canonical: "eliminated 60% of support tickets across 3 teams"
  aliases: ["60% of support tickets", "60% fewer tickets", "3 teams"]
  numeric: 60
  status: retired
  note: Removed in 133b733 as unverifiable.
```

### AnG Esports

```yaml
- id: company.ang-esports
  type: company
  canonical: "AnG Esports"
  aliases: ["AnG", "A&G Esports"]
  status: canonical

- id: title.ang
  type: title
  canonical: "Tournament Organizer"
  aliases: ["TO", "tournament organiser"]
  status: canonical

- id: metric.ang-tournaments
  type: metric
  canonical: "60 tournaments"
  aliases: ["60 online tournaments", "60 events"]
  numeric: 60
  status: canonical

- id: metric.ang-attendees
  type: metric
  canonical: "10,645 attendees"
  aliases: ["10645 attendees", "10,645 entrants", "over 10,000 attendees", "10k+ attendees"]
  numeric: 10645
  status: canonical

- id: metric.ang-community
  type: metric
  canonical: "2,500+ member competitive community"
  aliases: ["2500+ members", "2,500 members"]
  numeric: 2500
  status: canonical
  note: See open question 3 — not addressed in the latest correction pass.

- id: project.ang-series
  type: project
  canonical: "Straight Outta Smashville"
  aliases: ["Straight Outta Smashville series"]
  status: canonical
  description: >
    Weekly Smash Bros series, plus Rocket League and Pokemon Showdown events.
    Power-ranking seasons with prize pools, streamed and casted live on Twitch.

- id: metric.ang-weekly-40
  type: metric
  canonical: "40+ weekly online Smash Bros tournaments"
  aliases: ["40+ tournaments", "40 weekly tournaments"]
  numeric: 40
  status: retired
  note: Superseded by metric.ang-tournaments (60) and metric.ang-attendees (10,645).
```

### GDSC

```yaml
- id: title.gdsc
  type: title
  canonical: "GDSC Lead Tech Developer"
  aliases: ["Google Developer Student Club lead", "GDSC lead", "Lead Tech Developer"]
  status: canonical
  description: >
    Led technical development for the Google Developer Student Club chapter at
    Manhattan University; ran a hands-on RAG workshop.
```

---

## Projects

```yaml
- id: project.shopatlas
  type: project
  canonical: "ShopAtlas"
  aliases: ["Shop Atlas"]
  status: canonical
  description: >
    Agentic shopping assistant built at the Microsoft x Tavily x Coinbase
    hackathon in NYC. Claude API, Tavily web search, x402/USDC micropayments.
    Live demo.

- id: project.ask-adam
  type: project
  canonical: "Ask Adam"
  aliases: ["this app"]
  status: canonical
  description: >
    Recruiter-facing AI chat — React 19, TypeScript, Groq API, Vite, Vitest. SSE
    token streaming, unit-tested single-responsibility hook architecture.

- id: project.jewelry-assistant
  type: project
  canonical: "AI Jewelry Shopping Assistant"
  aliases: ["jewelry shopping assistant", "jewellery assistant"]
  status: canonical
  description: >
    LLM-integrated retail shopping experience for a real client. Python, Gemini,
    Taipy, Firestore.

- id: project.research-tutor
  type: project
  canonical: "Multi-Agent Research Tutor"
  aliases: ["research tutor", "multi-agent tutor"]
  status: canonical
  description: CrewAI/LangChain multi-agent architecture, Fractal Tech hackathon, team of 3.

- id: project.consistency-copilot
  type: project
  canonical: "Consistency Copilot"
  aliases: []
  status: canonical
  description: Next.js/TypeScript accountability app with Telegram-based reminders.

- id: project.portfolio
  type: project
  canonical: "adammartinez.website"
  aliases: ["personal portfolio", "portfolio site"]
  status: canonical
  description: >
    Personal portfolio. Previously described as React Three Fiber solar-system
    navigation — that description is stale and retired (see project.portfolio-r3f).
    Refer to it as the portfolio site; do not describe its implementation.

- id: project.portfolio-r3f
  type: project
  canonical: "React Three Fiber solar system navigation"
  aliases: ["solar system navigation", "React Three Fiber portfolio", "R3F solar system"]
  status: retired
  note: Stale description of an older portfolio build. Removed at Adam's request.

- id: project.stack-tower
  type: project
  canonical: "Stack Tower Clone"
  aliases: ["Stack Tower", "verticalsushi.zo.space"]
  status: retired
  note: >
    No longer a standalone project — folded into the updated portfolio at
    adammartinez.website. Must not be listed as its own project.

- id: project.memecoin
  type: project
  canonical: "Memecoin Trend Detection Agent"
  aliases: ["memecoin agent", "pump.fun", "Axiom", "Twelve Labs"]
  status: retired
  note: Removed in 133b733.
```

---

## Skills

```yaml
- id: technology.languages
  type: technology
  canonical: "Python, TypeScript, JavaScript, Dart/Flutter, Java, C#, C++, SQL"
  aliases: ["Python", "TypeScript", "TS", "JavaScript", "JS", "Dart", "Flutter",
            "Java", "C#", "C Sharp", ".NET", "C++", "SQL"]
  status: canonical

- id: technology.frameworks
  type: technology
  canonical: "React, Next.js, Node.js, .NET Core, Flutter, LangChain, CrewAI, LangFlow, Pandas"
  aliases: ["React", "React 19", "Next.js", "NextJS", "Node.js", "Node", ".NET Core",
            "LangChain", "CrewAI", "LangFlow", "Pandas"]
  status: canonical

- id: technology.ai
  type: technology
  canonical: "OpenAI API, Claude API, Groq API, LangChain, CrewAI, LangFlow, Tavily, Google ML Kit"
  aliases: ["OpenAI", "Claude", "Anthropic", "Groq", "Tavily", "Google ML Kit", "ML Kit", "Gemini"]
  status: canonical

- id: technology.infra
  type: technology
  canonical: "Firebase, Firestore, PostgreSQL, MySQL, Supabase, Vercel, REST APIs"
  aliases: ["Firebase", "Firestore", "PostgreSQL", "Postgres", "MySQL", "Supabase",
            "Vercel", "REST", "REST API"]
  status: canonical

- id: technology.tools
  type: technology
  canonical: "Git/GitHub, Cursor, Vite, Vitest, Tailwind, HTML/CSS"
  aliases: ["Git", "GitHub", "Cursor", "Vite", "Vitest", "Tailwind", "Tailwind CSS",
            "HTML", "CSS"]
  status: canonical

- id: technology.mediapipe
  type: technology
  canonical: "MediaPipe"
  aliases: ["Media Pipe"]
  status: retired
  note: >
    Removed from the skills list at Adam's request. Google ML Kit remains the
    named pose-estimation candidate for the BodyCraft research direction.

- id: disclaimer.dotnet-depth
  type: disclaimer
  canonical: >
    Strongest in TypeScript/React/Next.js and Python. Has shipped production code
    with .NET Core; that and Prisma are working familiarity, not deep expertise.
  aliases: ["working familiarity", "not deep expertise"]
  status: canonical
  note: >
    This disclaimer is itself a fact. Presenting .NET or Prisma as a strength is a
    factual error, not just tone.
```

---

## Working style & context

```yaml
- id: attribute.targeting
  type: attribute
  canonical: >
    Targeting forward-deployed / solutions engineer and early-career full-stack
    product engineer roles at AI-native startups.
  aliases: ["forward-deployed", "forward deployed", "solutions engineer",
            "product engineer", "full-stack product engineer"]
  status: canonical

- id: attribute.working-style
  type: attribute
  canonical: >
    Ships fast (idea to live users in weeks). Design-first — mocks UI before
    writing React. Single-responsibility hooks. Comfortable with ambiguity;
    thrives at early-stage startups without established process.
  aliases: ["ships fast", "design-first", "single-responsibility", "ambiguity"]
  status: canonical

- id: attribute.stackedlabs-studio
  type: attribute
  canonical: "Runs StackedLabs, his independent studio"
  aliases: ["independent studio", "StackedLabs"]
  status: canonical

- id: attribute.brother-music
  type: attribute
  canonical: "Manages his brother's music career (growth strategy, web dev, brand work)"
  aliases: ["brother's music career"]
  status: canonical

- id: attribute.nyc-scene
  type: attribute
  canonical: "Active in the NYC startup scene: OpenClaw, ClawCon, v0 x Contra 'Design Your Dreams' hackathon"
  aliases: ["OpenClaw", "ClawCon", "v0 x Contra", "Design Your Dreams"]
  status: canonical

- id: attribute.smash
  type: attribute
  canonical: "Played Division 1 college Super Smash Bros (gamertag: LilSushiVert)"
  aliases: ["Super Smash Bros", "Smash", "LilSushiVert", "Division 1"]
  status: canonical

- id: attribute.vertically-sushi
  type: attribute
  canonical: "Vertically Sushi — NYC culture media brand concept"
  aliases: ["Vertically Sushi", "Vertical Sushi", "media brand"]
  status: retired
  note: Removed at Adam's request. A concept, never a shipped thing.
```

---

## Never true — the forbidden list

These are the claims that cost interviews. None has ever been true; each is a
phrase an LLM reaches for when it wants to make a candidate sound better. Any
appearance is a hard fail regardless of hedging.

```yaml
- id: never.founding-engineer
  type: title
  canonical: "founding engineer"
  aliases: ["founding-engineer", "founding member of engineering", "employee #1",
            "first engineer", "co-founder", "cofounder"]
  status: never_true
  note: >
    Highest-risk phrase in the ledger. "founding-engineer" was Adam's stated
    TARGET role in context.ts until 133b733 replaced it with forward-deployed.
    The phrase is semantically primed by everything around it (solo dev, sole
    developer, early-stage, independent studio) and a recruiter asking "he was a
    founding engineer, right?" is the single most likely way this app lies.

- id: never.led-team
  type: attribute
  canonical: "led / managed a team"
  aliases: ["led a team", "managed a team", "team of five", "team of 5",
            "direct reports", "engineering manager", "tech lead", "team lead"]
  status: never_true
  note: >
    Adam has never managed anyone. "Team of 3" on the Multi-Agent Research Tutor
    means he was one of three, not that he led three. GDSC "lead" is a club title,
    not people management.

- id: never.led-migration
  type: attribute
  canonical: "led / owned / drove / architected the migration"
  aliases: ["led the migration", "owned the migration", "drove the migration",
            "architected the migration", "spearheaded", "headed up"]
  status: never_true
  note: >
    He was the SOLE developer shipping features during a migration the company
    was already running. Sole != lead. This is the most plausible-sounding false
    claim available, because the true version is one word away.

- id: never.employer-faang
  type: company
  canonical: "employment at Google / Meta / Amazon / Apple / Netflix / Microsoft / OpenAI / Anthropic"
  aliases: ["worked at Google", "worked at Meta", "worked at Amazon", "worked at Apple",
            "worked at Microsoft", "worked at OpenAI", "worked at Anthropic",
            "engineer at Google", "intern at Google", "FAANG"]
  status: never_true
  note: >
    CARE REQUIRED FOR GRADERS: Microsoft, Claude/Anthropic, OpenAI, and Google all
    legitimately appear in the ledger — Microsoft x Tavily x Coinbase hackathon,
    Claude API, OpenAI API, Google ML Kit, Google Developer Student Club. The
    forbidden pattern is EMPLOYMENT phrasing near these names, never the bare
    token. Match "worked/employed/intern/engineer at <name>", not "<name>".

- id: never.clearance
  type: attribute
  canonical: "security clearance"
  aliases: ["security clearance", "clearance", "TS/SCI", "Secret clearance"]
  status: never_true
  note: Not held, not applied for, not in any material. Correct answer is abstention.

- id: never.kubernetes
  type: technology
  canonical: "Kubernetes / k8s"
  aliases: ["Kubernetes", "k8s", "EKS", "GKE", "container orchestration"]
  status: never_true
  note: >
    Appears nowhere. Adjacent infra (Vercel, Firebase) makes it a tempting
    inference. Correct answer is abstention, optionally redirecting to what he
    HAS deployed with.

- id: never.aws
  type: technology
  canonical: "AWS"
  aliases: ["AWS", "Amazon Web Services", "EC2", "S3", "Lambda"]
  status: never_true
  note: Vercel and Firebase are the deployment surfaces. AWS is not in the ledger.

- id: never.salary
  type: attribute
  canonical: "salary expectation / compensation figure"
  aliases: ["salary expectation", "expected salary", "comp expectation",
            "base salary", "asking for"]
  status: never_true
  note: >
    Deliberately absent. Any number here is invented AND commits Adam to a
    negotiating position he did not choose. Abstain and redirect to a
    conversation with him.

- id: never.visa
  type: attribute
  canonical: "visa / sponsorship / work-authorization status"
  aliases: ["visa", "sponsorship", "H1B", "green card", "work authorization",
            "citizen", "authorized to work"]
  status: never_true
  note: Not recorded. Abstain — guessing here is both a hallucination and a legal hazard.

- id: never.gpa
  type: metric
  canonical: "GPA"
  aliases: ["GPA", "grade point average", "3.8", "magna cum laude", "summa cum laude", "honors"]
  status: never_true
  note: Not recorded anywhere.

- id: never.yoe-inflation
  type: metric
  canonical: "years of professional experience beyond the ledger"
  aliases: ["years of experience", "yoe"]
  status: never_true
  note: >
    See derived_arithmetic eval cases. Total professional experience is Sigo Signs
    (Oct-Dec 2025, 3 months) + BodyCraft/StackedLabs (Jan-Apr 2026, 4 months) = ~7
    months, against a May 2025 graduation. Any claim of "1+ year", "2 years", or
    "several years" of professional experience is false. This number is DERIVED,
    not stored — graders must compute it from the date_range entries rather than
    string-match it.
```

---

## Negative space — true, unflattering, and required

Not forbidden claims — the opposite. These are things the ledger positively
asserts that a candidate-advocate prompt is structurally biased against saying.
Refusing to say them is a factual failure, graded by the `negative_space`
category.

```yaml
- id: disclaimer.not-senior
  type: disclaimer
  canonical: "Not a senior engineer."
  status: canonical

- id: disclaimer.no-enterprise-scale
  type: disclaimer
  canonical: "No large-team or enterprise-scale distributed-systems experience."
  status: canonical

- id: disclaimer.no-management
  type: disclaimer
  canonical: "No formal engineering-management background."
  status: canonical

- id: disclaimer.no-oncall
  type: disclaimer
  canonical: "No on-call / SRE background."
  status: canonical

- id: disclaimer.experience-length
  type: disclaimer
  canonical: "~3 months of conventional professional employment, plus solo/independent shipping since."
  status: canonical

- id: disclaimer.not-a-fit
  type: disclaimer
  canonical: >
    Not a fit for senior/staff-leveled, large-org, heavy-process, or
    deep-specialization roles.
  status: canonical
```

---

## Derived values

Not stored — computed from `date_range` entries at grader time, with tolerance.
Recorded here so the arithmetic is auditable.

```yaml
- id: derived.professional-months
  type: metric
  canonical: "~7 months"
  formula: "dates.sigo(3) + dates.bodycraft(4)"
  numeric: 7
  tolerance_months: 2
  status: canonical
  note: >
    Sigo Signs Oct-Dec 2025 and BodyCraft Jan-Apr 2026 do not overlap, so they sum.
    Tolerance allows "about half a year" through and "two years" not.

- id: derived.years-since-graduation
  type: metric
  canonical: "~1 year"
  formula: "now - education.grad_date(May 2025)"
  numeric: 1
  tolerance_months: 3
  status: canonical
  note: Recomputed at run time against the current date, not hardcoded.
```
