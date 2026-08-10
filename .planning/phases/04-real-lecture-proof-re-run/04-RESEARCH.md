# Phase 4: Real-Lecture Proof Re-Run - Research

**Researched:** 2026-08-10
**Domain:** Operational proof execution + adversarial verification writeup (NOT code construction)
**Confidence:** HIGH

## Summary

Phase 4 is not a build phase — it is a scripted-and-manual operational exercise that drives the
already-shipped pipeline (Phases 1-3 fixes, all merged and verified) against a real nursing
lecture, end-to-end, and writes up the result as a dated adversarial-verification report. Every
route this phase needs already exists and is exercised by unit tests; nothing here requires
touching `server/src` or `web/src`. The planner's job is to sequence the run, decide the
verification method for each success criterion, and decide what evidence gets committed.

Three facts materially de-risk this phase, all confirmed by reading code and local machine state
rather than assumed:

1. **A real LLM run is possible right now with zero setup.** `~/.studyloop/config.json` on this
   machine has `llmProvider: "zai"` with `zaiApiKey` already set (and `kimiApiKey` also set) —
   the same provider (`glm-5`) the 2026-08-08 proof used. No Anthropic key is configured, and no
   ambient `ANTHROPIC_AUTH_TOKEN`/`ANTHROPIC_API_KEY` env vars are set. `[VERIFIED:
   ~/.studyloop/config.json (local file, read this session, key presence only)]`
2. **Multi-provider is genuine shipped code, not a doc error.** `server/src/config.ts:98`
   (`llmProvider: ProviderIdSchema.default("anthropic")`) and
   `server/src/lib/providers.ts:151-171` (`resolveProviderAuth` switches on 7 providers) prove the
   SPEC.md "Anthropic-only" line is stale prose, not the real gate. This phase does not need to
   resolve that open question (PROJECT.md flags it as "no roadmap phase depends on the answer")
   but the proof report should state plainly which provider/model it ran on, exactly as the prior
   report did. `[VERIFIED: server/src/config.ts:98, server/src/lib/providers.ts:151-171]`
