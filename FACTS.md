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
| `unverified` | genuinely unknown — not confirmed true, not known false | **abstain** — asserting *or* denying both fail |

`retired` is what makes this file worth keeping. Deleting a bad metric from a
prompt doesn't stop an LLM from reconstructing it — the phrasing still lives in
the model's sense of what a résumé sounds like. Recording *what was removed* is
the only way to assert it stays gone.

`unverified` is the honest middle. `retired` says "this is wrong, never say it";
`unverified` says "nobody has checked, so don't take a position either way." The
distinction matters because a `retired` entry that turns out to be *true* makes
the app deny a real credential — which is its own kind of lying to a recruiter.
When you don't know, `unverified` costs nothing; a wrong guess in either
direction costs an interview.

---

## Resolved facts

All three open questions were confirmed by Adam on 2026-08-04.

1. **BodyCraft platforms.** NOT on iOS — PWA only. `platform.bodycraft-ios` is
   `retired`, so claiming the App Store is now a hard fail rather than an
   abstention.
2. **BodyCraft category names.** Bodyweight, Barbell, Dumbbell, Cable, Machine,
   Resistance band. Note the old copy's "calisthenics, yoga, powerlifting" were
   never category names at all — that line was wrong, not merely incomplete.
3. **AnG figures.** 60 tournaments / 10,645 attendees are verifiable via AnG's
   tournament history on smash.gg. The 2,500+ community figure stands.

No entry currently carries `unverified`. The status and its grader support
remain — it is the right answer the next time a fact is genuinely unchecked.

---

## Identity & contact

