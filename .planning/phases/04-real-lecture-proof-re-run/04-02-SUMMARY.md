---
phase: 04-real-lecture-proof-re-run
plan: 02
subsystem: testing
tags: [anchor-verification, fidelity, zod, tsx-cli, vitest, real-lecture-proof]

requires:
  - phase: 04-real-lecture-proof-re-run
    provides: "04-01's isolated proof harness and preflight evidence (not consumed directly by this plan — this plan runs standalone, in parallel with the preflight, per PLAN.md's own objective note)"
provides:
  - "server/src/lib/anchorVerify.ts — pure, typed, unit-tested verifier that classifies unit anchors/edge quotes/pearl timestamps against a caption stream (exact/normalized/violation)"
  - "server/src/scripts/verifyAnchors.ts — committed, rerunnable tsx CLI producing anchor-verification-report.{json,md}, exit-code gate for 04-05"
  - "A committed artifact behind the 2026-08-08 report's 'all anchor quotes verbatim, 0 violations' claim, closing D-03's gap"
  - "A recorded, non-tuned disagreement with that prior claim (2 edge-quote violations) for 04-05 to carry forward"
affects: [04-05]

actuals:
  tokens: 7462
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Pure-module + I/O-owning-CLI split for a verification script: lib/anchorVerify.ts has zero filesystem/network/console dependency, server/src/scripts/verifyAnchors.ts owns all I/O — same DI-friendly shape as lib/analysis.ts's AnalysisLLMClient split"
    - "Multi-occurrence quote matching with tolerance-preferred selection: when a quote repeats in the caption stream, the classifier prefers whichever occurrence's segment start falls within tolerance of the anchor's own t, rather than naively taking the first textual match"
    - "Hard runtime assertion (not just documentation) that a report-writing CLI refuses to write into the source directory it read from"

key-files:
  created:
    - server/src/lib/anchorVerify.ts
    - server/src/scripts/verifyAnchors.ts
    - server/test/anchorVerify.test.ts
  modified: []

key-decisions:
  - "D-03 placement deviation: landed at server/src/lib/anchorVerify.ts + server/src/scripts/verifyAnchors.ts rather than D-03's suggested server/scripts/ or scripts/ — both of those sit outside server/tsconfig.json's include list (['src','test']), so a script placed there would be neither typechecked by CI nor importable from a Vitest test without config changes. This location keeps D-03's substance (small, committed, rerunnable script) inside the existing typecheck/test surfaces with zero config changes and zero new dependencies. Documented in both file header comments and here, per the plan's <placement_note> instruction."
  - "Report shape carries toleranceSec/results.{exact,normalized}/violations at the top level (matching what a CLI consumer scripts against directly) plus a totals.{units,edges,pearls,checked} breakdown for the markdown report's per-collection table — one flat JSON shape serves both the plan's own <verify> script and 04-05's future gate use without needing two report formats."
  - "Pearls (which carry a timestamp and no quote) are range-checked and, when valid, counted into results.exact rather than a separate bucket — keeps the report's own internal-consistency invariant (exact + normalized + violations === checked) true with a single flat counter pair instead of a third, mostly-redundant bucket."
  - "Cross-validation output directory defaults to CWD when --out is omitted, and a hard runtime guard (path containment check, not just a doc comment) throws if the resolved --out is the project directory or nested inside it — enforces T-04-07's mitigation as code, not convention."

patterns-established:
  - "verifyAnchors CLI invocation form for future proof runs: `cd server && npx tsx src/scripts/verifyAnchors.ts <projectDir> [--tolerance <seconds>] [--out <dir>]` — no build step, no new dependency (tsx already a server devDependency)."

requirements-completed: [PROOF-01]