3. **All four PROOF-02 session-content routes already exist and require no code changes** — notes
   (`PUT /api/projects/:id/notes`), captures (`POST /api/projects/:id/bubbles`), watchedUpTo and
   lessonSummary (`PATCH /api/projects/:id`, both fields `.optional()` on `ProjectPatchSchema`).
   The prior proof left these empty ("legitimately empty, so compile's session-content rendering
   paths remain unproven" — docs/REAL-LECTURE-PROOF-2026-08-08.md line 63); this phase's job is to
   populate them during the run, not build anything new.
   `[VERIFIED: server/src/routes/projects.ts:184-306, server/src/lib/models.ts:138,148,209,213]`

**Primary recommendation:** Run the proof as a scripted API-level walkthrough (curl/fetch against
the live server, matching the 2026-08-08 proof's own method) against MedCram's Part 2 ("2 of 5",
https://www.youtube.com/watch?v=K0maLgTzIto — covers PEEP/FiO2/SIMV, the exact gap the prior
proof's title-content mismatch exposed) using the currently-configured `zai`/`glm-5` provider, a
genuinely independent (not transcript-derived) slide deck, and explicit population of
notes/captures/watchedUpTo/lessonSummary before compile. Write a verbatim-quote verification
script this time instead of the prior proof's ad hoc scratchpad check, since the caption stream
and anchor quotes are both structured JSON the route already returns.

## Architectural Responsibility Map

This phase does not build capabilities — it exercises existing ones end-to-end. The map below
identifies which tier owns each capability under proof, so failures can be routed correctly
during the run (a slides.json bug is a Backend fix; a verifier miscounting an anchor offset is a
Verification-tooling bug, not a product bug).

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| YouTube resolve + yt-dlp fallback | API/Backend | External (YouTube/Innertube/yt-dlp) | `routes/youtube.ts`; Phase 1 fix already verified live |
| Slide PDF extraction + emptyPageCount | API/Backend | — | `lib/slides.ts`, `routes/slides.ts`; Phase 1 fix already verified live |
| Clinical/typed-spine analysis (LLM call) | API/Backend | External (LLM provider) | `lib/analysis.ts`, `lib/providers.ts`; real network call to zai/glm-5 this run |
| Attestation gate | API/Backend | Database/Storage (attestations.json) | `lib/attestation.ts`, `routes/attestation.ts`; Phase 3 gate already verified live |
| Review queue derivation | API/Backend | Database/Storage (review.json) | `lib/review.ts`; Phase 3 migration logic already verified live |
| Compile rendering (notes/captures/watchedUpTo/lessonSummary/pearls/units) | API/Backend | Database/Storage (notes.md, bubbles.json, project.json) | `lib/compileRenderer.ts`, `routes/compile.ts` — this is the phase's actual new exercise surface |
| Anchor-quote verbatim verification | Verification tooling (operator-side, outside the app) | — | Not an app capability; a proof-time script/manual check comparing `analysis.json` anchor quotes against `captions.json` |
| Adversarial report writeup | Verification tooling / docs | — | `docs/REAL-LECTURE-PROOF-<date>.md`, human-authored/reviewed, not app runtime |

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROOF-01 | Real nursing lecture passes end-to-end proof (URL paste → transcript → clinical analysis → slides → document mode → attestation → compile) with zero manual workarounds, zero hallucinated claims, exact safety values, verbatim anchors, and a review queue containing only attested/learner-touched cards | Every route in the chain confirmed to exist and pass its own regression suite (Phase 1-3 VERIFICATION.md reports); provider/key confirmed configured; lecture-choice research below resolves the title-content-mismatch gap flagged in PROJECT.md |
| PROOF-02 | notes, captures, watchedUpTo, lessonSummary rendering paths exercised and verified in the compiled export | All four backing routes confirmed to exist with no code changes needed (`routes/projects.ts`, `lib/models.ts`, `lib/compileRenderer.ts`); the watchedUpTo→"Concepts Covered" path has a data dependency documented below (Pitfall 3) that the plan must account for |

## Standard Stack

Not applicable in the conventional sense — this phase adds no new runtime dependency. The
"stack" here is the existing route surface plus whatever the operator uses to drive it.

### Core (existing, already shipped)
| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|---------------|
| `zai` provider (`StructuredLLMCaller`, wire: openai-compat) | glm-5 (default model) | Real clinical analysis LLM call | Already configured on this machine with a working key; matches prior proof's provider, so results are comparable |
| yt-dlp | on PATH (`/usr/local/bin/yt-dlp`) `[VERIFIED: which yt-dlp, this session]` | Caption fallback + frame extraction | Phase 1 fix already verified; health-checked via `/api/health` |
| ffmpeg/ffprobe | on PATH (`/opt/homebrew/bin/ffmpeg`, `/opt/homebrew/bin/ffprobe`) `[VERIFIED: which, this session]` | Frame capture for captures/bubbles | Needed if the proof exercises the capture/screenshot feature of bubbles |
| Vitest (server + web) | existing suite (server 1027/1027, web 357/357 as of Phase 3 verification) | CI regression gate | "CI is green" success criterion maps to this |
| GitHub Actions (`.github/workflows/ci.yml`) | `npm ci && npm run typecheck && npm test` on push/PR | CI definition | `[VERIFIED: .github/workflows/ci.yml, read this session]` — confirms "CI green" means this workflow, not a separate proof-specific pipeline |

### Supporting (operator tooling, not committed to the app)
| Tool | Purpose | When to Use |
|------|---------|-------------|
| curl / a small fetch script | Drive the API exactly as the prior proof did (its own report documents curl-only reproduction steps for every bug) | Primary proof-execution method — matches precedent, is scriptable, and produces reviewable request/response evidence |
| A short Node verifier script (new, throwaway or committed to `scripts/` — planner's call) | Replace the prior proof's ad hoc "programmatic check" for verbatim anchor-quote verification (report line 58: "0 violations, programmatic check" — not committed anywhere) | Recommended: write once, reuse for both this run and any future proof re-run |
| `browse`/`gstack` skill (already available in this environment) | Optional UI-level walkthrough to visually confirm the emptyPageCount warning, enrichment badges, and clickable timestamps that Phases 1-3 already gated behind `checkpoint:human-verify` and got Ryan's sign-off on | Not required to prove PROOF-01/02 (those are API-level claims), but strengthens "zero manual workarounds" if the operator also clicks through the real UI once |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| API-level (curl) proof | Full Playwright e2e walkthrough | Only 1 e2e spec exists (STATE.md Blockers/Concerns); building a full e2e for a one-time proof run is scope the phase description doesn't ask for — API-level matches the precedent set by the 2026-08-08 proof and is faster to produce evidence from |
| A committed verifier script | Manual line-by-line quote comparison (as done informally last time) | Manual works but isn't reusable and its "0 violations" claim in the prior report has no artifact backing it — a script produces a reviewable, re-runnable evidence file |

**Installation:** None — no packages to install. If the verifier script is written, it needs no
new dependency (plain Node, reading `analysis.json` + `captions.json` from the project's data
dir, both already-shipped JSON shapes).

## Package Legitimacy Audit

Not applicable — this phase installs no external packages. No `npm install` occurs; the proof
runs entirely against already-shipped, already-tested code paths.

## Architecture Patterns

### System Architecture Diagram

```
Operator (curl / browser)
   │
   ▼
POST /api/youtube/resolve  ──► Innertube (youtubei.js) ──[captions null?]──► yt-dlp fallback (Phase 1 fix)
   │
   ▼ (captions present)
POST /api/projects  ──► project.json written (store.ts, atomic write + per-project mutex)
   │
   ├──► POST /api/projects/:id/slides  ──► pdf-parse extraction ──► slides.json (emptyPageCount signal, Phase 1 fix)
   │
   ▼
POST /api/projects/:id/analyze  ──► resolveProviderAuth(config) ──► resolveAnalysisClientV3(auth)
   │                                      │
   │                                      ▼ (llmProvider="zai", zaiApiKey set)
   │                              StructuredLLMCaller → api.z.ai (glm-5) — real network call, real cost
   │                                      │
   │                              chunk → merge (anchor-time-aware dedup, Phase 2 fix;
   │                                       enrichment flag, Phase 2 fix; overlay scrub, Phase 2 fix)
   ▼
analysis.json (units/pearls/concepts, all with .enrichment, safetyTier types intact)
   │
   ▼
PATCH /api/projects/:id/attestations/:unitId  (attest / claim / dismiss / undo)
   │                                              │
   │                                              ▼
   │                                     attestations.json (gates review queue, Phase 3 fix)
   ▼
GET /api/review/queue  ──► buildReviewQueue (orphan-drop + reps>0 exception, Phase 3 fix)
   │                              → only attested/learner-touched cards (PROOF-01 SC3)
   ▼
[operator populates session content — NEW this run, not done in 2026-08-08 proof]
PUT /api/projects/:id/notes        (markdown with ^t: tokens)
POST /api/projects/:id/bubbles     (captures, with/without shot)
PATCH /api/projects/:id            (watchedUpTo, lessonSummary)
   │
   ▼
POST /api/projects/:id/compile  ──► renderCompiledDocument()
   │        reads: project.json, notes.md, bubbles.json, analysis.json, attestations.json
   ▼
exports/study-<date>.md  ──► operator-side verifier: byte-compare, anchor verbatim-check,
                              attestation-gating cross-check against attestations.json
   ▼
docs/REAL-LECTURE-PROOF-<date>.md (dated adversarial report, replaces "CONDITIONAL" verdict)
```

### Recommended Evidence Structure

```
scratchpad or docs/proof-evidence-<date>/    # planner decides commit vs scratchpad, see Open Questions
├── youtube-resolve-response.json            # proves no manual workaround (SC1)
├── slides-upload-response.json              # proves emptyPageCount / genuine deck
├── clinical-analysis.json                   # full analysis.json snapshot
├── anchor-verification-report.{json,md}     # NEW — output of the verbatim-quote verifier script
├── attestations-final.json
├── review-queue-response.json                # proves SC3 (only attested/learner-touched)
├── compiled-study-doc.md                     # export byte-compared against API response
└── notes.md / bubbles.json / project-patch-response.json   # NEW — proves PROOF-02 session-content paths
```

### Pattern 1: API-level proof walkthrough (precedent-matching)
**What:** Drive every step via HTTP against the live server (`http://127.0.0.1:4600`), capturing
request/response pairs as evidence, exactly as `docs/REAL-LECTURE-PROOF-2026-08-08.md`'s own
"Repro:" lines document.
**When to use:** This is the phase's primary method — it is faster, more precise about what was
actually sent/received, and directly reusable as report evidence.
**Example (attestation, from the prior proof's own repro line):**
```bash
# Source: docs/REAL-LECTURE-PROOF-2026-08-08.md line 43 (verified pattern, already used in prior proof)
curl -X PATCH http://127.0.0.1:4600/api/projects/<id>/attestations/<unitId> \
  -H 'Content-Type: application/json' \
  -d '{"status":"dismissed"}'
```

### Pattern 2: Session-content population (new this run)
**What:** Populate notes/captures/watchedUpTo/lessonSummary via their existing routes before
calling compile, so `renderCompiledDocument` exercises every branch instead of the empty-state
fallback text.
**When to use:** Required for PROOF-02.
**Example:**
```bash
# Source: server/src/routes/projects.ts:198 (PUT notes), read this session
curl -X PUT http://127.0.0.1:4600/api/projects/<id>/notes \
  -H 'Content-Type: application/json' \
  -d '{"notes":"AC mode sets tidal volume directly ^t:120.5 — compliance C=dV/dP ^t:340.0"}'

# Source: server/src/routes/projects.ts:232 (POST bubbles), read this session
curl -X POST http://127.0.0.1:4600/api/projects/<id>/bubbles \
  -H 'Content-Type: application/json' \
  -d '{"t":180,"text":"Key point: cuff balloon protects airway"}'

# Source: server/src/lib/models.ts:209,213 (ProjectPatchSchema.watchedUpTo/.lessonSummary), read this session
curl -X PATCH http://127.0.0.1:4600/api/projects/<id> \
  -H 'Content-Type: application/json' \
  -d '{"watchedUpTo":600,"lessonSummary":"This lecture covers AC/CMV mode, tidal volume dosing, and lung compliance."}'
```

### Anti-Patterns to Avoid
- **Setting `STUDYLOOP_FAKE_ANALYSIS=1` during the proof run:** this returns
  `FakeAnalysisClient` output instead of a real LLM call (`resolveAnalysisClient`,
  `server/src/lib/analysis.ts:1373-1378`) — the exact opposite of what a proof needs. Phases 1-3
  correctly used this flag for their human-verify checkpoints (throwaway demo projects); Phase 4
  must NOT set it. `[VERIFIED: server/src/lib/analysis.ts:1373-1378]`
- **Reusing a transcript-derived slide deck:** STATE.md's Blockers/Concerns explicitly flags the
  2026-08-08 slides PASS as "partially circular (deck text manufactured from the transcript)" —
  repeating that pattern would not close SC2's "genuinely independent deck" requirement.
- **Skipping the yt-dlp-fallback assertion because it "already passed unit tests":** Phase 1's
  VERIFICATION.md proves the code path is correct in isolation; PROOF-01 SC1 requires observing
  it fire on this machine's real network conditions against this specific video, which unit tests
  (mocked Innertube) cannot substitute for.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Verbatim anchor-quote checking | A new caption-parsing/matching library | A short script doing plain substring search: `captions.json`'s concatenated segment text already contains every anchor quote verbatim if the model behaved (this is exactly what the prior proof's "programmatic check" did informally) | The data shapes already exist and are simple (array of `{start,end,text}` segments, array of `{t, quote}` anchors) — no library needed, just a loop and a substring check with a time-window tolerance (prior proof used ±15s) |
| Review-queue-only-attested check | A new query/report tool | `GET /api/review/queue` response cross-checked against `attestations.json` directly (both are just JSON) | This is exactly Phase 3's `reviewRoutes.test.ts` pattern, already proven — the proof run just needs to read the same two files by hand/script once |
| CI-green confirmation | A new proof-specific pipeline | The existing `.github/workflows/ci.yml` (`npm ci && npm run typecheck && npm test`) | Already the sole CI definition in the repo; "CI green" for this phase means this workflow stays green after any Phase 4 commits (docs only, if the phase makes no code changes) |

**Key insight:** This phase's entire job is to *observe and document*, not to build tooling. The
one legitimate build item — a verbatim-quote verifier script — is small enough (loop + substring
match) that reaching for a library would be over-engineering for a one-time proof.

## Runtime State Inventory

Not applicable — this is not a rename/refactor/migration phase. No stored-data keys, service
configs, OS registrations, secrets, or build artifacts are being renamed or migrated. (The prior
proof's project directory `2852bce9-cb76-4849-ad44-82ce98db8ed1` under
`~/StudyLoopData/projects/` — actual configured path may differ, see `dataDir` in
`~/.studyloop/config.json` — remains untouched; this proof creates a new project, it does not
migrate the old one.)

## Common Pitfalls

### Pitfall 1: Innertube's network unreliability is machine-specific, not video-specific
**What goes wrong:** The 2026-08-08 proof's Bug 1 triggered because Innertube (youtubei.js) is
"unreliable from this network, a known machine gotcha" (proof report line 26). If this run's
network conditions differ (e.g., Innertube now succeeds), the yt-dlp-fallback code path (the
actual thing SC1 wants proven) may simply not fire, and the "no manual workaround" claim would be
proven vacuously rather than meaningfully.
**Why it happens:** Innertube's captions endpoint is reverse-engineered and its reliability
varies by network/IP.
**How to avoid:** Check the raw `POST /api/youtube/resolve` response first. If `captions` is
non-null (Innertube succeeded), the plan should either (a) accept that SC1 is proven by the
Phase 1 regression suite plus a real successful full-Innertube run, or (b) force the fallback
path once (e.g., temporarily via the existing DI seam `__setResolveYoutubeForTests`, but that is
a **test-only** function not meant for a live proof run — do not use it against the real server).
The honest path is (a): document whichever branch actually fired.
**Warning signs:** `captions` present with `transcriptSource` other than `"youtube-ytdlp"` in the
resolve response.

### Pitfall 2: Video title/content mismatch (already identified, not yet resolved)
**What goes wrong:** The 2026-08-08 proof used a MedCram part whose title promised
PEEP/FiO2/SIMV but whose content only name-dropped them (report lines 8-9, 64, 74). PROJECT.md
flags "Re-run lecture choice ... Phase 4 planning should decide" as still open.
**Why it happens:** Lecture series split across parts; the URL that was easiest to grab wasn't
the content-matching one.
**How to avoid:** MedCram's "Mechanical Ventilation Explained Clearly | 2 of 5"
(https://www.youtube.com/watch?v=K0maLgTzIto) is very likely the actual follow-up video that
covers PEEP/FiO2/SIMV. `[ASSUMED — found via WebSearch, title/description match but content has
not been fetched or transcript-checked this session; the plan's first task should resolve this
URL through `/api/youtube/resolve` and manually confirm the transcript actually discusses
PEEP/FiO2/SIMV before committing to it as the proof video]`. If it doesn't hold up, fall back to
a fresh title-matching search or explicitly attach both Part 1 and Part 2 as the PROJECT.md
"MedCram with its follow-up part" option already allows.
**Warning signs:** Re-reading the transcript and finding the same "name-dropped once, never
explained" pattern as before.

### Pitfall 3: watchedUpTo only produces visible output if a conceptDoc is attached
**What goes wrong:** `renderConcepts` (compileRenderer.ts:150-160) filters `ConceptCard[]`
(sourced from `project.conceptDoc`, a *separate* feature from analysis units — see
`compile.ts:14-27`'s `loadConcepts`) by `isCovered(card, watchedUpTo)`. If no `conceptDoc` is
attached to the project, `concepts` is always `[]`, and "Concepts Covered" always renders "_No
concepts covered yet._" **regardless of watchedUpTo's value** — the field would be technically
"exercised" (persisted, sent through PATCH) but its effect on the compiled export would not be
observably different from watchedUpTo=0, which weakens the "verified in the compiled export"
half of PROOF-02.
**Why it happens:** "Concepts Covered" and "Concept breakdown" (analysis pearls/units) are two
separate, independently-sourced sections in the same document — easy to conflate.
**How to avoid:** `PATCH /api/projects/:id` with a `conceptDoc: {path, profile: "headings"}`
pointing at a small markdown file with a couple of `## Heading` sections anchored via whatever
timestamp convention `parseHeadings` expects (server/src/lib/concepts.ts), THEN set
`watchedUpTo` past at least one of those anchors, so the before/after difference in "Concepts
Covered" is real and observable evidence. `[VERIFIED: server/src/lib/models.ts:191-192,210
(conceptDocPath/conceptDocProfile/conceptDoc fields exist), server/src/lib/compileRenderer.ts:150-160]`
If the planner decides this is out of scope (conceptDoc is a pre-existing, already-proven
feature, and PROOF-02's real ask may be interpreted as "the watchedUpTo *field* flows through,"
not "concepts covered materially changes"), that's a legitimate scope call — but it should be an
explicit decision, not an accidental gap discovered after the run.

### Pitfall 4: Cost/runtime of a real analysis call
**What goes wrong:** A full-lecture clinical analysis chunks the transcript and makes multiple
LLM calls (router + per-chunk + merge), each up to `ANALYSIS_MAX_TOKENS=16000` max_tokens
(analysis.ts:987). On a longer lecture than the 13-minute prior proof, this could mean more
chunks, more real API spend, and a longer wall-clock run (`glm-5`/`kimi-code` are flagged in
INTEGRATIONS.md as "reasoning models — max_tokens lifted to 32768" for chunk/merge calls,
implying longer per-call latency too).
**Why it happens:** Real LLM inference over a real transcript, not a fake/mocked call.
**How to avoid:** Confirm the chosen lecture's duration before starting (Part 2 of the MedCram
series is likely a similar 10-20 minute format based on the series pattern, but this is
unverified — check via the resolve response's `duration` field first). Budget for the analysis
step to take several minutes and for API cost — this is real spend, not free.
**Warning signs:** `analyze` job status polling (`GET /api/projects/:id/analyze/status`) staying
in-progress far longer than the ~1-2 minutes the 13-minute prior proof likely took.

## Code Examples

### Confirming which provider/key is actually live (presence only — never print key material)
```bash
# Pattern used this session to answer "is a key configured" without exposing it
node -e '
const fs = require("fs");
const c = JSON.parse(fs.readFileSync(process.env.HOME + "/.studyloop/config.json", "utf8"));
console.log("llmProvider:", c.llmProvider);
console.log("zaiApiKey set:", Boolean(c.zaiApiKey));
'
```

### Full-cycle route sequence (all confirmed to exist, no code changes needed)
```
POST /api/youtube/resolve              # server/src/routes/youtube.ts
POST /api/projects                     # server/src/routes/projects.ts
POST /api/projects/:id/slides          # server/src/routes/slides.ts
POST /api/projects/:id/analyze         # server/src/routes/analyze.ts:48
GET  /api/projects/:id/analyze/status  # server/src/routes/analyze.ts:174
GET  /api/projects/:id/analysis        # server/src/routes/analyze.ts:186
PATCH /api/projects/:id/attestations/:unitId   # server/src/routes/attestation.ts:31
GET  /api/review/queue                 # server/src/routes/review.ts
PUT  /api/projects/:id/notes           # server/src/routes/projects.ts:198
POST /api/projects/:id/bubbles         # server/src/routes/projects.ts:232
PATCH /api/projects/:id                # server/src/routes/projects.ts (watchedUpTo, lessonSummary, conceptDoc)
POST /api/projects/:id/compile         # server/src/routes/compile.ts:30
```

## State of the Art

| Old Approach (2026-08-08 proof) | Current Approach (Phase 4 should use) | When Changed | Impact |
|--------------|------------------|--------------|--------|
| YouTube resolve required a manual yt-dlp workaround, results pasted into project creation | Fallback runs inside the resolve route itself | Commit `4f7ff0e`, Phase 1 verified | SC1 should now pass without any manual step |
| Merge pass deduped by label fingerprint only (duplicate DOSAGE cards) | Anchor-time-aware dedup (`dedupeNearDuplicateUnits`) | Phase 2, commit set verified in 02-VERIFICATION.md | Should eliminate the near-duplicate-card failure mode from Bug 3 |
| Ungrounded enrichment presented as lecture-derived, no marking | `enrichment: boolean` flag on units/pearls, rendered with a locked notice in-app and in compile | Phase 2 | Bug 6 should no longer occur; if it does, that's a genuine regression to report |
| Un-attested pearls could enter the review queue | Gated at `deriveLiveCards`/`isUnitFeedable`, migration-safe | Phase 3, commit `813dc21` | SC3 should hold structurally, not just anecdotally |
| Dismissed units mixed into "Not yet reviewed" in compile | Distinct "Dismissed" section | Phase 3, commit `468e0b8` | Compile output should be self-evidently honest without manual inspection |
| Pearl/anchor timestamps rendered as plain, non-clickable text | Clickable `[mm:ss](#t=N)` links via shared `timestampLink` helper | Phase 3 | Nice-to-have (Bug 7) now resolved; worth a quick visual spot-check |
| Ad hoc, uncommitted "programmatic check" for verbatim anchors | (Recommended) a small committed/scratchpad verifier script this run | This phase | Makes "0 violations" claims reviewable/reproducible instead of asserted |

**Deprecated/outdated:** The docs/REAL-LECTURE-PROOF-2026-08-08.md "CONDITIONAL PASS" verdict
itself is what this phase supersedes — its "What must be fixed before showing a nursing student"
list (items 1-6) is now code-complete per Phases 1-3; item 7 ("demo prep, not a code fix" — pick
a title-matching lecture) is this phase's own job to close.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | "Mechanical Ventilation Explained Clearly \| 2 of 5" (https://www.youtube.com/watch?v=K0maLgTzIto) is the correct follow-up video covering PEEP/FiO2/SIMV | Common Pitfalls #2 | If wrong, the same title-content-mismatch problem repeats and SC1's "title-matching content" bar isn't actually met — mitigated by the plan's first task confirming the transcript content before committing |
| A2 | The MedCram Part 2 video's duration/complexity is comparable to Part 1's 13 minutes, so analysis cost/runtime stays similar | Pitfall 4 | If the video is much longer, analysis cost and wall-clock time could be significantly higher than budgeted — mitigated by checking `duration` from the resolve response before starting the analyze call |
| A3 | A genuinely independent slide deck (not transcript-manufactured) needs to be sourced by the operator for this specific lecture; no such deck is known to already exist in the repo or scratchpad | Pattern 1 / Anti-Patterns | If no independent deck can be found/built, SC2's "genuinely independent deck" bar can't be met and the plan needs an explicit fallback (e.g., a deck covering the same clinical topic from a different, publicly available source, clearly noted as topically-not-lecture-specific) |

## Open Questions

1. **Where does proof evidence get committed — `docs/`, a scratchpad, or a new evidence directory?**
   - What we know: The prior proof's report lives at `docs/REAL-LECTURE-PROOF-2026-08-08.md`
     (committed) but its raw evidence (JSON captures, compiled doc) lived in a session-temporary
     scratchpad path, not in the repo.
   - What's unclear: Whether Phase 4 should commit raw evidence artifacts (JSON snapshots,
     verifier script output) alongside the new report, or keep the same scratchpad-only pattern.
   - Recommendation: Commit the verifier script (if written, since it's reusable) and the dated
     report; keep large raw JSON captures in scratchpad unless the planner/user wants a permanent
     evidence trail — this is a discretion call for discuss-phase, not something research should
     lock.

2. **Does "zero manual workarounds" require a browser-driven UI walkthrough, or is API-level sufficient?**
   - What we know: The 2026-08-08 proof was entirely API-level (curl) and still reached a
     CONDITIONAL PASS verdict on its own terms; Phases 1-3's UI-visible changes (warning banner,
     enrichment badge, clickable timestamps) were separately human-verified via checkpoints
     already approved by Ryan.
   - What's unclear: Whether Phase 4's "Setup is a clean PASS, not CONDITIONAL" bar expects a
     literal browser session (paste URL into the actual web app) rather than curl against the API
     it calls.
   - Recommendation: API-level proof is sufficient to prove PROOF-01/02 as written (they describe
     data/behavior outcomes, not UI interaction); an optional lightweight `browse`/`gstack`
     walkthrough can be added for extra confidence but shouldn't be treated as blocking.

3. **Should the verifier script be committed to `scripts/` or stay scratchpad-only?**
   - What we know: No `scripts/` directory currently exists in the repo; no prior proof
     verification tooling was committed.
   - What's unclear: Whether a one-time proof phase should introduce a new top-level directory
     convention.
   - Recommendation: Given PROOF-01/02 explicitly ask for reproducible, adversarial verification
     ("all anchor quotes verbatim-verified") and this exact claim in the 2026-08-08 report had no
     backing artifact, committing a small `scripts/verify-anchors.mjs` (or similar) is worth
     proposing to the user during discuss-phase — it directly strengthens future proof re-runs
     too, not just this one.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| zai (Z.ai) API key | Real clinical analysis LLM call | ✓ | `zaiApiKey` set, `llmProvider: "zai"` (default model `glm-5`) `[VERIFIED: ~/.studyloop/config.json, presence only]` | kimi (`kimiApiKey` also set) as a second configured provider if zai has issues mid-run |
| Anthropic API key / ambient OAuth | Alternative provider (SPEC's stated default) | ✗ | — | Not needed — zai is already configured and was the prior proof's provider too; switching providers mid-milestone is out of scope per PROJECT.md's open-question note |
| yt-dlp | Caption fallback, frame extraction | ✓ | on PATH at `/usr/local/bin/yt-dlp` | — |
| ffmpeg / ffprobe | Frame capture (bubbles with shots) | ✓ | on PATH at `/opt/homebrew/bin/{ffmpeg,ffprobe}` | If a capture without a shot is acceptable evidence, ffmpeg isn't strictly required |
| Node.js | Server runtime, verifier script | ✓ | v22.23.1 (repo requires `>=18.17`) | — |
| Independent slide deck for the chosen lecture | SC2 "genuinely independent deck" | ✗ (not yet sourced) | — | No code fallback — this is an operator/content task the plan must schedule explicitly (see Assumption A3) |

**Missing dependencies with no fallback:**
- A genuinely independent slide deck for the chosen lecture — must be sourced or built as part of
  plan execution; no code path resolves this automatically.

**Missing dependencies with fallback:**
- Anthropic key absent — not a blocker; zai is already configured and matches precedent.

## Validation Architecture

This phase is a proof run, not new-feature construction, so the standard "REQ → automated test
map" doesn't apply in its usual sense — the phase's own "test suite" IS the proof run itself,
executed once against a real lecture, with its evidence written up as a report. This section
documents what's scripted vs. manual, and what counts as evidence.

### What the existing automated suite already covers (must stay green, but doesn't itself prove PROOF-01/02)
| Property | Value |
|----------|-------|
| Framework | Vitest (server + web workspaces) |
| Config file | `server/vitest.config.ts`, `web/vitest.config.ts` (existing, not created this phase) |
| Quick run command | `npm run test -w server -- <pattern>` / `npm run test -w web -- <pattern>` |
| Full suite command | `npm test` (root — runs both workspaces) |
| CI definition | `.github/workflows/ci.yml`: `npm ci && npm run typecheck && npm test` on push/PR to `main` `[VERIFIED: .github/workflows/ci.yml]` |

The full suite (server 1027/1027, web 357/357 as of Phase 3's verification) already proves every
individual mechanism (fallback branch, dedup predicate, enrichment flag, attestation gate,
compile partition) in isolation with mocked/fake data. **Phase 4's job is the thing unit tests
structurally cannot prove: that these mechanisms compose correctly against one real, uncontrolled
input (a real video, real captions, a real LLM response) end to end.**

### Phase Requirements → Verification Map (proof-run adaptation of the REQ→test map)
| Req ID | Behavior | Verification Type | Method | Evidence Artifact |
|--------|----------|-------------------|--------|--------------------|
| PROOF-01 SC1 | Setup is a clean PASS (no manual workaround) | scripted (API) | `POST /api/youtube/resolve` then `POST /api/projects`, observe `captions` non-null with no manual VTT-fetch step | resolve response JSON |
| PROOF-01 SC2a | Zero hallucinated clinical claims, verbatim anchors | scripted + manual | Verifier script substring-matches every anchor quote against `captions.json`; manual clinical-correctness review (as prior proof did) for claims a script can't judge | `anchor-verification-report.json` + written review notes |
| PROOF-01 SC2b | Safety values exact | manual | Compare `analysis.json` DOSAGE/CONTRAINDICATION/LAB_VALUE/PRIORITIZATION unit values against the transcript by hand | written review notes citing exact figures |
| PROOF-01 SC2c | Slide provenance firing on independent deck | scripted + manual | Check `evidence:"both"` ratio in `analysis.json` units (scripted count); manually confirm the deck's text layer wasn't transcript-derived (sourcing decision, not a check) | analysis.json snapshot + deck provenance note |
| PROOF-01 SC3 | Review queue only attested/learner-touched | scripted | Cross-check `GET /api/review/queue` response against `attestations.json` — same pattern `reviewRoutes.test.ts` already proves in isolation | review-queue response + attestations.json snapshot |
| PROOF-02 | Session-content paths exercised + verified | scripted (population) + manual (visual confirmation in exported .md) | PUT notes / POST bubbles / PATCH watchedUpTo+lessonSummary+conceptDoc, then read the compiled `.md` for all four sections rendering non-empty/non-placeholder content | compiled-study-doc.md + the population request/response JSONs |
| "CI is green" | Existing suite unaffected | automated | `npm test` + `npm run typecheck` (the CI workflow itself) | CI run link / local `npm test` output |

### Sampling Rate
- **Before the proof run:** `npm test` once, to confirm the Phase 1-3 baseline is still green
  going in (matches Phase 3 VERIFICATION.md's last-known state: server 1027/1027, web 357/357).
- **After the proof run (if any doc-only commits are made):** `npm test` once more — the proof
  itself makes no `server/src`/`web/src` changes, so this should be a no-op confirmation, not a
  regression hunt.
- **Phase gate:** Full suite green + the dated report committed, before this phase is marked
  complete.

### Wave 0 Gaps
- `scripts/verify-anchors.mjs` (or equivalent) — does not exist yet; needed if the planner adopts
  the scripted-verifier recommendation (Open Question 3). If the planner instead chooses manual
  verification only (matching the 2026-08-08 precedent exactly), this gap doesn't apply — flag
  the decision either way in the plan.
- No test-framework gaps otherwise — this phase adds no new production code paths, so no new unit
  test coverage is owed.

## Security Domain

This phase makes no code changes to route handlers, auth, or data-validation logic (it exercises
existing, already-ASVS-relevant code that Phases 1-3 already shipped and verified). No new attack
surface is introduced. The one security-adjacent consideration specific to this phase:

| Consideration | Applies | Note |
|----------------|---------|------|
| Secrets handling during evidence capture | yes | The proof run's evidence artifacts (resolve responses, config checks) must never include plaintext API keys — `config.json` is redacted to `*ApiKeySet` over the wire already (`PublicConfig`, `config.ts:234-245`), but if the plan captures `~/.studyloop/config.json` directly for any reason, it must redact manually before it touches any committed evidence file. This research followed that rule (presence-only checks, no key material printed). |
| V5 Input Validation | n/a this phase | No new routes/inputs; existing Zod schemas on every touched route already cover this (Phase 1-3 verified) |
| V2/V3/V4/V6 | n/a this phase | No auth/session/access-control/crypto surface touched — app remains loopback-only, no-auth by design (PROJECT.md Constraints) |

## Sources

### Primary (HIGH confidence — read directly this session)
- `server/src/config.ts` (lines 96-171, 234-245) — config shape, `llmProvider` field, redaction
- `server/src/lib/providers.ts` (lines 17-184) — `ProviderIdSchema`, `resolveProviderAuth`,
  `resolveAnalysisModel`, `missingCredentialMessage`
- `server/src/lib/analysis.ts` (lines 980-1030, 1340-1406) — `resolveAnalysisClient`/`V3`,
  `NoApiKeyError`, fake-mode gating
- `server/src/lib/compileRenderer.ts` (full file) — `CompileInput`, all render functions
- `server/src/routes/compile.ts`, `server/src/routes/projects.ts`, `server/src/routes/attestation.ts`,
  `server/src/routes/analyze.ts`, `server/src/lib/models.ts` — route surface + schema fields
- `.github/workflows/ci.yml` — CI definition
- `~/.studyloop/config.json` (this machine, presence-only check) — confirmed `llmProvider: "zai"`,
  `zaiApiKey`/`kimiApiKey` set, no Anthropic key/env configured
- `docs/REAL-LECTURE-PROOF-2026-08-08.md` (full file) — prior proof method, verdict, bug list
- `.planning/phases/{01,02,03}-*/0{1,2,3}-VERIFICATION.md` (full files) — confirmed which prior
  bugs are code-complete and independently re-verified (not just claimed)
- `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/PROJECT.md` — requirements,
  accumulated watch items, open questions
- `.planning/codebase/INTEGRATIONS.md` — provider registry overview (cross-checked against source)

### Secondary (MEDIUM confidence)
- None separately — all technical claims above trace to a direct source read this session.

### Tertiary (LOW confidence)
- WebSearch result identifying "Mechanical Ventilation Explained Clearly | 2 of 5"
  (https://www.youtube.com/watch?v=K0maLgTzIto) as the likely PEEP/FiO2/SIMV follow-up video —
  title/snippet match only, not transcript-verified this session. Logged as Assumption A1.

## Metadata

**Confidence breakdown:**
- Provider/key configuration reality: HIGH — read directly from the local config file and source
  code this session, not assumed from docs
- Route surface for PROOF-02 (notes/captures/watchedUpTo/lessonSummary): HIGH — every field and
  route confirmed present in source, no code changes needed
- Lecture choice (Part 2 video): LOW/ASSUMED — needs confirmation via the actual resolve+transcript
  read as the plan's first task
- Slide-deck sourcing: LOW/ASSUMED — no independent deck currently known to exist; this is a
  content-sourcing task for the plan, not a research-resolvable question
- CI/validation architecture: HIGH — read directly from `.github/workflows/ci.yml` and the three
  prior VERIFICATION.md reports

**Research date:** 2026-08-10
**Valid until:** This research is tied to the current state of `main` (through Phase 3's
completion) and the current machine's config — re-check provider/key state and lecture-choice
assumption if more than a few days pass before the plan executes, since API keys and video
availability can change.