```yaml
- id: person.name
  type: attribute
  canonical: "Adam Martinez"
  aliases: ["Adam"]
  status: canonical

- id: person.professional-identity
  type: title
  canonical: "Software Engineer"
  aliases: ["software engineering", "software engineer", "software developer", "engineer"]
  status: canonical
  note: >
    The general self-description, distinct from the specific held titles
    (title.sigo, title.bodycraft). Added because facts-consistency caught
    SYSTEM_PROMPT shipping "Software Engineer" and "software engineering
    candidate" with no ledger entry behind them. True, just unrecorded -- which
    is exactly the drift the check exists to surface. Note this does NOT license
    a seniority prefix; senior/staff/principal remain never_true.

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

- id: contact.linkedin
  type: contact
  canonical: "linkedin.com/in/xvi-adam"
  aliases: ["linkedin.com/in/xvi-adam/", "/in/xvi-adam", "LinkedIn"]
  status: canonical

- id: attribute.bilingual
  type: attribute
  canonical: "Bilingual English / Spanish"
  aliases: ["bilingual", "English / Spanish", "Spanish", "Spanish-speaking"]
  status: canonical
  note: >
    Added 2026-10-16. Load-bearing rather than decorative: it is what makes
    Libreta (Spanish-first) and the Oro Latino bilingual product copy his work
    rather than a coincidence, so it is recorded as a fact with evidence attached.
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
    - "Bachelor of Science"
    - "bachelor"
    - "b.s."
    - "bs"
    - "CIS"
    - "CS Minor"
    - "minor in Computer Science"
    - "computer science"
  status: canonical
  note: >
    Aliases cover "Bachelor of Science ... minor in Computer Science", which is
    how the model phrases it. The first full run flagged "bachelor" and
    "computer science" as invented against a correct answer -- a ledger gap, not
    a hallucination. The CS MINOR is real; a CS *major* or degree is not.

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

- id: education.activities
  type: attribute
  canonical: "GDSC Lead Tech Developer, ACM, CodePath, ColorStack, Division I eSports"
  aliases: ["ACM", "CodePath", "ColorStack", "Division I eSports", "Division 1 eSports"]
  status: canonical
  note: >
    Manhattan University activities, added 2026-10-16. "Division I eSports" is the
    Super Smash Bros team under the school's framing -- the same fact as
    attribute.smash, not a second credential. Stacking both as separate
    achievements is double-counting.

- id: education.coursework
  type: attribute
  canonical: >
    Data Structures & Algorithms I/II, OOP (Java), Database Systems, Discrete
    Structures, Data Mining, Data Privacy, Business Statistics
  aliases: ["Data Structures", "Algorithms", "Database Systems", "Discrete Structures",
            "Data Mining", "Data Privacy", "Business Statistics", "OOP"]
  status: canonical
  note: Coursework only. Completed classes, not project or production experience.
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
  note: >
    Held at 117 on 2026-10-16, CONFIRMED 2026-10-17. The facts file said
    "114-workout library", which was the 114-EXERCISE figure
    (metric.bodycraft-exercises) restated with the wrong noun -- two numbers that
    have coexisted here since the ledger was written. Adam confirmed the ledger
    and is correcting the facts file. Both numbers are true of different things;
    collapsing them into one is the recurring error.

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

- id: metric.bodycraft-workouts-114
  type: metric
  canonical: "114-workout library"
  aliases: ["114 workouts", "114 workout programs", "library of 114 workouts"]
  numeric: 114
  status: retired
  note: >
    Added 2026-10-22. This is the collapsed form of the two figures above:
    117 workouts (metric.bodycraft-workouts) and a 114-EXERCISE library
    (metric.bodycraft-exercises). Adam's facts file carried it until the
    2026-10-17 ruling, which is what makes it `retired` rather than
    `never_true` -- the number is real, the noun attached to it is not.
    Deleting it from the facts file does not stop it coming back: 114 and
    "workout" both appear legitimately in the same sentence, so the wrong
    pairing is the single most available error in this section. Banning it is
    the only way to assert that it stays gone.
    A correct answer is unaffected -- it says "117 workouts" and "114-exercise
    library", and neither phrase matches this entry.

- id: technology.bodycraft-categories
  type: attribute
  canonical: "Bodyweight, Barbell, Dumbbell, Cable, Machine, Resistance band"
  aliases: ["Bodyweight", "Barbell", "Dumbbell", "Cable", "Machine",
            "Resistance band", "Resistance bands"]
  status: canonical
  note: >
    All six, confirmed 2026-08-04. Resistance band is the empty one. Any other
    named category is an invention and must fail.

- id: technology.bodycraft-categories-wrong
  type: attribute
  canonical: "calisthenics, yoga, powerlifting"
  aliases: ["calisthenics", "yoga", "powerlifting"]
  status: retired
  note: >
    These were never BodyCraft category names -- the old context.ts line was
    wrong, not merely incomplete. cr-002 caught the model inventing category
    names, which is what surfaced this.

- id: never.bodycraft-calisthenics
  type: project
  canonical: "calisthenics app"
  aliases: ["calisthenics application", "calisthenics fitness app",
            "calisthenics training app", "calisthenics-focused app",
            "bodyweight-only app", "app for calisthenics"]
  status: never_true
  note: >
    Added 2026-10-22. BodyCraft is a FREEMIUM FITNESS app -- 117 workouts across
    6 categories plus a 114-exercise library. Calling it a calisthenics app
    mis-sizes the product: Bodyweight is ONE of six categories
    (technology.bodycraft-categories), so the genre label silently discards five
    sixths of the content and reads as a narrower project than the one he built.
    Distinct from the sibling entry above, which bans "calisthenics" as a
    CATEGORY NAME. Enforcement already overlaps -- the bare token is a retired
    alias there, so a response saying "calisthenics app" trips both entries and
    reports two findings for one span. That is noise worth accepting: this entry
    is what names the claim correctly in a report, and the category entry would
    not survive a future correction to the category list.

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
    Confirmed 2026-08-04: BodyCraft is NOT on iOS, only a PWA. Older copy
    claimed iOS. Asserting the App Store is now a hard fail; saying it is
    web/PWA-only is correct and expected.

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

- id: title.stackedlabs
  type: title
  canonical: "Founder & Engineer"
  aliases: ["Founder", "founder and engineer"]
  status: canonical
  note: >
    His title at his OWN studio, added 2026-10-16. It does NOT license
    never.founding-engineer: "founder of my own studio" and "founding engineer at
    a startup" are one word apart and only the first is true. Keep the studio name
    attached whenever the word is used.

- id: attribute.bodycraft-auth
  type: attribute
  canonical: "Google and email authentication"
  aliases: ["Google auth", "email auth", "Google sign-in"]
  status: canonical
  note: Added 2026-10-16 alongside onboarding and the live battles arena.

- id: attribute.bodycraft-features
  type: attribute
  canonical: "skill progression system, live battles arena, onboarding flow"
  aliases: ["skill progression", "skill tree", "battles arena", "live battles", "onboarding"]
  status: canonical
  note: >
    The 2026-10-16 facts file names these as the shipped feature set. Same system
    project.bodycraft describes as a gamified skill tree and battle/challenge
    system; recorded here because the newer wording is what ships now.

- id: project.oro-latino
  type: project
  canonical: "Oro Latino"
  aliases: ["Oro Latino storefront"]
  status: canonical
  description: >
    Client work for a NYC jewelry retailer, IN PROGRESS: an interactive canvas
    storefront with Verlet-simulated draggable chains, procedurally rendered gold
    links, and bilingual Spanish/English product copy. Built as the client's
    lead-capture front door.
  note: >
    Added 2026-10-16. Must be described as in progress, not shipped. Distinct from
    project.jewelry-assistant -- see the open-conflicts section below.

- id: project.oro-latino-perf
  type: project
  canonical: "Oro Latino canvas performance fix"
  aliases: ["the perf fix", "rendering regression"]
  status: canonical
  description: >
    Diagnosed a rendering regression that dropped the scene to ~5fps: stamped run
    sprites instead of per-link draws, cut per-frame canvas state churn, added a
    sleep/composite path. Back to 60fps idle, one draw call per frame, 4.1MB atlas.

- id: metric.oro-latino-fps
  type: metric
  canonical: "~5fps before, 60fps idle after"
  aliases: ["5fps", "60fps", "60 fps idle"]
  numeric: 60
  status: canonical
  note: >
    Both halves or neither. "60fps" alone is a capability claim; the pair is the
    measured before/after that makes it evidence of a diagnosis.

- id: attribute.oro-latino-history
  type: attribute
  canonical: "Early bilingual customer-service work at Oro Latino, the jewelry store that is now a StackedLabs client"
  aliases: ["bilingual customer service", "customer-service work"]
  status: canonical
  note: >
    Cover-letter and "tell us about yourself" material per the facts file, not a
    resume line. True either way, so canonical rather than withheld.
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
  note: >
    THE ONLY Sigo Signs date range. Three months. Any stated or derived tenure
    beyond four months is false -- see never.sigo-tenure.

- id: dates.independent
  type: date_range
  canonical: "Jan 2026 - present"
  aliases: ["since January 2026", "since early 2026"]
  start: "Jan 2026"
  open_ended: true
  status: canonical
  note: >
    Independent/self-directed work: StackedLabs, shipped projects, hackathons.
    NO duration_months by design -- it is ongoing, so the figure is computed as
    of the run date. This is a different KIND of time from employed tenure and
    must never be summed with it.

- id: attribute.sigo-role
  type: attribute
  canonical: "contributed features, migrating them from C#/.NET to TypeScript, during the platform migration"
  aliases: ["contributed features", "migrated features"]
  status: canonical
  note: >
    CONTRIBUTOR, not sole owner and not lead. Corrected 2026-08-19 by Adam: he
    migrated a few features from C# to TypeScript as part of a migration the
    company was already running. He did not sole-own it, and did not lead, own,
    drive, architect, or manage it, or manage anyone. The previous canonical
    said "sole developer" -- see retired.sigo-sole-developer and
    never.led-migration. See disclaimer.no-management.

- id: retired.sigo-sole-developer
  type: attribute
  canonical: "sole developer shipping features during the migration"
  aliases: ["sole developer", "only developer", "the only developer",
            "sole owner", "solely responsible", "total and critical"]
  status: retired
  note: >
    Corrected 2026-08-19. This was the ledger's OWN canonical wording and shipped
    in context.ts, so the model had it from the prompt rather than inventing it.
    The real scope is contributor-level: a few features migrated from C# to
    TypeScript. Retired rather than deleted because deleting it only stops the
    app from SAYING it -- recording it is what makes a reappearance fail.
    Surfaced by os-002, which returned "total and critical ... sole developer".

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
  canonical: "100k+ file operations per day"
  aliases: ["100,000+ files", "100k files", "100k+ files", "100k+ file operations",
            "100k+ file operations/day"]
  numeric: 100000
  status: canonical
  note: >
    Refined 2026-10-16: the facts file states the volume as per-DAY. The bare
    "100k+ file operations" form stays an alias because it is the weaker claim and
    is still true.

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
  aliases: ["60% of support tickets", "60% fewer tickets"]
  numeric: 60
  status: retired
  note: >
    Removed in 133b733 as unverifiable. The alias "3 teams" was DROPPED from this
    entry on 2026-10-16: the team count is true and now canonical
    (metric.sigo-api-teams), and banning the phrase here was making the app deny a
    real credential. Only the 60% figure was ever the problem.

- id: metric.sigo-api-teams
  type: metric
  canonical: ".NET Core REST API used as the data-access layer by 3 internal teams"
  aliases: ["3 internal teams", "three internal teams", "3 teams"]
  numeric: 3
  status: canonical
  note: >
    Confirmed in the 2026-10-16 facts file. THIS ENTRY FIXES A LEDGER BUG: "3
    teams" was an alias of metric.sigo-tickets (retired), so a TRUE claim was
    banned by a retired entry's phrasing -- exactly the failure the README warns
    about, where a retired fact makes the app deny a real credential. The
    unverifiable half of that old claim was the 60% ticket reduction, never the
    team count.

- id: project.sigo-pagination
  type: project
  canonical: "server-side pagination via Prisma $queryRaw and SQL window functions"
  aliases: ["$queryRaw", "window functions", "server-side pagination"]
  status: canonical
  note: >
    Added 2026-10-16. Prisma stays working familiarity, not expertise -- see
    disclaimer.dotnet-depth.

- id: attribute.sigo-business
  type: attribute
  canonical: "Sigo Signs manufactures aluminum and vinyl safety, parking, traffic, and property signs"
  aliases: ["commercial printing", "sign manufacturer", "safety signs"]
  status: canonical
  note: >
    Context for what the order-management tool is actually for. Added 2026-10-16.

- id: attribute.sigo-scoping
  type: attribute
  canonical: "scoped the order management product directly with ops staff"
  aliases: ["scoped with ops staff", "scoped directly with ops"]
  status: canonical
  note: >
    The forward-deployed signal in the Sigo record, and the reason the facts file
    leads with Sigo for FDE roles: requirements gathered face to face from
    non-technical users, then shipped to the same people. Added 2026-10-16.
```