coverage:
  - id: D1
    description: "anchorVerify module classifies unit anchors (exact/normalized/quote-not-found/time-drift), edge quotes (exact/normalized/quote-not-found, no time check), and pearl timestamps (range check / timestamp-out-of-range) against a caption stream, with a configurable tolerance (15s default) and no filesystem/network/console dependency"
    requirement: "PROOF-01"
    verification:
      - kind: unit
        ref: "server/test/anchorVerify.test.ts — 20 tests, one per behavior bullet in 04-02-PLAN.md Task 1 (describe blocks: unit anchors, edge quotes, pearl timestamps, tolerance parameter, empty inputs, report totals, schema reuse)"
        status: pass
    human_judgment: false
  - id: D2
    description: "verifyAnchors CLI (tsx, no build step) reads a project's analysis.json + captions.json, writes anchor-verification-report.json + .md to a caller-specified output directory, refuses (hard runtime assertion) to write into the project directory being read, and exits non-zero on any violation"
    requirement: "PROOF-01"
    verification:
      - kind: other
        ref: "npm run test -w server -- anchorVerify (20/20 pass) && npm run typecheck -w server (clean); manual invocation of the guard case (--out set to the project dir itself) confirmed it throws and exits 1 before writing anything"
        status: pass
    human_judgment: false
  - id: D3
    description: "Cross-validation run against the real 2026-08-08 proof project (~/StudyLoop/projects/2852bce9-cb76-4849-ad44-82ce98db8ed1), read-only, output to the session scratchpad, source project directory confirmed untouched (same file listing/mtimes before and after)"
    requirement: "PROOF-01"
    verification:
      - kind: other
        ref: "Plan's own embedded <verify> node script (04-02-PLAN.md Task 2) — asserts toleranceSec present, violations is an array, checks>=30, and that no anchor-verification* file exists inside the source project directory after the run"
        status: pass
    human_judgment: true
    rationale: "The cross-validation surfaced a genuine disagreement with the 2026-08-08 report's '0 violations' claim (2 edge-quote violations, see Deviations/Issues below). Per D-03/T-04-08 this was investigated once and confirmed as a real finding, not tuned away — but whether that finding changes the Phase 4 report's overall verdict is an editorial call for 04-05, not this plan, so a human (04-05's author) should read this SUMMARY's finding before treating the anchor-fidelity claim as settled."

duration: 25min
completed: 2026-08-10
status: complete
---

# Phase 4 Plan 2: Committed Verbatim-Anchor Verifier Summary

**Built `server/src/lib/anchorVerify.ts` (pure, 20-test-covered classifier) + `server/src/scripts/verifyAnchors.ts` (tsx CLI, no build step), cross-validated read-only against the real 2026-08-08 proof project — 49/51 anchors exact, 0 normalized, 2 edge-quote violations that are ellipsis-joined non-contiguous excerpts, a genuine and non-tuned disagreement with the prior report's "0 violations" claim.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-08-10T13:22:00 (approx, first Read of PLAN.md)
- **Completed:** 2026-08-10T13:47:00 (approx, final commit)
- **Tasks:** 2/2
- **Files modified:** 3 created, 0 modified

## Accomplishments

- **A committed, tested, rerunnable artifact now backs the 2026-08-08 report's strongest fidelity claim.** `server/src/lib/anchorVerify.ts` is a pure, typed module (zero filesystem/network/console dependency) that classifies every unit anchor, edge quote, and pearl timestamp against a project's caption stream as exact, whitespace/case-normalized, or a violation (`quote-not-found` / `time-drift` / `timestamp-out-of-range`), with a configurable tolerance (15s default, matching the prior manual check's window). 20 unit tests cover every behavior bullet from the plan, including a multi-occurrence quote case (a repeated phrase in two segments, where the classifier correctly prefers the occurrence within tolerance of the anchor's own timestamp over the first textual match).
- **A thin, gate-ready CLI wraps it with zero build step.** `server/src/scripts/verifyAnchors.ts` runs via `npx tsx` (tsx is already a devDependency), reads `analysis.json`/`captions.json` from a project directory, writes both a JSON and a markdown report to a caller-specified `--out` directory, prints a one-line summary, and exits non-zero on any violation — ready to act as 04-05's adversarial verification gate. A hard runtime assertion (path-containment check, not just a comment) refuses to write into the project directory being read.
- **Cross-validated read-only against the real 2026-08-08 proof project**, output written to the session scratchpad — the source project directory (`~/StudyLoop/projects/2852bce9-cb76-4849-ad44-82ce98db8ed1/`) is confirmed byte-for-byte untouched (identical file listing and mtimes before/after). Result: **51 checked** (29 unit anchors, 11 edge quotes, 11 pearl timestamps) — **49 exact, 0 normalized, 2 violations**.
- **The 2 violations are a genuine, investigated, non-tuned finding, not a verifier bug.** Both are edge quotes built by ellipsis-joining two non-contiguous spans of the caption stream: `"pressure and volume are inversely proportional to themselves… the other way of looking at this is compliance"` (the two halves independently locate at caption offsets 8134 and 8307) and `"conversely if you were back in our previous mode which was assist control and you're setting a certain volume if the compliance of the lung dropped… the pressure would start to go up"` (offsets 11022 and 11214). Under a strict "exact substring of the caption stream" reading — the same standard the 2026-08-08 report's own claim asserts ("all 33 unit/edge anchor quotes are exact substrings") — an ellipsis-compressed, two-span quote is not a substring. No tolerance, normalization, or threshold was adjusted to make the run agree with the prior "0 violations" claim (per D-03/T-04-08, an unbacked prior claim being corrected is a legitimate outcome of building this tool).

