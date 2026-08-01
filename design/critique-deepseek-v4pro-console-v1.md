# Critique: deepseek-v4-pro — Console v1

*Review conducted against the full codebase (server 50+ source files, React frontend 50+ components, 64 test files total). All observations are grounded in the actual implementation, not the prompt's self-description.*

---

## 1. What this app actually is

The prompt frames this as "extracting core concepts from video and turning them into knowledge the learner owns." My read is more specific: **this is a trust-architecture machine.** Its real job is to solve the problem that an LLM sitting on top of a transcript will be wrong — sometimes subtly, sometimes catastrophically — and the damage compounds when that wrong output enters a review queue the learner trusts as "studied." Every design choice confirms this:

- **The AI is a proposer, never an oracle** — coded into the attestation gate (`isUnitFeedable`), the proposal → attest → review pipeline, and the "this is model output" labeling on every surface.
- **The transcript quote with confidence** on every unit anchor, every edge — the learner always has a path back to source.
- **The concept registry's BOUNDARY/threshold never-auto-merge rule** — because identity claims about boundary concepts are the most toxic kind of LLM error.

**Where the thesis is strong:** The core loop is genuinely well-specified and well-implemented. The chunking/merge pipeline with 7 providers, the SM-2-lite hidden SRS (ladder `[1,3,7,14,30,60]` days, mastery count, lapse-to-context), the cross-video identity registry, the domain-lens architecture — all real, tested, coherent. The pedagogy is binding, not aspirational. The anti-gamification stance is enforced at the schema level (no XP fields anywhere in `models.ts`).

**Where it's self-deception:**

First, "general-purpose learning app, not a niche tool." Look at `models.ts`:

```typescript
export const DomainSchema = z.enum(["biology", "history", "music", "physical_skill", "generic"]);
```

Five buckets. The richest implementation is `physical_skill` (triggers, failure modes, drill pairings, PROCEDURE emphasis). The overlay fields are hand-carved for four specific domains. A nursing student's domain isn't even on the list, and a `generic` lens that says "Leave every overlay field empty" is not a lens at all. The domain-lens architecture is genuinely good *for the domains it covers*, but calling it general-purpose when the enum has 5 entries — 4 of which have bespoke overlay schemas — is a reach.

Second, "extracting core concepts from video sources" — but the engine is **transcript-only.** The analysis pipeline sees text, not pixels. `frames.ts` and `thumbnails.ts` exist for screenshot capture and thumbnails, but they're not wired into analysis. For a BJJ instructional where the instructor says "look at this angle" and the camera shows the angle, the model gets the words but not the visual demonstration. For a nursing lecture with diagrams on slides, the model gets the spoken words but not the drug classification table. This is a *transcript analysis* app, not a *video analysis* app — and that discrepancy matters more for some domains than others.

---

## 2. The domain jump: what breaks first shifting from BJJ to nursing

### (a) No medical domain exists

This is the most literal blocker. A pharmacology lecture gets dumped into `"generic"` because none of the existing schemas fit. When `"generic"` is selected, the chunk prompt literally says "No specific domain lens applies" and "Leave every overlay field empty." Unit extraction quality will degrade.

### (b) The unit-type spine is wrong for clinical domains

The v3 unit types are `CLAIM | MECHANISM | PROCEDURE | EXAMPLE | BOUNDARY`. Nursing content doesn't cleanly decompose into these. A drug fact like "Metoprolol is a beta-1 selective blocker, contraindicated in heart block, dose 5mg IV push over 2 minutes" is partly a CLAIM (the fact), partly a MECHANISM (beta-1), partly a PROCEDURE (administration), and partly a BOUNDARY (contraindication) — but the model is forced to pick one type. Missing from the spine:

- **DOSAGE** — "how much, how often, what route" — a distinct fact type with recall implications
- **CONTRAINDICATION / PRECAUTION** — `BOUNDARY` is close but semantically wrong; a contraindication isn't a "limit" of the concept, it's a safety gate
- **PRIORITIZATION** — the core NCLEX skill: "which patient do you see first?" These are multi-concept synthesis problems
- **LAB_VALUE** — normal ranges, critical values, trending direction