### AnG Esports

```yaml
- id: company.ang-esports
  type: company
  canonical: "AnG Esports"
  aliases: ["AnG", "A&G Esports", "Ay&Gi Esports", "Ay and Gi Esports"]
  status: canonical
  note: >
    "Ay&Gi Esports" is how the 2026-10-16 facts file spells it; added as an alias
    rather than promoted, since AnG is the spelling on smash.gg where the figures
    are verifiable.

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
  note: >
    Confirmed 2026-08-04. The tournament and attendee figures are verifiable
    from AnG's tournament history on smash.gg (many events; no single link).

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
  note: >
    Superseded by metric.ang-tournaments (60) and metric.ang-attendees (10,645).
    RESOLVED 2026-10-17: Adam confirmed the ledger is right and his facts file is
    the stale copy, so "40+ weekly tournaments" stays retired and the facts file
    is being corrected to 60 / 10,645. It stayed retired through the 2026-10-16
    mirror even while the facts file restated it, because 40+ is the weaker form
    of a figure confirmed at 60 on 2026-08-04 and verifiable from the tournament
    history -- reverting would have traded a verified fact for a vaguer one.
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

### ATM field service

Part-time, ongoing, and not software. It earns a place in the ledger because
forward-deployed and solutions roles value exactly what it is evidence of --
on-site troubleshooting, hardware plus software diagnosis, customer-facing
reliability -- and because an unrecorded five-year commitment is the kind of
thing a model will either omit or quietly convert into engineering tenure.

```yaml
- id: work.atm-technician
  type: title
  canonical: "ATM Field Service Technician"
  aliases: ["ATM technician", "ATM field service", "field service technician"]
  status: canonical
  description: >
    Part-time and ongoing: maintains his own fleet of ATMs -- weekly servicing,
    reprogramming, diagnosing and repairing hardware faults, replacing parts, cash
    reloads.
  note: >
    Added 2026-10-16. Include when a JD values field work, customer sites,
    hardware, or operational ownership; omit for pure software roles when space is
    tight. NOT software employment: it must never be folded into engineering
    tenure, and it does not change never.blended-experience-total or
    rule.experience-shape.

