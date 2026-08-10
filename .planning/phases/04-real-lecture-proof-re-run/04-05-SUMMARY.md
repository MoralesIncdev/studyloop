---
phase: 04-real-lecture-proof-re-run
plan: 05
subsystem: testing
tags: [adversarial-verification, anchor-fidelity, real-lecture-proof, dated-report, ci, checkpoint]

requires:
  - phase: 04-real-lecture-proof-re-run
    provides: "04-01's isolated harness + content-gated lecture + independent deck; 04-02's committed anchor verifier; 04-03/04-04's full proof run (project 41b2d9ea-a4b1-428a-b09a-7065ed3dee1f) with a real clinical analysis, full attestation lifecycle, and all four PROOF-02 session-content paths"
provides:
  - "anchor-verification-report.{json,md}: the committed verifier's real, unmodified output against this run's proof project (82 checked, 50 exact, 0 normalized, 32 violations)"
  - "Three adversarial audit artifacts: verification/safety-value-audit.md, verification/hallucination-audit.md, verification/review-queue-crosscheck.json — every claim independently re-derived and cited, not asserted"
  - "Three new MAJOR findings (F-09/F-10/F-11) discovered by manual investigation of the verifier's violations: rolling-caption non-dedup, anchor-timestamp drift up to ~282s on 10/18 units, and one near-duplicate that escaped ANLZ-01's dedup as a direct consequence"
  - "The dated report docs/REAL-LECTURE-PROOF-2026-08-10.md — per-mode verdicts (all four CONDITIONAL), deck provenance, harness isolation note, fidelity findings, PROOF-02 section, then-and-now table against all 7 2026-08-08 bugs, evidence index"
  - "Green CI (1047 server + 357 web) and a secret-free evidence directory (43 files scanned, 0 credential matches)"
  - "REQUIREMENTS.md provenance: PROOF-02 flipped Complete; PROOF-01 stays open with a detailed provenance note, following the evidence rather than the phase's ambitions"
affects: []

actuals:
  tokens: 58000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Manual re-verification of a mechanical verifier's violations: re-locate every flagged quote against the raw transcript independently, distinguishing 'mechanical match failure' (caption-format artifact) from 'content is actually wrong' (hallucination) — the former was the dominant cause this run, not the latter"
    - "Drift-table methodology for anchor-timestamp fidelity: compute a claimed-vs-true-position delta per anchor via first-N-words fuzzy matching against a reconstructed rolling-caption timeline, without touching the committed verifier's own tolerance/normalization logic"

key-files:
  created:
    - docs/proof-evidence-2026-08-10/verification/safety-value-audit.md
    - docs/proof-evidence-2026-08-10/verification/hallucination-audit.md
    - docs/proof-evidence-2026-08-10/verification/review-queue-crosscheck.json
    - docs/proof-evidence-2026-08-10/anchor-verification-report.json
    - docs/proof-evidence-2026-08-10/anchor-verification-report.md
    - docs/proof-evidence-2026-08-10/run/review-queue-response.json
    - docs/proof-evidence-2026-08-10/run/review-state.json
    - docs/REAL-LECTURE-PROOF-2026-08-10.md
  modified:
    - docs/proof-evidence-2026-08-10/RUN-MANIFEST.md
    - docs/proof-evidence-2026-08-10/FINDINGS.md
    - .planning/REQUIREMENTS.md
    - .planning/STATE.md