Edge types also miss clinical relationships: `CONTRAINDICATES_FOR`, `INTERACTS_WITH` (drug-drug), `INDICATED_FOR`.

### (c) ASR will mangle drug names, and there's no defense

The pipeline is: captions → segments → chunk → Claude. If Whisper/YouTube captions renders "metoprolol" as "metro pro law," the LLM can sometimes recover from context but will frequently fail. The v3 pearl `unitLabel` resolution and concept registry's `fingerprintLabel` matching break on mangled names because they operate on the *already-mangled* text. There's no two-pass correction (e.g., a medical vocabulary normalization pass before analysis), no custom Whisper vocabulary injection, and no confidence signal on transcript segments to warn the learner "this section may have transcription errors."

### (d) The self-test model doesn't map to NCLEX

Self-test in StudyLoop is per-concept, generate-first, with a text field. NCLEX questions are multiple-choice synthesis: "A patient with COPD on 2L O2 develops confusion and a headache. ABG: pH 7.31, PaCO2 62, PaO2 58. What is the PRIORITY intervention?" This requires combining drug knowledge, lab interpretation, prioritization framework (ABC), and contraindication awareness — all in one question. StudyLoop's self-test asks "Here's a concept, what do you think?" which tests isolated declarative knowledge. The testing surface would need a fundamentally different question format for nursing.

### (e) Lecture-slide ingestion doesn't exist

The app has no concept of slide decks. A nursing lecture's key learning artifacts (PowerPoint slides with drug classification tables and lab value charts) are invisible to the system. They're captured only if the learner manually takes a screenshot. There's no OCR on captured frames, no slide-detection, no table extraction.

### (f) What the domain lens must actually contain

A `"clinical"` domain would need at minimum:

- **Unit types**: extend or override the spine with `DOSAGE`, `CONTRAINDICATION`, `PRIORITIZATION`, `LAB_VALUE`, `INTERVENTION`
- **Edge types**: add `CONTRAINDICATES_FOR`, `INTERACTS_WITH`, `INDICATED_FOR`
- **Overlay fields**: `drugClass`, `genericName`, `brandName`, `normalRange`, `route`, `onset`, `halfLife`, `priorityRanking` (1-5), `nclexCategory` (Safe & Effective Care, Health Promotion, etc.)
- **A medical vocabulary pass** before analysis: normalize known drug names, lab values, anatomical terms against a reference list
- **Question generation mode**: per-concept self-test vs. NCLEX-style multi-concept synthesis — the card transform prompt must differ

The existing architecture *can* accommodate all of this — the domain-lens-as-prompt-module pattern is genuinely well-designed — but the current implementation would need significant extension, not just configuration.

---

## 3. The failure mode: where the loop breaks over 90 days

The most likely breakage, by day ~30-45, is **attestation fatigue.**

Here's the math. A 60-minute nursing lecture, run through the v3 analysis pipeline, produces maybe 30-50 units. Each unit requires the learner to: read the AI-proposed label/summary/body, decide attest/dismiss, optionally write a `userTake`, and potentially edit the body. If a nursing student watches 3 lectures in a weekend, that's 90-150 units to process. At 20-30 seconds per unit, that's 45-75 minutes of just *attesting* — time that could have been spent actually studying. The attestation step, which is the pedagogical crown jewel ("nothing counts as known until the learner attests"), becomes the bottleneck.

The code confirms this is a real risk. `MAX_ATTESTATIONS_PER_PROJECT = 500` is a generous ceiling, and the attestation flow is one-at-a-time. There's no "batch attest" for a high-confidence-instructor video, no "trust this channel" heuristic, no "auto-attest when I've watched past this point" option. Every single unit demands a human decision.

By day 60-90, the secondary failure is **the review queue silting problem.** The SM-2-lite scheduler has `NEW_CARDS_DAILY_CAP = 20`. But:

1. The cap is per-session, not truly per-day — nothing prevents a learner from opening and closing the app 5 times and getting 100 new cards, or conversely, nothing surfaces "you have 47 cards behind schedule and an exam in 4 days."
2. The review queue is silent until you open it. No notification, no dashboard, no "exam prep mode" that front-loads material most relevant to an upcoming test.
3. `masteryCount` (cards with interval ≥ 30 days) is the headline number, but it counts cards that *have already graduated.* It says nothing about cards that are overdue, or cards that haven't been introduced yet.