- id: metric.atm-years
  type: metric
  canonical: "about 5 years of part-time ATM field service, ongoing"
  aliases: ["~5 years", "about five years", "five years of ATM work"]
  numeric: 5
  status: canonical
  note: >
    Adam's own approximation. Stored as an approximate span rather than a
    date_range because no start date is recorded -- a computed duration would be
    precision the underlying fact does not have. Never summed with software
    tenure: "5 years of experience" phrasing stays banned by
    never.blended-experience-total, correctly, because that is a different claim
    than five years of part-time ATM servicing.
```

---

## Projects

```yaml
- id: project.shopatlas
  type: project
  canonical: "ShopAtlas"
  aliases: ["Shop Atlas", "NYC Tech Week hackathon", "NYC Tech Week",
            "agentic commerce assistant"]
  status: canonical
  description: >
    Agentic commerce assistant built at the Microsoft x Tavily x Coinbase
    hackathon in NYC. Claude API, Tavily web search, x402/USDC micropayments.
    Live demo.
  note: >
    The 2026-10-16 facts file names the event "NYC Tech Week Hackathon"; both
    names are kept as aliases because one event can carry both, and neither is
    asserted as THE name. Adam's own contribution is scoped in
    attribute.shopatlas-scope -- the x402 layer, not the retrieval service.

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

- id: project.libreta
  type: project
  canonical: "Libreta"
  aliases: ["Libreta Cuentas", "libreta-cuentas.base44.app"]
  status: canonical
  description: >
    Spanish-first, voice-first bookkeeper for cash-based small businesses that
    produces a lender-ready bank report. Built SOLO at the Latinos x AI Hackathon
    NYC (Columbia, Oct 2026), Finance track: Base44 as the platform, Claude API
    generating the reports, ElevenLabs powering the audio interface, Base44
    handling payments. Live at libreta-cuentas.base44.app.
  note: >
    Added 2026-10-16. No placement, user, or traction figures exist -- see
    never.hackathon-placement.