## Task Commits

Each task was committed atomically (TDD RED/GREEN for Task 1):

1. **Task 1 RED: failing tests for anchorVerify module** - `a273ea3` (test)
2. **Task 1 GREEN: implement anchorVerify module** - `4227c9c` (feat)
3. **Task 2: verifyAnchors CLI, cross-validated against 2026-08-08 proof project** - `dfcbb73` (feat)

**Plan metadata:** committed alongside this SUMMARY (see final commit below)

## Files Created/Modified

- `server/src/lib/anchorVerify.ts` - Pure, typed classifier: `buildCaptionIndex`, `verifyAnchors`, `parseAnalysisInput`/`parseCaptionsFile` (reusing `AnalysisSchema`/`TranscriptSegmentSchema`), report/violation types. No I/O.
- `server/src/scripts/verifyAnchors.ts` - tsx CLI: arg parsing (`<projectDir> [--tolerance N] [--out dir]`), project-dir write guard, JSON+markdown report writers, exit-code gate.
- `server/test/anchorVerify.test.ts` - 20 Vitest tests (factory-helper convention per TESTING.md), one per plan behavior bullet plus schema-reuse and totals-consistency checks.

## Decisions Made

- See `key-decisions` in frontmatter (D-03 placement deviation, report shape, pearl-counting-as-exact, hard output-directory guard).
- Used first-occurrence-preferring-tolerance-match rather than nearest-occurrence-by-distance for repeated quotes — simpler, deterministic, and sufficient for the behavior bullets tested; not expected to matter on real transcripts where anchor quotes are rarely verbatim-repeated at widely different timestamps.

## Deviations from Plan

### Auto-fixed Issues

None — no bugs, missing critical functionality, or blocking issues arose during implementation. The one substantive deviation (D-03 placement) was pre-authorized by the plan's own `<placement_note>` and is documented above as a key-decision, not an unplanned auto-fix.

---

**Total deviations:** 0 auto-fixed (the placement choice was plan-directed, not a deviation-rule fix)
**Impact on plan:** None — plan executed as written, including its explicitly pre-approved placement deviation.

## Issues Encountered

- **Cross-validation disagreement with the 2026-08-08 report (recorded per plan instruction, not a bug):** the run found 2 violations against a report that claimed 0. Investigated once (see Accomplishments above) and confirmed both are ellipsis-joined, non-contiguous edge quotes — a real fidelity nuance in the 2026-08-08 analysis output, not a verifier defect. Per the plan's explicit instruction, no threshold/tolerance/normalization was adjusted to force agreement. **Flagged for 04-05:** the Phase 4 report should either (a) note that 2 of the 33 previously-claimed-verbatim edges are ellipsis-compressed rather than literal substrings, or (b) decide whether ellipsis-joined multi-span quotes should count as a distinct non-violating category in a future verifier iteration — that's an editorial/design call for 04-05, not resolved here per this plan's own instruction not to tune the verifier to make a prior claim come out true.
- **Total anchor count differs from the prior report's "33" by design, not error:** the prior report's "33" counted only unit+edge anchors (29+11=40 by this run's count, itself higher than 33 — the analysis.json evidently carries more anchors now than the report's manual count captured). This verifier additionally checks all 11 pearl timestamps (not counted in the prior report's "33" at all), for a total of 51 checks. The plan's own `<verify>` script anticipates this (asserts `checks >= 30`, not `=== 33`) and passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **04-05 has a working, committed, exit-code-gating verifier** it can invoke directly: `cd server && npx tsx src/scripts/verifyAnchors.ts <projectDir> --out <dir>`.
- **04-05 should read the "Issues Encountered" section above before writing its own fidelity claims** — the 2026-08-08 report's specific "all 33 unit/edge anchor quotes are exact substrings" wording is not reproducible verbatim by this verifier (51 total checks now exist, and 2 of the edge quotes are ellipsis-compressed, not literal substrings); the re-run's own report should state its own verifier-backed numbers rather than repeating the 2026-08-08 phrasing.
- No blockers. No server/src files outside the three new files were touched; full server suite is 1047/1047 (baseline 1027 + 20 new tests), typecheck clean.

## Self-Check: PASSED

All 3 created files confirmed present on disk (`server/src/lib/anchorVerify.ts`, `server/src/scripts/verifyAnchors.ts`, `server/test/anchorVerify.test.ts`); all 3 task commit hashes (`a273ea3`, `4227c9c`, `dfcbb73`) confirmed present in `git log`.

---
*Phase: 04-real-lecture-proof-re-run*
*Completed: 2026-08-10*