key-decisions:
  - "Reported the committed verifier's numbers exactly as produced (82 checked, 50 exact, 0 normalized, 32 violations) with zero tolerance/normalization adjustment, per the plan's explicit instruction — even though the 39% violation rate is far higher than 04-02's 4% cross-validation baseline"
  - "Manually re-verified all 32 violations against the raw transcript rather than accepting the mechanical fail as evidence of hallucination — found the true cause is two real, distinct, evidence-backed defects (F-09 caption-format duplication, F-10 anchor-timestamp drift), not fabricated content; content is 100% grounded across all 18 units/8 pearls/8 edges"
  - "Marked all four modes CONDITIONAL rather than rounding any to PASS — Document mode's own attestation-lifecycle and PROOF-02 mechanics are individually clean, but the compiled document's Concept-breakdown section inherits Clinical mode's drifted anchors for 6 of 8 attested units, so it cannot be a clean PASS on its own artifact"
  - "PROOF-02 flipped Complete on its own narrower, independently-provable claim (session-content paths, which use learner-driven real-time seek positions, not model-generated anchors) while PROOF-01 stayed open — the two requirements' evidence bases are genuinely separable, not one blanket verdict"
  - "Did not attempt to root-cause or fix F-09/F-10/F-11 in server/src — adversarial verification and honest reporting were this plan's job, not pipeline engineering; explicitly flagged for Phase 5+ investigation and recorded as a Phase 5 entry-gate blocker in STATE.md"

patterns-established:
  - "When a committed verifier's mechanical result disagrees sharply with a prior manual claim, the executor's job is to investigate WHY before writing the report — not to average the two claims, not to silently trust either, and not to patch the verifier to make the disagreement go away"

requirements-completed: [PROOF-02]

coverage:
  - id: D1
    description: "Adversarial verification pass: the committed verifier ran against the real proof project and its report exists in both formats with unmodified numbers; safety-value, hallucination, and review-queue-crosscheck artifacts each exist with substantive, citable content; the queue cross-check proves 0 violations"
    requirement: "PROOF-01"
    verification:
      - kind: other
        ref: "node verify script embedded in 04-05-PLAN.md Task 1 <verify> — checks>=10, crosscheck has a cards array, every card resolves to a feedable attestation entry, all four audit files exist and exceed 200 chars"
        status: pass
    human_judgment: true
    rationale: "The verifier's 32 violations required a human-judgment call on whether they represent hallucination (they don't, per the manual re-verification in hallucination-audit.md) versus a genuine new fidelity defect (they do, F-10) — an automated pass/fail on violation count alone would have produced either a false-alarm FAIL or a falsely-clean PASS; Ryan should read the fidelity-findings section before treating the anchor-drift conclusion as settled."
  - id: D2
    description: "Dated report written with per-mode verdicts, deck provenance, harness isolation, PROOF-02 section, then-and-now table, and evidence index, with the verifier's counts quoted unchanged"
    requirement: "PROOF-01"
    verification:
      - kind: other
        ref: "node verify script embedded in 04-05-PLAN.md Task 2 <verify> — all required content markers present, verdicts present, verifier counts (82) quoted in the report, RUN-MANIFEST.md records the report path, no unfilled placeholders"
        status: pass
    human_judgment: false
  - id: D3
    description: "CI is green (root typecheck + full test suite) and the evidence directory is secret-free; REQUIREMENTS.md's PROOF-01/PROOF-02 checkboxes and traceability rows match the report's verdicts, not the phase's ambitions"
    requirement: "PROOF-01"
    verification:
      - kind: other
        ref: "npm run typecheck && npm test (1047 server + 357 web, matching baseline) && embedded secret-scan script in 04-05-PLAN.md Task 3 <verify> — 43 evidence files scanned, 0 credential matches"
        status: pass
    human_judgment: false
  - id: D4
    description: "PROOF-02's session-content claim is fully and cleanly proven, independent of the anchor-drift finding"
    requirement: "PROOF-02"
    verification:
      - kind: other
        ref: "docs/REAL-LECTURE-PROOF-2026-08-10.md's PROOF-02 section, cross-referencing run/notes.md, run/bubbles.json, run/project-before-compile.json, and the byte-identical compiled export"
        status: pass
    human_judgment: false
  - id: D5
    description: "Ryan's sign-off at the blocking checkpoint — read the report and confirm the CONDITIONAL verdicts and the open PROOF-01 checkbox are not overstated or understated"
    verification: []
    human_judgment: true
    rationale: "T-04-14's mitigation requires an explicit human confirmation that the requirement checkboxes match the evidence — this is the entire point of the blocking checkpoint and cannot be self-certified by the executor."

