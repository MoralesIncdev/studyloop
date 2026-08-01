# StudyLoop — External Critique (GLM, console v1)

*Response to `docs/LLM-REVIEW-PROMPT.md`. Grounded in the actual code, not just the
brief: PEDAGOGY.md, FEATURE-REVIEW.md, `server/src/lib/analysis.ts`,
`transcriptResolve.ts`, `search.ts`, `review.ts`, `conceptRegistry.json`, and codex's
prior critique (`design/critique-codex-v3.md`). Disagreement prioritized over praise,
per the prompt's request.*

---

## 1. What this app is actually for

It's a **single-user, local-first study exoskeleton** that bets the entire pedagogical
value chain on one move: forcing the learner to *attest* AI-proposed concepts before
they enter a retention queue. The thesis is strong where most "AI study tools" are
weak — it refuses to be an oracle, refuses engagement metrics, and treats AI output as
raw material the learner must claim. PEDAGOGY.md is more rigorous than 95% of edtech
PRDs.

**Where the thesis is self-deception:**

- **"General-purpose by design" is aspirational, not architectural.** The spine
  (`CLAIM/MECHANISM/PROCEDURE/EXAMPLE/BOUNDARY`) is fine, but every interaction
  surface — cinematic console, 8 floating panes, "park a pane on a timestamp,"
  concept-scoped looping — is shaped for *few deep concepts over many hours* (BJJ
  instructionals). That is one specific shape of content. The domain lens abstraction
  swaps the prompt, not the surface.
- **The attestation moat is the load-bearing wall and it isn't enforced.** Codex
  already flagged that pearls enter the review queue without attestation
  (`review.ts:241`). If that's still true, the central claim of the app — "only
  attested material becomes review cards" (PEDAGOGY §5) — is violated in the one place
  it actually matters. Everything else is theater around that one invariant.
- **"Compounding across sources" is unbuilt.** The merge queue is V3-D P1, deferred.
  Without cross-source concept identity, StudyLoop is a nicer Anki per-video. The
  differentiator doesn't exist yet.

## 2. The domain jump — what breaks first

Concrete, in order of how fast it kills nursing:

**a) ASR terminology — Day 1, not "future."** `transcriptResolve.ts` and
`transcripts.ts` have *no* terminology correction layer. Whisper-family ASR will
mangle *hydrochlorothiazide*, *acetaminophen*, *pharmacokinetics*, drug brand names,
and every Latin abbreviation. The LLM analysis then propagates those errors into typed
units and review cards. Search is plain `toLowerCase().includes(q)` (`search.ts`) —
fuzzy against garbled ASR returns nothing. The fingerprint-based concept identity
(`upper-lower-body-bridging-principle::…::physical_skill` in conceptRegistry.json) is
string-similarity-dependent; the same drug across two lectures with two ASR spellings
will **not merge** and **not echo**. The prior advisory flagged this as a kill-shot
risk; in the code it's an unmitigated kill-shot.

**b) Footage is the wrong primary medium for nursing.** BJJ = bodies on a mat,
footage-rich. Nursing lectures = slide decks. Most teachable content is *on the
slides*, not spoken verbatim. Analysis chunks the transcript and treats footage as
auxiliary. For lectures it's the inverse: the slide is the lesson, the voice is the
commentary. Extracting concepts from transcript alone misses the bulk of declarative
content. This is the music-domain weakness PEDAGOGY already flags for itself — and
it's the *default* mode for nursing.

**c) Volume inversion breaks the UI premise.** BJJ = a handful of deep concepts per
7-hour instructional. Nursing = 30–50 atomic concepts per 50-minute lecture × ~3
lectures/day. The "cinematic stage with parked panes" interaction assumes *sparse*
concepts. At nursing density you want the opposite default: a transcript-anchored
document surface (Notion-over-audio), concepts as inline annotations, video demoted
to reference. Same spine, different default skin.

**d) No exam-alignment lens exists.** The domain router returns
`{biology, history, music, physical_skill, generic}`. There is no clinical/exam-prep
domain. Nursing students have a concrete external yardstick (NCLEX) with a specific
question style (scenario, prioritization, SATA). "Concepts locked in past 30 days"
doesn't predict NCLEX pass probability. The "honest claims" philosophy correctly
resists promising mastery — but leaves no answer to "will this help me pass," the only
question a nursing student asks.

