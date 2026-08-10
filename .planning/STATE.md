---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 4
current_phase_name: Real-Lecture Proof Re-Run
status: awaiting-checkpoint
stopped_at: 04-05 Tasks 1-3 complete (adversarial verification, dated report, CI + provenance) — awaiting Ryan's sign-off at Task 4's blocking checkpoint before Phase 4 closes
last_updated: "2026-08-10T19:45:00.000Z"
last_activity: 2026-08-10
last_activity_desc: Phase 4 Plan 5 Tasks 1-3 — adversarial verification found a new anchor-timestamp-drift defect (F-10, up to ~282s off, both DOSAGE safety-tier units affected) that the committed anchor verifier (D-03) was specifically built to catch; zero hallucinated claims found across all 18 units/8 pearls/8 edges; SC3 review-queue gate cleanly proven (18/18 feedable, 0 violations); dated report written with all four modes CONDITIONAL, overall CONDITIONAL PASS; CI green (1047 server + 357 web); PROOF-02 flipped Complete, PROOF-01 stays open pending the anchor-drift finding
progress:
  total_phases: 4
  completed_phases: 3
  total_plans: 15
  completed_plans: 14
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-09)

**Core value:** A real lecture goes end-to-end with zero hallucinated claims and zero un-attested AI content in the review queue.
**Current focus:** Phase 4 — Real-Lecture Proof Re-Run

## Current Position