- id: project.shibboleth
  type: project
  canonical: "Shibboleth"
  aliases: []
  status: canonical
  description: >
    TEAM project at the MongoDB Harness Engineering & Model Wrangling Hackathon:
    an agentic, recursively improving harness that detects abliterated open-weight
    models and gets better the more models it has scanned. Teammates built the
    backend/core and the MongoDB Atlas-backed frontend; an automated agent sourced
    the abliterated models.
  note: >
    Added 2026-10-16. The project is impressive and mostly not his -- which is why
    attribute.shibboleth-scope and never.shibboleth-detector exist.

- id: attribute.shibboleth-scope
  type: attribute
  canonical: "Adam's lane on Shibboleth was the benign control set"
  aliases: ["benign control set", "control set", "benign corpus",
            "Qwen", "Qwen2.5", "Qwen2.5-1.5B", "TinySwallow", "Vikhr", "qqWen",
            "Zurich", "miniclaus", "MongoDB Atlas"]
  status: canonical
  description: >
    He added 5 real benign Qwen2.5-1.5B finetune checkpoints -- TinySwallow, Vikhr,
    qqWen, Zurich, miniclaus -- to the corpus, and all of them scored intact.
    Research interest behind it: adversarial robustness and model integrity,
    verification at scale.
  note: >
    A control set is the half of a detector nobody brags about and the half that
    decides whether its false-positive rate is real, so this is a substantive
    contribution stated at its true size. Scope it here; never widen it.

- id: project.adamos
  type: project
  canonical: "AdamOS"
  aliases: []
  status: canonical
  description: >
    Adam's own agent orchestrator / harness, used to run eval-improvement passes on
    Ask Adam.
  note: >
    Mention-only in materials -- one line, no bullets. Added 2026-10-16.

- id: project.ask-adam-jd-fit
  type: project
  canonical: "JD Fit Rater"
  aliases: ["JD fit rater", "fit rater", "job-description fit rater"]
  status: canonical
  description: >
    Paste a job description, get a scored alignment breakdown against Adam's
    shipped work. Structured JSON output, validated by the app's own validator.

- id: metric.ask-adam-cases
  type: metric
  canonical: "62-case eval harness"
  aliases: ["62 cases", "62-case suite", "62 eval cases", "62-case suite of evals"]
  numeric: 62
  status: canonical
  note: >
    Added 2026-10-16. The harness in this repository. evals/README.md's prose
    still says 60 in one place and 62 in another; 62 is the count the facts file
    states and the number of cases the suite actually loads.

- id: attribute.ask-adam-graders
  type: attribute
  canonical: >
    four grading layers -- deterministic checks, grounded-entity matching,
    abstention tests, LLM-as-judge
  aliases: ["four grading layers", "deterministic checks", "grounded-entity matching",
            "abstention tests", "LLM-as-judge", "LLM as judge"]
  status: canonical
  description: >
    Plus a consistency grader that flags when the fact ledger drifts from the live
    prompts -- the facts-consistency check that reads this file.

- id: attribute.ask-adam-eval-debug
  type: attribute
  canonical: "debugged a silent multi-hour eval hang to a 100k-token daily cap on the judge model"
  aliases: ["silent eval hang", "100k-token daily cap", "per-call timeouts",
            "incremental result writes"]
  status: canonical
  description: >
    Fixed with per-call timeouts and incremental result writes, so one stuck case
    fails alone instead of taking the run with it. The facts file calls this his
    strongest single signal for FDE and AI roles.

- id: attribute.shopatlas-scope
  type: attribute
  canonical: "Adam built ShopAtlas's x402 payment layer"
  aliases: ["x402 payment layer", "the checkout path", "payment layer"]
  status: canonical
  description: >
    ShopAtlas was built by five people. Adam's lane was the agent's checkout path: x402
    revives HTTP 402 so an agent can pay per API call in USDC in a single round
    trip, with no account and no API key. He wired it into a teammate's Tavily
    retrieval service -- the Tavily layer is the teammate's work, not his -- and
    added the safety gates: explicit human confirmation before any purchase
    executes, restricted-product queries blocked and logged, no credentials stored
    in plaintext.
  note: >
    Added 2026-10-16. He was one of five, which never.led-team deliberately
    refuses to let anyone phrase as a team size -- that shape reads as leadership.
    State the lane, not the headcount. The facts file's own wording ("Team of 5")
    is therefore mirrored as "built by five people"; the prompt-leak test caught
    the literal version on the first mirror attempt.
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