**What gets abandoned first: generate-first.** The learner, already time-pressed, starts skipping the "your take" step (which the code allows — `isUnitFeedable` accepts a bare `attested` status with empty `userTake`). Then they start dismissing units without reading them. The generation effect, which is the evidence basis for the whole approach, evaporates silently — the app keeps working, the UI shows green checkmarks, but the learning has collapsed to passive consumption. And nothing in the app detects this.

---

## 4. Creative direction: 5 concrete moves

### Move 1: Add a clinical domain lens — but make it the *first* self-service lens

**What:** Implement a `"clinical"` domain with nursing-specific unit types, overlay fields, and an NCLEX-style question mode. More importantly: make the domain lens system user-configurable. Right now, `DOMAIN_MODULES` is a hardcoded `Record` in `analysis.ts` — adding a new domain means editing source code. Instead, domain modules should live as JSON or markdown files in `~/.studyloop/domains/`, loaded at startup and merged into the router's options. This turns "adding a domain" from a code change into something a power user can do in 10 minutes — which is how an open-source, one-serious-user app should work.

**Why it matters:** You need the domain for nursing school. But you also need others to be able to add *their* domains (law, engineering, culinary) without a PR. The architecture is already 90% there — the `DOMAIN_MODULES` map is prompt text over a shared schema. Making it config-driven is a small refactor with outsized leverage.

**Smallest slice:** Ship one hardcoded `"clinical"` domain with overlay fields (`drugClass`, `genericName`, `normalRange`, `nclexCategory`), unit type extension (`DOSAGE`, `CONTRAINDICATION`), and the NCLEX-style question prompt for `cardTransform.ts`. Don't yet build the self-service system — just prove the domain works on real nursing lectures.

### Move 2: Exam-prep mode — deadline-driven review scheduling

**What:** A toggle that changes the review scheduler from "20 new cards/day, ladder-paced" to "cram mode": all cards due, front-loaded by topic proximity to the exam date, with a countdown. This doesn't violate the "no engagement optimization" rule — it's a tool the learner deliberately activates. `buildReviewQueue` already accepts `dailyCap` as a parameter; exam mode sets `dailyCap = Infinity`, sorts by a deadline-weighted score, and adds a visible countdown.

**Why it matters:** A nursing student has exams with fixed dates. The app currently has no awareness of time pressure, which makes it feel disconnected from the learner's actual life. A study tool that doesn't know you have an exam is not a study tool — it's a hobby.

**Smallest slice:** A single text field "Exam date" on the project/settings side, a `GET /api/review/queue?mode=exam` that removes the daily cap and sorts cards by a combined score of (due urgency × domain relevance), and a banner in the Review view showing "47 cards, exam in 12 days."

### Move 3: Lecture-capture ingestion pipeline

**What:** A capture mode where the app records a live lecture (audio + screen capture or camera), runs Whisper locally for transcription, extracts slides via frame-differencing, OCRs them, and feeds the combined transcript+slide-text into analysis. This is not a small feature — but it's the highest-leverage addition for the nursing school use case, because it converts *attending class* (which the student already does) into structured study material automatically.

**Why it matters:** The current workflow for lecture content is: attend class → take notes → come home → find the recording (if it exists) → create a StudyLoop project → wait for analysis → study. That's a 5-step gap between the learning event and the study session. A capture pipeline collapses it to: attend class with StudyLoop open → analysis runs automatically → study immediately. This is the difference between being a *study tool* and a *learning environment.*

**Smallest slice:** Not the full capture pipeline. Start with: a "paste lecture slides PDF" upload that extracts text and timestamps, attaches them to the project's transcript as supplementary context for analysis. Feasible with existing PDF text extraction and immediately improves analysis quality for slide-heavy domains.

### Move 4: Transcript quality signal + 2-pass medical correction