Phase: 4 of 5 (Real-Lecture Proof Re-Run)
Plan: 5/5 in progress (04-05 Tasks 1-3 complete, Task 4 blocking checkpoint pending Ryan's sign-off)
Status: Awaiting checkpoint
Last activity: 2026-08-10 — 04-05-PLAN.md Tasks 1-3 complete: adversarial verification pass found a new anchor-timestamp-drift defect (F-10, 10/18 units up to ~282s off, both DOSAGE safety-tier units affected) plus a related near-duplicate escape (F-11) and the rolling-caption root cause (F-09) — zero hallucinated claims across all 18 units/8 pearls/8 edges, SC3 review-queue gate cleanly proven (0 violations); dated report written at docs/REAL-LECTURE-PROOF-2026-08-10.md with all four modes CONDITIONAL, overall CONDITIONAL PASS; CI green; PROOF-02 flipped Complete, PROOF-01 stays open with a provenance note

Progress: [█████████░] 93% (advances to 100% once Task 4's checkpoint is approved and 04-05-SUMMARY.md is finalized)

## Performance Metrics

**Velocity:**

- Total plans completed: 11
- Average duration: ~26 min
- Total execution time: ~3.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 3 | - | - |
| 2 | 4 | - | - |
| 3 | 3 | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01-ingestion-pipeline-repair P01 | 20 min | 3 tasks | 4 files |
| Phase 01 P02 | 20min | 2 tasks | 6 files |
| Phase 02-analysis-fidelity-hardening P01 | 35 min | 2 tasks | 7 files |
| Phase 02 P02 | 20 min | 2 tasks | 5 files |
| Phase 02 P03 | 30 min | 3 tasks | 7 files |
| Phase 03-attestation-gate-compile-honesty P01 | 20 min | 2 tasks | 1 file |
| Phase 03 P02 | 15min | 2 tasks | 1 files |
| Phase 03 P03 | 20min | 2 tasks | 2 files |
| Phase 04-real-lecture-proof-re-run P01 | 55min | 3 tasks | 10 files |
| Phase 04 P02 | 25min | 2 tasks | 3 files |
| Phase 04 P03 | 30 min | 3 tasks | 12 files |
| Phase 04 P04 | 45 min | 3 tasks | 14 files |
| Phase 04 P05 (Tasks 1-3; Task 4 checkpoint pending) | ~45 min | 3 tasks | 13 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table (11 LOCKED pedagogy ADRs + 4 ingest resolutions).
Recent decisions affecting current work:

- [Ingest] LOCKED ADR > SPEC on review-card sourcing: the F11/V3-B un-attested pearl channel must close (Phase 3), and SPEC.md gets updated to match
- [Ingest] SPEC > PRD auto-resolution on the Analyze LLM-provider surface stands as a doc ruling, but is flagged ⚠️ stale (proof ran glm-5, multi-provider is shipped reality) — no code change planned; awaiting user call on SPEC.md
- [Ingest] P2 depth tier (prerequisite graph, lesson composer, Threads) is its own accuracy-gated phase (Phase 5) — do not start on the proof run alone
- [Ingest] Compile gains a distinct "Dismissed" section, separate from "Not yet reviewed" (Phase 3)
- [2026-08-09 Phase 1] Descoped: the Innertube 15-minute cache wraps `resolveVideo` only, so the route-level yt-dlp caption merge is never cached and a repeat resolve of the same video re-spawns yt-dlp (up to its 30s timeout). Out of scope because PIPE-01's success criteria require the fallback to run, not to be cached; single-paste flows hit it once. Revisit if the Phase 4 proof run shows repeat-resolve latency.
- [2026-08-09 Phase 1] Accepted: `text.trim().length === 0` is the emptiness threshold for PIPE-02; a page carrying only a footer or page number counts as non-empty. Revisit only if the Phase 4 proof deck exhibits that false negative.
- [2026-08-09 Phase 1] emptyPageCount is computed inside PdfParseSlideExtractor's existing pagerender callback (not a second pass over pages) and defaults to 0 on SlidesMetaSchema so pre-existing slides.json files stay readable.
- [2026-08-10 Phase 2 P01] ANLZ-02's `enrichment` field ships as `.optional()` (locked in 02-CONTEXT.md), never `.default(false)`, and both merge passes OR it rather than average/majority-vote it — same never-lose-a-signal rule as V3-D D2 threshold. D-01's `dedupeNearDuplicateUnits` match predicate is untouched; enrichment is passenger data on the collapse.
- [2026-08-10 Phase 2 P01] REQUIREMENTS.md's ANLZ-02 checkbox stays Pending: 02-03-PLAN.md also declares ANLZ-02 (pearl/compiled-export surfaces) and hasn't run yet — shared-ID gate (#2388) flips it only once both declaring plans have a SUMMARY.
- [2026-08-10 Phase 2 P02] PRIORITIZATION added to `clinical.json`'s `safetyTier` array and mirrored into `safetyTier.ts`'s `SAFETY_TIER_UNIT_TYPES` (D-02, LOCKED). D-01's distinct-facts-never-merge guarantee and the verbatim-quote predicate are now regression-tested for all four safety-tier types (DOSAGE/CONTRAINDICATION/LAB_VALUE/PRIORITIZATION); `UnitProposalCard.tsx` was not touched. REQUIREMENTS.md's ANLZ-01 checkbox stays Pending: 02-04-PLAN.md also declares ANLZ-01 and hasn't run yet — shared-ID gate (#2388).
- [2026-08-10 Phase 2 P03] ANLZ-02 repeated on the pearl channel (PearlSchema.enrichment, both LLM prompts, merge-dedupe OR in both the real prompt and FakeAnalysisClient) and extended into the compiled document (renderAnalysisPearls + renderAnalysisUnitsV3's attested branch), via a re-declared server-side ENRICHMENT_NOTE verified character-identical to the web copy. This was the second and final declaring plan for ANLZ-02 (02-01 was first) — REQUIREMENTS.md's ANLZ-02 checkbox is now Complete (shared-ID gate #2388 resolved).
- [2026-08-10 Phase 3 P01] GATE-01 proven end-to-end at the route layer via server/test/reviewRoutes.test.ts (5 app.inject regressions against the real GET /api/review/queue handler), isolated via STUDYLOOP_CONFIG_DIR + two fs.mkdtemp roots + dynamic `await import()` of every StudyLoop module in beforeAll — no static `import ... from "../src/..."` line anywhere in the file, verified by grep. No server/src changes (test-only plan, hard constraint honored). REQUIREMENTS.md's GATE-01 checkbox stays Pending: 03-03-PLAN.md also declares GATE-01 and hasn't run yet — same shared-ID gate (#2388) precedent as ANLZ-01/ANLZ-02.
- [2026-08-10 Phase 3 P02] COMP-01's two unguarded edges pinned (dismiss-outranks-userTake, empty-Dismissed-section truthfulness) and COMP-02/SC5 pinned as a cross-renderer parity test deriving its expected seek-link from renderNotesTokens rather than hardcoding it a second time. Renderer's analysisUnits/analysisConcepts mutual exclusivity under 'Concept breakdown' meant the parity test uses two renderCompiledDocument calls sharing one derived expectedLink, not the single call the plan described (test-authoring correction, no server/src change). Test-only plan, hard constraint honored (git diff --name-only -- server/src == 0). REQUIREMENTS.md's COMP-01/COMP-02 checkboxes stay Pending: 03-03-PLAN.md also declares both and hasn't run yet — shared-ID gate (#2388) precedent.
- [2026-08-10 Phase 3 P03] SPEC.md's F11 'Cards' and V3-B 'B4' sections corrected to the shipped attestation gate (813dc21, 468e0b8) via two 'Implementation notes' blocks in SPEC.md's own in-file convention; the model-source-analysis-is-sufficient clause is gone. REQUIREMENTS.md's GATE-01, GATE-02, COMP-01, COMP-02 entries now carry provenance parentheticals (PIPE-01 format); this is the final declaring plan for GATE-01/COMP-01/COMP-02 (shared-ID gate #2388) — all four Phase 3 checkboxes flip to Complete. Zero server/src or web/src changes across the whole phase.
- [2026-08-10 Phase 4 P01] Isolated proof harness (STUDYLOOP_CONFIG_DIR=~/.studyloop-proof-2026-08-10, dataDir=~/StudyLoopProof-2026-08-10, ports 4620/4621) stood up and isolation-asserted before any UI interaction; smoke project 5b9601fd-4f6b-45b2-b5b9-b1b28504524b created entirely through the real browser UI with a 612-segment transcript via the yt-dlp caption fallback. Lecture content gate cleared COMMIT (4/5 topics Taught: PEEP, FiO2, pressure support, CPAP; SIMV absent). Rejected ardsnet.org for the independent deck on a genuine TLS hostname mismatch rather than bypass with curl -k; sourced CDC/NHSN's Chapter 10 VAE Protocol PDF instead (44 pages, real text layer, public-domain government work) via gstack browse's real-browser download path since CDC's Akamai edge 403s a bare curl UA. Concept doc authored with 4 anchored cards spanning 0:22-8:22 so watchedUpTo will be observable in 04-0x's compiled export.
- [2026-08-10 Phase 4 P02] D-03's verbatim-anchor verifier committed: server/src/lib/anchorVerify.ts (pure, 20-test-covered) + server/src/scripts/verifyAnchors.ts (tsx CLI, exit-code gate) — placed inside server/tsconfig's src/test include list rather than D-03's suggested server/scripts/ or scripts/ (both outside typecheck/test surfaces), documented as a deliberate deviation. Cross-validated read-only against the real 2026-08-08 proof project: 51 checked (29 unit anchors/11 edge quotes/11 pearl timestamps), 49 exact, 0 normalized, **2 genuine violations** — both edge quotes are ellipsis-joined non-contiguous caption spans, confirmed by locating each half at separate offsets, not a verifier bug and not tuned away. This disagrees with the 2026-08-08 report's "0 violations, all 33 anchors exact substrings" claim on a strict-substring reading — 04-05 should read 04-02-SUMMARY.md's "Issues Encountered" before restating that claim. Full server suite 1047/1047 (1027 baseline + 20 new), typecheck clean. REQUIREMENTS.md's PROOF-01 checkbox stays Pending: 04-01/04-03/04-04/04-05 also declare PROOF-01 and haven't all run yet — same shared-ID gate (#2388) precedent as prior phases.
- [2026-08-10 Phase 4 P03] Proof project 41b2d9ea-a4b1-428a-b09a-7065ed3dee1f created via real UI paste-then-submit (2 actions), independent CDC/NHSN deck attached through SlidesRow's own control (44 pages/0 empty, no separate fold-in toggle exists — confirmed via source read), and a real zai/glm-5 clinical analysis run via the Analyze pill (schema v3, source=model, 18 units/8 pearls/18 concepts/4 themes/8 edges/74 anchors, 4m35s wall-clock). Zero UI workarounds needed across all three tasks (SC1's clean-PASS bar). 3 new findings (F-03 branch-attribution confidence, F-04 slide-extraction char-count drift ~3.3%, F-05 zero evidence:both units) recorded honestly for 04-05's adversarial pass rather than smoothed over. Zero server/src or web/src files touched.
- [2026-08-10 Phase 4 P04] Full attestation lifecycle exercised on the proof project: 8/18 units attested (6 take→reveal→attest, 1 skip-path, 1 attested-then-edited via Edit/Save), 1 dismissed, 1 dismissed-then-undone (round-trips to true untouched via DELETE), 9 untouched. All four PROOF-02 session-content paths populated through their own UI affordance: notes (3, real seek tokens), captures (3, 2 captioned + 1 deliberately left uncaptioned), concept doc attached with watchedUpTo capped at 339s producing a genuine "Covered 2/4" partial split (not all-or-nothing). Compile+export verified byte-identical to the on-disk file, every session-content section rendering real content with zero empty-state placeholders. 3 new findings (F-06 browse-tooling ref ambiguity against this app's intentionally-duplicated UnitProposalCard DOM; F-07 concept-doc attach requires an undiscovered prior Settings step; F-08 mine-this-moment's async landing delay) recorded honestly, none smoothed over. Zero server/src or web/src files touched.
- [2026-08-10 Phase 4 P05 Tasks 1-3] **Harness isolation** (recap, decided in P01): STUDYLOOP_CONFIG_DIR-scoped config + dataDir kept the run's review.json (data-root-wide scheduling state) from mixing into Ryan's real review queue — necessary because F11's review state has no per-project scoping; re-asserted via GET /api/config at the start of every 04-0x plan including this one, real config checksum confirmed byte-unchanged throughout the whole phase. **Lecture** (recap, P01): MedCram "2 of 5" — chosen on real transcript evidence (COMMIT, 4/5 topics Taught: PEEP/FiO2/pressure-support/CPAP; SIMV absent but never name-dropped-and-abandoned, unlike the 2026-08-08 lecture), closing that prior report's title/content-mismatch gap (item 7). **Deck** (recap, P01): CDC/NHSN Chapter 10 VAE Protocol PDF, genuinely independent (different author, audience, and purpose than the lecture) — closes the 2026-08-08 slides-PASS circularity caveat. **Verifier placement deviation** (recap, P02): `server/src/lib/anchorVerify.ts` + `server/src/scripts/verifyAnchors.ts` rather than D-03's suggested `server/scripts/`/`scripts/`, to stay inside the typecheck/test surfaces — unchanged this plan, verifier used exactly as committed.
  **New this plan — the adversarial pass found a genuine, previously-undetected fidelity defect:** the committed verifier (built specifically to close D-03's "unbacked claim" gap) found 32/82 anchor checks (39%) fail strict verbatim matching against this run's captions.json — a much higher rate than 04-02's 2/51 (4%) cross-validation against the clean-caption 2026-08-08 project. Manual re-investigation (not verifier tuning — the committed verifier's numbers are reported unmodified) traced this to two causes: (1) this lecture's yt-dlp auto-captions are YouTube's un-deduplicated "rolling" cumulative format (F-09, a per-video caption-track difference, not a regression — confirmed by comparing against the 2026-08-08 project's clean captions.json using the identical parser), and (2) 10 of 18 units genuinely carry anchor timestamps drifted from their true spoken position by 0-282 seconds (F-10), including both DOSAGE safety-tier units (40s and 160s drift — the numeric values themselves are exact, only the pointer is wrong). One chunk-overlap near-duplicate (F-11) escaped ANLZ-01's anchor-time-aware dedup specifically because its own anchor is one of the F-10-drifted ones. **Zero hallucinated or clinically-wrong claims were found** across all 18 units/8 pearls/8 edges (100% audit coverage, since 0 items carried the enrichment flag to pre-exclude) — the defect is anchor-pointer fidelity, not content truthfulness. SC3's review-queue cross-check is clean: 18/18 tracked+due cards resolve to a feedable attestation entry, 0 violations, reviewExport gate-inheritance independently confirmed consistent.
  **Run outcome by mode** (dated report, `docs/REAL-LECTURE-PROOF-2026-08-10.md`): Setup CONDITIONAL (7/10 — zero manual workaround, but F-09's caption duplication is visible in the transcript pane), Slides CONDITIONAL (8/10 — genuinely independent deck, clean mechanics, but 0/18 units evidence:"both" vs the 2026-08-08 proof's 12/16, so "demonstrably firing" is technically-wired-in but not empirically shown), Clinical CONDITIONAL (6/10 — zero hallucinations, but F-10's anchor drift is the dominant defect), Document mode + compile CONDITIONAL (7/10 — attestation lifecycle and all four PROOF-02 paths are a clean PASS on their own, but the compiled document's Concept-breakdown links inherit F-10's wrong anchors for 6 of 8 attested units). **Overall: CONDITIONAL PASS**, not the clean PASS the phase set out to prove.
  **REQUIREMENTS.md checkboxes**: PROOF-01 stays open (unchecked) with a provenance note — "all anchor quotes verbatim-verified" and "Setup is no longer CONDITIONAL" are not supported by this run's evidence, per T-04-14's mitigation (checkboxes flip only on a supporting verdict). PROOF-02 flips to Complete — its own claim (four session-content paths exercised and verified in the compiled export) is fully proven and untouched by the anchor-drift finding, since notes/captures use learner-driven real-time seek positions, not model-generated anchors.
  **Phase 5 entry gate — explicitly checked, not assumed:** ROADMAP's Phase 5 depends on "documented real-use extraction-accuracy evidence beyond the Phase 4 proof run." **This gate is NOT satisfied by Phase 4 alone** — this proof run itself surfaced a real, previously-unknown extraction-accuracy defect (F-10's anchor-timestamp drift) rather than establishing a clean accuracy baseline to build on. Phase 5 (DPTH-01/02/03, a prerequisite graph and cross-video lesson composer that depends on accurate concept extraction across a library) should not start until either (a) F-10 is root-caused and fixed with regression coverage, or (b) a separate real-use accuracy study (beyond this single proof project) is conducted and documented, per SPEC V3-D's deferral condition and FEATURE-REVIEW's identical gate. Recorded here as a blocker, not a recommendation — the gate is Ryan's call at the Phase 4→5 transition, but the evidence to make that call honestly is now on record.
  **Watch items carried forward for Phase 5+:** (1) F-10's anchor-timestamp drift and its root cause in `analysis.ts`'s chunk-to-unit pipeline — not investigated to a specific code location in this adversarial-verification pass, deliberately out of scope (this plan reports, it does not patch production code — matches 04-01/04-03/04-04's zero-server/src-touched pattern); (2) F-09's rolling-caption non-dedup in `captionParse.ts`/`ytdlp.ts` — likely the root enabler of F-10's drift measurement difficulty, same scope boundary; (3) F-11's near-duplicate-escapes-dedup mechanism, likely resolved as a side effect of fixing F-10 but not confirmed; (4) F-05's 0/18 evidence:"both" units — unresolved between "genuine topical narrowness" and "labeling-fidelity gap," worth a second genuinely-overlapping-deck test to disambiguate; (5) `pullYoutubeTranscript`'s no-fallback lazy caption pull (carried from Phase 1, still open, see Blockers below).

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 5 entry gate: requires documented real-use extraction-accuracy evidence beyond the Phase 4 proof run — check the gate, don't assume it. **Checked (Phase 4 P05): NOT satisfied** — the proof run itself surfaced a new extraction-accuracy defect (F-10, anchor-timestamp drift up to ~282s on 10/18 units) rather than a clean baseline. Do not start Phase 5 until F-10 is fixed with regression coverage or a separate accuracy study is documented.
- **F-10 (new, Phase 4 P05): 10/18 units in the 2026-08-10 proof analysis carry anchor timestamps drifted 0-282s from their true spoken position, including both DOSAGE safety-tier units — root cause not yet investigated in application code (candidates: how the model reads `[mm:ss]`-prefixed chunk-prompt lines, or a step in `analysis.ts`'s chunk-to-unit pipeline). See `docs/proof-evidence-2026-08-10/FINDINGS.md` F-10 and `docs/REAL-LECTURE-PROOF-2026-08-10.md`.**
- `server/src/lib/analysis.ts` is 1968 lines; Phase 2 merge-pass surgery should extract chunking/merge modules first rather than patch in place (codebase/CONCERNS.md)
- Attestation mutations are optimistic without rollback on the web side — Phase 3 work touching attestation flows must not deepen that pattern (codebase/CONCERNS.md)
- 2026-08-08 slides PASS was partially circular (deck text manufactured from transcript) — Phase 4 must use a genuinely independent deck
- Only 1 Playwright e2e spec exists; the proof re-run (Phase 4) is manual+adversarial by design, but new pipeline behavior in Phases 1-3 needs unit coverage per the SPEC quality bar
- `pullYoutubeTranscript` in `server/src/lib/transcriptChain.ts:116-127` (chain step 3, the lazy caption pull) calls `resolveVideo` with no yt-dlp fallback, so a project that reaches that path on an Innertube-transcript-blocked network still gets nothing. Not in Phase 1 scope (PIPE-01 and ROADMAP SC1 both describe the paste-a-URL flow, which `routes/youtube.ts` owns), and wiring a 30s subprocess into a lazily-hit read path is a behavior change no success criterion asks for. Flag it as a Phase 4 proof-run watch item.

## Deferred Items

Items acknowledged and carried forward:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Discovery | "Learn X" typed goal object (V3-C P2) | v2 — gated on typed-analysis accuracy | 2026-08-09 ingest |
| Notes | Optional note structures (Cornell, claim-evidence, mechanism chain) | v2 | 2026-08-09 ingest |
| Resilience | Backup/export-to-zip; attestation rollback; global concept search | v2 — from codebase concerns | 2026-08-09 ingest |

## Session Continuity

Last session: 2026-08-10T19:19:00.000Z
Stopped at: Completed 04-04-PLAN.md
Resume file: None