- id: technology.agentic
  type: technology
  canonical: >
    Claude, OpenAI, Gemini and Groq APIs; CrewAI; Tavily; ElevenLabs; structured
    JSON outputs; retrieval grounding; LLM-as-judge evals; x402 machine-to-machine
    payments
  aliases: ["ElevenLabs", "Eleven Labs", "structured JSON outputs", "structured JSON",
            "retrieval grounding", "LLM-as-judge evals", "x402",
            "machine-to-machine payments", "USDC"]
  status: canonical
  note: >
    Added 2026-10-16. Adam's own rule is that a term is only listed if a bullet
    demonstrates it, so each item here is backed by a project entry: ElevenLabs by
    project.libreta, x402/USDC by attribute.shopatlas-scope, LLM-as-judge and
    retrieval grounding by project.ask-adam. A term that loses its backing entry
    must come off this list.

- id: technology.familiarity-only
  type: technology
  canonical: "C#, .NET Core, Prisma, SQL Server, Base44"
  aliases: ["SQL Server", "Base44", "Base 44"]
  status: canonical
  note: >
    Working familiarity ONLY, per the facts file -- Base44 was used once, for
    Libreta. Presenting any of these as a strength is a factual error, not a tone
    problem; same rule as disclaimer.dotnet-depth.
```

---

## Working style & context

```yaml
- id: attribute.targeting
  type: attribute
  canonical: >
    Targeting forward-deployed / solutions engineer and early-career full-stack
    product engineer roles at AI-native startups.
  aliases: ["forward-deployed", "forward deployed", "Forward Deployed Engineer",
            "FDE", "solutions engineer", "product engineer",
            "full-stack product engineer", "AI engineer"]
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
    He CONTRIBUTED features to a migration the company was already running --
    see attribute.sigo-role. Contributing != leading, and (since the 2026-08-19
    correction) != being its sole developer either; both overclaims are one word
    away from the true version, which is what makes them plausible.

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

- id: never.blended-experience-total
  type: metric
  canonical: "a single blended figure for total professional experience"
  status: never_true
  patterns:
    - '\b\d+(?:\.\d+)?\s*(?:\+|plus)?\s*(?:months?|years?|yrs?)\s+(?:of\s+)?(?:total\s+|overall\s+|combined\s+|cumulative\s+)?(?:professional|work|working|industry|engineering|software|career|hands-on)\s+experience\b'
    - '\b(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|half a)\s+(?:months?|years?)\s+(?:of\s+)?(?:professional|work|working|industry|engineering|software|career)\s+experience\b'
    - '\b(?:total|overall|combined|cumulative)\s+(?:professional\s+|work\s+|industry\s+)?experience\s*(?:is|of|:|=)\s*(?:about\s+|roughly\s+|approximately\s+|~)?\d'
    - '\bhas\s+(?:about\s+|roughly\s+|approximately\s+|around\s+|~)?\d+(?:\.\d+)?\s*(?:\+|plus)?\s*(?:months?|years?)\s+(?:of\s+)?experience\b'
  status_note: >
    NO VALUE IS CORRECT HERE, which is why there is nothing to tolerance-check.
  note: >
    The ledger holds exactly ONE conventional employment record (Sigo Signs,
    3 months). Everything since is self-directed -- independent studio work,
    shipped projects, hackathons. Those are different kinds of time. Any single
    number offered as "total professional experience" blends them, and blending
    misrepresents both: it inflates the employed tenure and it erases what the
    independent period actually produced.

    There is no right number, so this is banned by SHAPE rather than by value.
    The correct answer is compositional -- see rule.experience-shape.

- id: rule.experience-shape
  type: disclaimer
  canonical: >
    Answer experience questions compositionally: state employed tenure and
    independent work as two separate quantities, then name specific shipped work.
  aliases: []
  status: canonical
  note: >
    The required SHAPE for any question about how much experience Adam has:

      1. Employed tenure, named as such: Sigo Signs, Oct-Dec 2025, 3 months.
      2. Independent work, named separately and as ongoing: since Jan 2026.
      3. Specific shipped output -- BodyCraft, ShopAtlas, Ask Adam -- because
         that is the part a recruiter can actually evaluate.

    Never sum the two. Never present one as the other. Never describe the
    independent period as a gap, a break, or time off; it is when most of the
    shipped work happened.

- id: never.sigo-associate-title
  type: title
  canonical: "Associate Software Developer"
  aliases:
    - "Associate Software Engineer"
    - "Associate Developer"
    - "Associate SWE"
    - "Assoc. Software Developer"
    - "Associate Engineer"
  status: never_true
  note: >
    A fabricated title. Adam was Software Trainer -> Internal Tools Developer at
    Sigo Signs (title.sigo), Oct-Dec 2025. This string was purged from the
    shipping prompt in 133b733 and must never reappear in any form.

- id: never.sigo-stale-range
  type: date_range
  canonical: "Jun 2025 - Jan 2026"
  aliases:
    - "June 2025 - January 2026"
    - "June 2025 to January 2026"
    - "Jun 2025 to Jan 2026"
    - "06/2025"
    - "2025-06"
    - "mid-2025"
    - "summer 2025"
    - "summer of 2025"
  status: never_true
  note: >
    A fabricated range paired with never.sigo-associate-title. The real range is
    Oct-Dec 2025 (dates.sigo). String matching catches the literal forms listed
    here; never.sigo-tenure catches the paraphrases it cannot.