**What:** Before analysis runs, a preprocessing pass scores the transcript quality (word confidence if available, segment density, gap frequency) and displays it as a thin strip alongside the video timeline — similar to how the attention heatmap already works. For the `clinical` domain specifically, a second pass runs the transcript through a medical vocabulary normalizer: a lookup table of common drugs, lab tests, anatomical terms, and their ASR-mangled variants, replacing "metro pro law" → "metoprolol." This runs client-side, costs nothing, and catches the highest-frequency errors before they poison the analysis.

**Why it matters:** ASR errors in medical content are a kill-shot risk (the prompt flagged this; PEDAGOGY.md doesn't address it). A single mangled drug name can turn a correct pearl into a dangerous one. The heatmap already demonstrates the infrastructure for timeline visualization; adding a transcript-quality strip is a UI reframe of existing data.

**Smallest slice:** The medical vocabulary normalizer only. A JSON dictionary of the ~200 most common nursing-school drug names/generics/abbreviations mapped to ASR-variant regexes, applied as a post-processing step on the raw transcript before chunking. No new UI needed — just silently improves the input quality.

### Move 5: "Study session" — collapse the console, go full-screen cards

**What:** A fourth modality (beyond Watch/Generate/Review): **Session.** When activated, the video player shrinks to a picture-in-picture thumbnail in the corner, and the entire viewport becomes a card-desk. Each card shows: a clip loop of the relevant video segment (10s), the concept title, a self-test prompt (domain-shaped), and the attestation controls. Swipe or arrow-key through them. This is the "30-minute review session before the exam" mode — the learner has already watched the lectures, now they need to *verify* understanding at speed.

**Why it matters:** The current Console is beautifully designed for the *first watch* — video is the anchor, concepts float over it, the timeline carries state. But the *review* experience is entirely separate (the Review view with cards and clip player). For a nursing student, the pattern is: watch once, then *rapidly drill* the concepts. The Session mode bridges the Console and Review into one continuous experience: watch → attest → session-drill, all in one sitting.

**Smallest slice:** Not a full card-desk. Start with: a "Quick attest" mode in the Console that, when activated, auto-skips the video to the next unattested concept after each attest/dismiss decision, showing a 10s clip loop and the attest pane. This is essentially the existing concept-looping behavior (click a tick, span loops) but automated and sequential.

---

## 5. One question to answer before writing any more code

**"Does a nursing student with 3 lectures to process, an exam in 2 weeks, and zero prior pharmacology knowledge actually complete the attestation loop — or do they just watch the videos and skip it?"**

Everything you build next — domain lenses, NCLEX question generation, lecture-capture ingestion — only matters if a real learner under real time pressure actually uses the core loop. If the answer is "they'll probably skip it," then the most valuable thing you can build is not a new domain lens but something that makes attestation faster, smarter, or partially automated. That could be: bulk attest for high-confidence instructors, auto-attest when the learner watches past a concept's anchor timestamp, or a "trust this video's AI output" mode that flips the default from proposed to attested with one click, leaving only low-confidence units for manual review.

I'd prototype this with one real nursing lecture and a timer before adding a single line to the domain system.

---

## Honest gap inventory (not in the prompt, but you should know)

Observations from the implementation that narrow what "general-purpose" actually means today:

| Gap | Severity | Notes |
|---|---|---|
| No mobile / PWA | High | The "full-viewport cinematic stage" is desktop-only. A nursing student reviewing cards on the bus needs a mobile review surface. |
| No offline mode | Medium | "Local-first" means local server, but no service worker. If the server stops, the app stops. |
| Transcript-only analysis | High | No visual frame analysis. Diagrams, slides, whiteboards, and demonstrations are invisible to the extraction engine. |
| No integration tests / E2E | Medium | 64 unit test files, zero Playwright/E2E tests. Server routes are "thin" but entirely untested in integration. |
| No auth / accounts | Low | Fine for single-user, but the share-bundle workflow is the only multi-user surface. |
| Concept-doc (manual curation) vs. AI analysis duality | Medium | Two separate concept sources (hand-written concept docs + AI-extracted units) with different schemas. The merge between them is unclear. |
| "No streaks" vs. streak tracking | Low | PEDAGOGY says "Streak demoted from headline to footnote" — but the review system still tracks `streak` in `review.json` and shows it at session end. The anti-gamification stance is in tension with the code. |