**e) Safety stakes conflict with the anti-oracle stance.** In BJJ a wrong concept
costs a sweep. In nursing a wrong dosage concept can be lethal. Attestation is
pedagogically correct but conflicts with clinical reality: some things must be
memorized *verbatim and correct*, not "restated in your own words." The `BOUNDARY`
unit type exists but gets no special handling — no must-attest-verbatim, no re-test-to-
criterion, no override of the generative-first default for safety-critical material.

**What the domain lens must actually contain to survive the jump:** (1) a
terminology/glossary module that post-corrects ASR before analysis, (2) a
default-surface selector (not just a prompt module), (3) an exam-target overlay
(syllabus/practice-question mapping), (4) a verbatim-correctness tier for
safety-critical units.

## 3. The failure mode over 90 days

**The attestation tax collapses first.** At nursing volume (~120 concepts/week), every
concept requiring a restatement before review = the entire study budget spent
attesting. Learner skips → nothing enters review → retention silently dies → "app
doesn't work" → abandoned. Generate-first is correct for *deep* concepts, murderous
at *volume*.

Second: **analysis cost on the user's own key.** ~7 chunks × 2 calls per 50-min
lecture, re-run after every ASR fix = real weekly money. Multi-provider routing is
smart, but the cost curve punishes the exact domain being entered.

Third: **single user, no telemetry, builder rationalizes.** Every dead-end gets
explained away because there's no second user to hit a different wall.

## 4. Creative direction (5 moves)

### Move 1 — Build the terminology layer before the domain lens
Per-project `terms.json` (manual `garbled → correct` map applied at transcript load),
with inline "this looks wrong, correct it" on any transcript word. No AI needed for
v1. Without this, nursing is DOA.
**Smallest first slice:** a transcript-edit handler + a load-time rewrite pass + a UI
affordance to flag/fix a word in place.

### Move 2 — Invert the default surface by domain
Let the domain router choose the default skin, not just the prompt. `physical_skill`
→ cinematic console. `declarative/clinical` → transcript-anchored document surface
(concepts as inline annotations, video as a side panel). Same spine, different
default.
**Smallest first slice:** a "document mode" render of the same units + a
domain-driven default in the route handler. The units already carry anchors; this is
a render decision.

### Move 3 — Decouple attestation density from extraction density via concept clusters
LLM proposes *groups* of related atomic facts ("5 side effects of metoprolol");
learner attests the group with one restatement; it fans out into N cloze items in
review. Generate-first preserved for groups; volume survivable.
**Smallest first slice:** a `cluster` unit type that attests as one card, derives N
review cards.

### Move 4 — Exam-coverage as a first-class surface
Paste a syllabus or topic list (or a practice question set) → app maps to attested
concepts → "you've covered 3/7 of heart-failure pharmacology, missing X/Y/Z." Makes
the app's value legible against the yardstick the user actually has.
**Smallest first slice:** a coverage-map view = attested concepts grouped by a
user-supplied outline, with gaps highlighted.

### Move 5 — Cut share bundles until N>1; spend that budget on the merge graph + a real index
`share.ts`, `overlayDiff.ts`, bundle narrative fields, attention layering — all built
for a community that doesn't exist. The actual moat (cross-source concept identity) is
unbuilt and `conceptRegistry.json` is already 76KB of JSON scanned in memory — it'll
be 5MB by semester end. Drop a per-library SQLite (still local-first, still git-able)
as the concept/echo/prereq index.
**Smallest first slice:** `concepts.db` mirror written on every analyze + a query
layer replacing the in-memory scans.

**Bonus deletion candidate:** the knowledge-map constellation pane. PEDAGOGY §9 says
no visible graph UI; three council sessions concurred. If it's still in the console,
it contradicts the binding doc.

## 5. One question to force before any more code

**"What is the smallest thing StudyLoop must do for you to choose it over your
textbook and lecture recordings for your next nursing exam — and would you actually
trust it for that?"**

If the builder won't trust it against the real stakes, this is a research project with
a beautiful pedagogy doc, and every domain-jump question is academic. The answer
dictates whether Moves 1–4 are the roadmap or a eulogy.