- id: never.sigo-tenure
  type: metric
  canonical: "Sigo Signs tenure longer than 4 months"
  entity: "Sigo Signs"
  max_months: 4
  status: never_true
  note: >
    The rule that actually matters. Sigo Signs was three months (Oct-Dec 2025);
    four is the ceiling with rounding slack. This is enforced as a DURATION
    check, not a string match, because "roughly half a year", "about 8 months",
    "from mid-2025 into 2026" and every other paraphrase evade a denylist while
    saying the same false thing. Applies to any duration asserted near a mention
    of Sigo Signs, whether stated outright or computed from a date range.

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

- id: never.shibboleth-detector
  type: attribute
  canonical: "Adam built Shibboleth's detector or harness"
  aliases: ["adam built the detector", "he built the detector",
            "adam built shibboleth's detector", "he built shibboleth's detector",
            "adam built the harness", "he built the harness",
            "adam built shibboleth", "he built shibboleth",
            "adam's detector", "his abliteration detector"]
  status: never_true
  note: >
    Explicit guardrail in the 2026-10-16 facts file: Shibboleth was a team
    project and Adam's contribution scopes to the benign corpus / control set
    (attribute.shibboleth-scope). The detector and the harness are the teammates'
    work. This is the highest-value new ban in the file -- the project sounds like
    Adam's strongest work, which is exactly why a model will hand it to him.

    EVERY ALIAS HERE BINDS THE SUBJECT, and it has to. The first draft of this
    entry banned bare "built the detector" and "built the backend/core", which
    fire on the TRUE sentence "teammates built the backend/core" -- the
    prompt-leak test caught exactly that on the next run. A string ban cannot
    express "whoever did this, it was not Adam", so the subject goes in the
    phrase. Attribution the strings cannot reach (e.g. "he built the Atlas-backed
    frontend") is the judge's job, against attribute.shibboleth-scope.

- id: never.shopatlas-no-human
  type: attribute
  canonical: "no human in the payment loop"
  aliases: ["no human in the loop", "without human confirmation",
            "fully autonomous purchases", "no human oversight",
            "purchases without confirmation"]
  status: never_true
  note: >
    The consistency guardrail from the facts file. The PROTOCOL lets the agent pay
    machine-to-machine with no account and no API key; the PRODUCT gates every
    purchase behind explicit human confirmation. Asserting both at once is
    self-contradictory, and the autonomous half is the false one.

- id: never.hackathon-placement
  type: attribute
  canonical: "hackathon placement, win, or award"
  aliases: ["won the hackathon", "hackathon winner", "first place", "1st place",
            "took first", "second place", "runner-up", "winning project",
            "award-winning", "prize-winning"]
  status: never_true
  note: >
    No placement, win, or user count is recorded for Libreta, Shibboleth, or
    ShopAtlas. Hackathon prose invites this embellishment more than any other
    section, so it is banned by phrase rather than left to tone.

- id: never.solo-everything
  type: attribute
  canonical: "sole developer on everything he has shipped"
  aliases: ["sole developer on everything", "built everything himself",
            "every project solo", "all of his projects solo",
            "all of his work solo"]
  status: never_true
  note: >
    Solo claims scope to the StackedLabs builds, Ask Adam, and Libreta. Sigo Signs
    was team work, ShopAtlas had five people on it, Shibboleth was a team project. The
    Sigo-specific version is retired.sigo-sole-developer; this entry bans the
    generalization, which is the version that sounds modest enough to pass.
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

## Open conflicts with Adam's facts file (2026-10-16)

The 2026-10-16 update to Adam's canonical facts file added Shibboleth, Libreta,
Oro Latino and the ATM record, and reorganized the rest. Most of it mirrored in
cleanly. Four things did not, and they were recorded here rather than resolved,
because every available resolution would have meant choosing one of two sources
Adam maintains without asking him which is right. He ruled on the first two on
2026-10-17: both went the ledger's way, and the facts file is the copy being
corrected. The third was settled on 2026-10-22 by measurement rather than by a
ruling -- the two figures turned out to describe different models -- leaving
ShopAtlas's hackathon name as the only one still open. The direction matters -- it establishes that where the two disagree on
a figure this ledger has independently confirmed, the ledger wins and the facts
file gets fixed, rather than the newer file overwriting the checked one.

1. ~~**AnG tournament figures.**~~ **RESOLVED 2026-10-17 in the ledger's favor.**
   The facts file said "40+ weekly tournaments"; the ledger says 60 tournaments
   and 10,645 attendees, confirmed 2026-08-04 and verifiable from the tournament
   history. Adam confirmed the facts file is the stale copy and is correcting it.
   `metric.ang-weekly-40` stays `retired`.
2. ~~**BodyCraft content count.**~~ **RESOLVED 2026-10-17 in the ledger's favor.**
   The facts file said "114-workout library"; the ledger carries 117 workouts AND
   a 114-exercise library, and the facts file had restated the exercise figure
   with the wrong noun. Adam confirmed the ledger. Both figures stand, for
   different things.
3. ~~**The judge token cap.**~~ **RESOLVED 2026-10-22: two different limits, both
   real.** Groq enforces tokens-per-day **per model**, and every 429 body names
   the model it is rejecting, so there was never an account-wide pool for the two
   numbers to disagree about. `openai/gpt-oss-120b`, the judge, has been served
   `Limit 100000` -- the captured body is kept as a fixture in
   `evals/__tests__/graders.test.ts`, and the retired llama judge was served the
   same figure on 2026-08-05. The 200,000 in `evals/README.md` was measured too,
   but on `qwen/qwen3.6-27b` (the interim model under test, 2026-08-18), and it
   is also Groq's published free-tier figure for both gpt-oss models.
   `attribute.ask-adam-eval-debug` is therefore correct as written and unchanged:
   the cap it describes is the JUDGE model's, which is the binding one. What was
   wrong was `evals/README.md` and `evals/src/cost.ts` presenting 200,000 as one
   shared ceiling -- fixed 2026-10-22, which also revealed that the judged half of
   a cold run is ~1.25x over the judge's cap while the two halves looked
   affordable summed against the wrong number. The model under test has never hit
   its own TPD, so 200,000 remains an assumption there; Groq's console Limits page
   is the only authority for an org's actual values and is not readable from here.
4. **ShopAtlas's hackathon.** STILL OPEN. The facts file says "NYC Tech Week Hackathon";
   `project.shopatlas` says "Microsoft x Tavily x Coinbase hackathon in NYC".
   Both are plausibly true of one event, so both strings are kept and neither is
   asserted as the event's name.

Two phrasing conflicts are worth a decision rather than a note:

- **"sole developer."** The facts file describes StackedLabs as "Adam is sole
  developer on these builds", which is true. The exact phrase is `retired`
  (`retired.sigo-sole-developer`) because it shipped as a Sigo overclaim, and the
  forbidden grader matches strings, not contexts -- so a true StackedLabs
  sentence using it would hard-fail. The prompts therefore say "solo-built" and
  "builds them solo". The ban stays, because narrowing it would weaken the catch
  that found os-002. If Adam wants the literal phrase available for StackedLabs,
  the fix is to scope the retired aliases to Sigo, and that is his call.
- **"3 teams."** The same collision, resolved the other way: "3 teams" was an
  alias of a retired entry and is now canonical under `metric.sigo-api-teams`,
  because the team count was never the unverifiable part -- the 60% figure was.
  This one was safe to fix without asking, since nothing is lost by allowing a
  true claim that no overclaim depends on.

Also deliberately NOT added: the Bronx community hackathon (Amazon Quick, tenant
and housing navigator). The facts file says it stays off materials unless it
ships, and the ledger has no status for "real but not claimable" -- `unverified`
means unchecked, which this is not. Leaving it absent keeps the ledger honest at
the cost of the app not knowing about it.

Everything absent from the facts file was LEFT canonical rather than retired --
the Multi-Agent Research Tutor, Consistency Copilot, the AI Jewelry Shopping
Assistant, the GDSC and AnG detail. The facts file governs resumes, where space
decides what appears; this ledger governs what the app may say when asked. An
omission there is not a retraction here.

---

---

## Derived values

Not stored — computed from `date_range` entries at grader time.

There is deliberately **no** blended career total here. The ledger holds one
conventional employment record; everything after it is self-directed. Summing
them into a single figure misrepresents both, so that quantity is banned
(`never.blended-experience-total`) rather than tolerance-checked. A figure with
no correct value cannot have a tolerance.

Anything open-ended is computed as of the run date and carries **no**
`duration_months` — a stored constant for an ongoing period silently rots one
month per month.

```yaml
- id: derived.independent-months
  type: metric
  canonical: "independent work, ongoing since Jan 2026"
  formula: "now - dates.independent(Jan 2026)"
  tolerance_months: 2
  status: canonical
  note: >
    Recomputed against the run date. Deliberately has no `numeric` -- an ongoing
    period has no fixed length, and writing one down guarantees it is wrong next
    month. Reported SEPARATELY from employed tenure, never summed with it.

- id: derived.years-since-graduation
  type: metric
  canonical: "~1 year"
  formula: "now - education.grad_date(May 2025)"
  numeric: 1
  tolerance_months: 2
  status: canonical
  note: Recomputed at run time against the current date, not hardcoded.
```