duration: 55min
completed: 2026-08-10
status: halted
---

# Phase 4 Plan 5: Adversarial Verification, Dated Report, CI + Provenance Summary

**Ran the committed verbatim-anchor verifier against the real proof analysis, found a 39% mechanical violation rate (32/82) driven by two genuine new defects — un-deduplicated rolling-caption text (F-09) and anchor timestamps drifted up to 282 seconds on 10 of 18 units including both safety-tier DOSAGE cards (F-10), plus a near-duplicate that escaped Phase 2's dedup as a direct consequence (F-11) — confirmed zero hallucinated or clinically-wrong claims across all 18 units/8 pearls/8 edges, cleanly proved the SC3 review-queue gate and all four PROOF-02 session-content paths, wrote the dated report with all four modes marked CONDITIONAL (overall CONDITIONAL PASS, not a clean PASS), and left PROOF-01's checkbox open while flipping PROOF-02 to Complete — now paused at the Task 4 blocking checkpoint for Ryan's sign-off.**

## Performance

- **Duration:** ~55 min
- **Started:** 2026-08-10T19:20:00Z (approx, first Read of PLAN.md)
- **Completed (Tasks 1-3):** 2026-08-10T20:15:00Z (approx, Task 3 final commit) — Task 4 (blocking checkpoint) is pending Ryan's response, not yet resolved
- **Tasks:** 3/4 complete (Task 4 is the blocking checkpoint itself)
- **Files modified:** 8 created, 4 modified

## Accomplishments

- **The committed verifier (D-03) did exactly what it was built for — it caught a real defect the 2026-08-08 proof's manual check structurally could not have caught.** Run against this run's real proof project: 82 checked (66 unit anchors, 8 edge quotes, 8 pearl timestamps), 50 exact, 0 normalized, **32 violations** — reported with zero tolerance/normalization adjustment, exactly as the plan requires. That's a 39% violation rate versus 04-02's 4% (2/51) cross-validation against the clean-caption 2026-08-08 project.
- **Manual re-verification of all 32 violations found zero hallucinations — and traced the real cause to two distinct, evidence-backed defects.** F-09: this lecture's yt-dlp auto-captions are YouTube's un-deduplicated "rolling" cumulative format (confirmed by comparing the identical parser's output against the clean 2026-08-08 project's captions.json — a per-video format difference, not a regression). F-10: 10 of 18 units genuinely carry anchor timestamps drifted from their true spoken position by 0 to ~282 seconds (4m42s), growing with distance into the lecture — including both clinical safety-tier DOSAGE units (40s and 160s drift; the numeric values themselves are exact, only the pointer is wrong). F-11: one chunk-overlap near-duplicate (`vent-parameters-and-gas-exchange`) escaped ANLZ-01's anchor-time-aware dedup specifically because its own drifted anchor never lands near its true-position duplicate's correct one.
- **Zero hallucinated or clinically-wrong claims across the entire analysis.** All 18 units, 8 pearls, and 8 edges were audited (100% coverage — 0 items carried the enrichment flag to pre-exclude anything) and every claim traces to real, accurately-represented spoken content — `verification/hallucination-audit.md`. Both DOSAGE safety-tier values are exact, digit-for-digit — `verification/safety-value-audit.md`.
- **SC3's review-queue gate is cleanly, completely proven.** `verification/review-queue-crosscheck.json`: 18/18 tracked+due cards (8 attested units, 4 linked pearls, 3 learner-authored bubbles, 4 cluster-member cards) resolve to a feedable attestation entry under the shipped predicate, 0 violations, no un-attested pearl or cluster-member card present. `GET /api/review/export.csv` was independently confirmed consistent with the queue (same 18-card set) — no reviewExport gate-inheritance gap.
- **The dated report (`docs/REAL-LECTURE-PROOF-2026-08-10.md`) follows the evidence, not the phase's ambitions.** Per-mode table: Setup, Slides, Clinical, and Document mode + compile are all marked **CONDITIONAL** (7/10, 8/10, 6/10, 7/10) — overall **CONDITIONAL PASS**. Includes the deck's D-02 provenance (genuinely independent CDC/NHSN work, closing the 2026-08-08 slides-circularity caveat), the harness isolation rationale, a full then-and-now table against all seven 2026-08-08 bugs (six held cleanly, one — Bug 3's dedup — re-emerged in a narrower form via F-11), the PROOF-02 session-content section (a clean pass on its own, unaffected by the anchor-drift finding), and an evidence index.
- **CI is green and the evidence directory is secret-free.** Root typecheck clean; full suite 1047 server + 357 web (matching baseline); 43 evidence files scanned against the real configured provider key, 0 matches; proof harness config file confirmed absent from the repo.
- **REQUIREMENTS.md reflects exactly what was proven.** PROOF-02 flips to Complete — its own claim (four session-content paths, which use learner-driven real-time seek positions, not model-generated anchors) is fully and separately proven, untouched by the anchor-drift finding. **PROOF-01 stays open (unchecked)** with a detailed provenance note: "all anchor quotes verbatim-verified" and "Setup is no longer CONDITIONAL" are not supported by this run's evidence.

## Task Commits

Tasks 1-3 were committed atomically; Task 4 is the blocking checkpoint and has no code/doc commit of its own:

1. **Task 1: Adversarial verification pass — anchors, safety values, hallucinations, and the review-queue gate (SC2, SC3)** - `f0bc8ce` (feat)
2. **Task 2: Write the dated adversarial proof report (SC5, D-01, D-02, D-03)** - `880d0c6` (docs)
3. **Task 3: CI green, requirement provenance, and a secret-free evidence commit** - `7e17d74` (docs)

**Plan metadata:** committed alongside this SUMMARY (see final commit below)

## Files Created/Modified

- `docs/proof-evidence-2026-08-10/anchor-verification-report.json` / `.md` - the committed verifier's real, unmodified output (82 checked, 50 exact, 0 normalized, 32 violations)
- `docs/proof-evidence-2026-08-10/verification/safety-value-audit.md` - digit-by-digit audit of both DOSAGE safety-tier units, including the anchor-drift caveat
- `docs/proof-evidence-2026-08-10/verification/hallucination-audit.md` - full per-item grounding table for all 18 units, 8 pearls, 8 edges
- `docs/proof-evidence-2026-08-10/verification/review-queue-crosscheck.json` - SC3's proof that all 18 tracked/due cards resolve to a feedable attestation entry
- `docs/proof-evidence-2026-08-10/run/review-queue-response.json` / `run/review-state.json` - raw evidence-capture snapshots backing the crosscheck
- `docs/REAL-LECTURE-PROOF-2026-08-10.md` - the dated adversarial proof report
- `docs/proof-evidence-2026-08-10/RUN-MANIFEST.md` - Task 1 and Task 2 sections appended (adversarial verification, dated report)
- `docs/proof-evidence-2026-08-10/FINDINGS.md` - F-09/F-10/F-11 appended (all MAJOR) plus the reviewExport gate-inheritance observation
- `.planning/REQUIREMENTS.md` - PROOF-01/PROOF-02 provenance notes and traceability rows updated to match the report's verdicts
- `.planning/STATE.md` - decision log entry, Phase 5 entry-gate assessment (NOT satisfied), F-10 added to Blockers/Concerns, current position updated to reflect the pending checkpoint

## Decisions Made

See `key-decisions` in frontmatter. The central editorial call this plan made: when a mechanical verifier disagrees sharply with a prior (unbacked) manual claim, the job is to investigate why before writing anything down — not average the two claims, not trust either blindly, and not adjust the verifier to make the disagreement disappear. That investigation is what turned "32 violations" into two named, evidence-backed findings (F-09, F-10) rather than either a false "everything's fine" or a false "everything's hallucinated."

## Deviations from Plan

### Auto-fixed Issues

None — this plan is entirely investigation, verification, and reporting. No production code was touched (zero `server/src`/`web/src` files modified), matching every other 04-0x plan's pattern. The extensive manual root-cause work on F-09/F-10/F-11 was explicitly instructed by the plan's own Task 1 body ("do not adjust tolerance or normalization after seeing the result" implies investigating, not silently patching) — not a deviation, the intended adversarial-verification work.

---

**Total deviations:** 0 auto-fixed
**Impact on plan:** None — plan executed as written. The 32-violation result was unexpected (04-02's cross-validation found only 2/51), which drove significantly more investigative work than a routine run would have needed, but that investigation is exactly what Task 1's instructions call for.

## Issues Encountered

- **The anchor verifier's 32 violations (39%) were far higher than 04-02's 4% cross-validation baseline**, and manual investigation was required to determine whether this meant hallucination, a verifier limitation, or a genuine new pipeline defect. Root-caused (not fixed) to two distinct, real issues: F-09 (this lecture's rolling-caption format) and F-10 (genuine anchor-timestamp drift, up to 4m42s, on 10/18 units). Neither was investigated to a specific line of application code — that is explicitly out of this plan's scope (adversarial verification and reporting, not pipeline engineering) and is recorded as a Phase 5 entry-gate blocker in STATE.md.
- **The Document-mode verdict required tracing a cross-mode dependency**: the compiled document's own "Concept breakdown" section (COMP-02's clickable anchor links) renders the same drifted timestamps Clinical mode's anchors carry, for 6 of 8 attested units. This meant Document mode could not be marked a clean PASS purely on its own mechanics (attestation lifecycle + PROOF-02 paths, both genuinely clean) — its compiled artifact inherits Clinical mode's defect. Recorded explicitly in the report rather than scored independently of what the artifact actually contains.

## User Setup Required

None — no external service configuration required. The isolated proof harness and zai/glm-5 credentials were already in place from 04-01; this plan performed zero configuration changes and made zero requests against the real (non-isolated) `~/.studyloop`/`~/StudyLoop` data.

## Next Phase Readiness

- **Task 4 (the blocking checkpoint) is the only remaining step in this plan.** Ryan needs to read `docs/REAL-LECTURE-PROOF-2026-08-10.md`, spot-check the anchor-verification and safety-value evidence, review the compiled study document, and confirm the REQUIREMENTS.md checkboxes match the evidence before Phase 4 closes.
- **Phase 5's entry gate is explicitly NOT satisfied by this run** — this proof surfaced a new extraction-accuracy defect (F-10) rather than establishing a clean accuracy baseline. Recorded in STATE.md's Blockers/Concerns; Phase 5 should not start until F-10 is either fixed with regression coverage or a separate real-use accuracy study is documented, per ROADMAP's own gate language.
- **Five watch items carried forward for Phase 5+**, all recorded in STATE.md: F-10's root cause (not yet located in application code), F-09's rolling-caption-dedup fix, F-11's likely-but-unconfirmed resolution as a side effect of fixing F-10, F-05's unresolved evidence:"both"=0 ambiguity (worth a second, more topically-overlapping deck test), and the pre-existing `pullYoutubeTranscript` no-fallback lazy-caption-pull gap (carried from Phase 1).
- No blockers to returning the checkpoint itself — all automated verification for Tasks 1-3 passed, CI is green, and the evidence is secret-free.

## Self-Check: PASSED

All 8 created files confirmed present on disk; RUN-MANIFEST.md/FINDINGS.md/REQUIREMENTS.md/STATE.md modifications confirmed via `git diff`; all 3 task commit hashes (`f0bc8ce`, `880d0c6`, `7e17d74`) confirmed present in `git log --oneline`; `git diff --name-only` across all three commits confirmed zero `server/src`/`web/src` files touched; `npm run typecheck && npm test` reconfirmed green at self-check time (1047 server + 357 web).

---
*Phase: 04-real-lecture-proof-re-run*
*Completed: 2026-08-10 (Tasks 1-3; Task 4 checkpoint pending)*
