---
phase: 03-attestation-gate-compile-honesty
plan: 03
subsystem: docs
tags: [spec-md, requirements-traceability, attestation-gate, compile-honesty, provenance]

# Dependency graph
requires:
  - phase: 03-attestation-gate-compile-honesty
    provides: "03-01's route-level GATE-01 proof (server/test/reviewRoutes.test.ts, 5 app.inject regressions) and 03-02's COMP-01/COMP-02 edge-case + parity proof (server/test/compile.test.ts, 3 regressions) — this plan cites both by file name and case count in REQUIREMENTS.md"
provides:
  - "SPEC.md F11 'Cards' section corrected: the model-source-analysis-is-sufficient clause is gone; a two-path attestation gate (linked-unit-feedable, explicit 'Add to review') and the continuous legacy-card migration are documented"
  - "SPEC.md V3-B B4 section corrected: three-way compile partition (attested/Not-yet-reviewed/Dismissed), seek-link anchor convention, and attestation-gated pearl transformation, each citing its shipping commit"
  - ".planning/REQUIREMENTS.md carries provenance parentheticals on GATE-01, GATE-02, COMP-01, COMP-02 — closing the phase's four requirements"
affects: [04-real-lecture-proof-rerun]

# Actuals (#2632)
actuals:
  tokens: 2190
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SPEC.md's own 'Implementation notes (deviations from the literal wording above):' convention (F11's pre-existing Scheduling block) reused verbatim as the edit template for two more sections — additive annotation appended after the corrected prose, never a silent rewrite"
    - "REQUIREMENTS.md provenance parenthetical format (PIPE-01's line-12 precedent) extended to four more entries, distinguishing 'already shipped before this doc was authored' (GATE-01, COMP-01, COMP-02) from 'genuine doc-only delta' (GATE-02, which cites the edit itself rather than a commit hash)"

key-files:
  created: []
  modified:
    - SPEC.md
    - .planning/REQUIREMENTS.md

key-decisions:
  - "GATE-02's REQUIREMENTS.md provenance note cites the SPEC.md edit itself, not a commit hash, per the plan's explicit instruction — the commit hashes 813dc21/468e0b8 belong to the code that made the document stale, not to this fix. This is a documentation-formatting decision matching the plan's read_first guidance and 03-PATTERNS.md, not a deviation."
  - "This is the phase's final declaring plan for GATE-01, COMP-01, and COMP-02 (shared-ID gate #2388, same precedent as ANLZ-01/ANLZ-02 in Phase 2): all four requirement checkboxes (GATE-01, GATE-02, COMP-01, COMP-02) now flip to Complete via the GSD plan-completion gate reading this plan's requirements frontmatter, resolving the Pending status both 03-01 and 03-02 deliberately left in place."

patterns-established: []

requirements-completed: [GATE-01, GATE-02, COMP-01, COMP-02]

coverage:
  - id: D1
    description: "SPEC.md's F11 'Cards' section no longer states a model-source analysis is by itself sufficient for a pearl to become a review card; documents both learner-signal gate paths (linked-unit-feedable, explicit 'Add to review') as distinct actions (SC3)"
    requirement: "GATE-02"
    verification:
      - kind: other
        ref: "grep gate: ! grep -qF 'Only from `source: \"model\"` analyses' SPEC.md (0 matches) AND awk '/^## Cards$/,/^## Scheduling/' SPEC.md contains both 'Add to review' and 'pearlReviewAdds.json'"
        status: pass
    human_judgment: false
  - id: D2
    description: "SPEC.md's V3-B section documents pearl cards as attestation-gated, the compile partition as three-way with a distinct Dismissed section, and anchors as seek links (SC3, SC4, SC5)"
    requirement: "GATE-02"
    verification:
      - kind: other
        ref: "grep gate: awk '/^## B4\\. Review-loop upgrades$/,/^# V3-C/' SPEC.md contains both 'isUnitFeedable' and '### Dismissed'"
        status: pass
    human_judgment: false
  - id: D3
    description: "REQUIREMENTS.md records provenance (shipping commit + Phase 3's actual delta) for GATE-01, GATE-02, COMP-01, and COMP-02, without touching checkbox markers or the Traceability table"
    requirement: "GATE-01"
    verification:
      - kind: other
        ref: "grep gate: grep -c 'Provenance:' .planning/REQUIREMENTS.md >= 5; git diff -- .planning/REQUIREMENTS.md shows no line whose only change is a checkbox flip"
        status: pass
    human_judgment: false
  - id: D4
    description: "The full server + web suite stays green at the phase's accumulated baseline (1027 server / 357 web) and both workspaces typecheck clean, with zero server/src or web/src changes across all three plans"
    verification:
      - kind: unit
        ref: "npm run test -w server (1027/1027 passed) and npm run test -w web (357/357 passed); npm run typecheck -w server and -w web (both clean); git log --name-only --oneline 7181639..HEAD -- server/src web/src | grep -c src/ == 0"
        status: pass
    human_judgment: false

# Metrics
duration: 20min
completed: 2026-08-10
status: complete
---

# Phase 3 Plan 3: SPEC.md Sync + Requirements Provenance Summary

**Corrected SPEC.md's F11 "Cards" and V3-B "B4" sections to match the shipped attestation gate (commits `813dc21`, `468e0b8`), and closed out Phase 3's four requirements (GATE-01, GATE-02, COMP-01, COMP-02) with provenance notes in REQUIREMENTS.md — zero server/web source touched, phase-wide suite still 1027/357.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-08-10T12:14:00-05:00 (approx)
- **Completed:** 2026-08-10T12:20:00-05:00 (approx)
- **Tasks:** 2 completed
- **Files modified:** 2 (SPEC.md, .planning/REQUIREMENTS.md)

## Accomplishments
- Removed the F11 "Cards" clause that named a `source: "model"` analysis as sole precondition for a pearl card — the exact un-attested channel LOCKED ADR-PED-02/07 forbids — and replaced it with "necessary but not sufficient" plus a reference to the attestation gate below
- Added two "Implementation notes (deviations from the literal wording above):" blocks in SPEC.md's own established in-file convention (F11's pre-existing Scheduling block is the precedent): one under F11 "Cards" documenting the two-path gate (`isUnitFeedable()` on a linked unit, or explicit "Add to review") and the continuous legacy-card migration; one under V3-B "B4" documenting the three-way compile partition, the seek-link anchor convention, and the attestation-gated pearl-card-transformation relationship — each bullet citing the commit that shipped it (`813dc21` 2026-07-29, `468e0b8` 2026-08-08)
- Bounded the SPEC.md diff to a single-file, additive annotation: 40 insertions, 1 deletion — the one deletion is the exclusivity sentence itself, well inside the plan's <10-deleted-lines acceptance bound
- Appended provenance parentheticals (PIPE-01's established format) to all four Phase 3 requirement bullets in REQUIREMENTS.md: GATE-01 and COMP-01/COMP-02 cite the commits that shipped them before this requirements file was authored (2026-08-09) and name Phase 3's actual delta as the regression suites landed in 03-01/03-02 by file name; GATE-02 cites the SPEC.md edit itself as its own provenance, since it is the phase's one genuine documentation delta
- Left every `[ ]`/`[x]` checkbox marker and the Traceability table in REQUIREMENTS.md untouched, per the plan's hard constraint — this is the shared declaring plan for GATE-01/COMP-01/COMP-02 (shared-ID gate #2388), so the GSD plan-completion gate flips all four checkboxes to Complete only now that this plan's SUMMARY exists
- Re-ran the phase-wide verification gate: server 1027/1027, web 357/357 (unchanged baseline), both typecheck targets clean, and `git log --name-only --oneline 7181639..HEAD -- server/src web/src` still reports zero matches across all three plans in this phase

## Task Commits

Each task was committed atomically:

1. **Task 1: Correct SPEC.md's F11 and V3-B sections to the shipped attestation gate (GATE-02)** - `6858f9e` (docs)
2. **Task 2: Record provenance for GATE-01, GATE-02, COMP-01, COMP-02 in REQUIREMENTS.md** - `9366935` (docs)

**Plan metadata:** pending (this commit)

## Files Created/Modified
- `SPEC.md` - F11 "Cards" pearl bullet corrected to "necessary but not sufficient"; two new "Implementation notes" blocks (F11 Cards, V3-B B4) documenting the attestation gate, legacy-card migration, three-way compile partition, and seek-link convention
- `.planning/REQUIREMENTS.md` - Provenance parentheticals appended to GATE-01, GATE-02, COMP-01, COMP-02; trailing "Last updated" line bumped to 2026-08-10

## Decisions Made
- GATE-02's provenance note cites the SPEC.md edit itself rather than a commit hash, matching the plan's explicit instruction and 03-PATTERNS.md's guidance that GATE-02 is shaped differently from the other three (a genuine delta, not an already-shipped behavior needing only a citation)
- This plan is the final declarer for GATE-01, COMP-01, and COMP-02 (shared-ID gate #2388, same precedent Phase 2 established for ANLZ-01/ANLZ-02): all four Phase 3 requirement checkboxes flip to Complete via the GSD plan-completion gate now that this SUMMARY exists, resolving the Pending status 03-01 and 03-02 both deliberately preserved

## Deviations from Plan

None - plan executed exactly as written. Both SPEC.md edit sites and both REQUIREMENTS.md edit targets matched the plan's read_first line ranges and headings exactly (`git log --oneline -1 -- SPEC.md` confirmed `adca50e`, the same commit the plan's assumptions section named — no line-number drift to correct).

## Issues Encountered

None. Every acceptance criterion in both tasks passed on first implementation:
- Task 1's combined gate printed `GATE-02-DOC-OK`; negative grep confirmed 0 matches for the removed exclusivity clause; `Implementation notes` block count is 3 (1 pre-existing + 2 new); `git diff --stat -- SPEC.md` showed only SPEC.md changed, 40 insertions / 1 deletion (well under the 10-deletion bound); `git diff --name-only -- server web | wc -l` reported 0
- Task 2's combined gate printed `PROVENANCE-OK`; `grep -c 'Provenance:'` reported 5 (1 pre-existing PIPE-01 + 4 new, meeting the ≥5 bound); all four checkbox markers confirmed unchanged in the diff; Traceability table untouched
- Phase-wide gate: server 1027/1027, web 357/357, both typecheck targets clean, zero server/src or web/src changes across the whole phase

## Known Stubs

None. This plan is documentation-only and adds no UI or data-rendering surface.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 3 (Attestation Gate & Compile Honesty) is complete: all four requirements (GATE-01, GATE-02, COMP-01, COMP-02) now carry provenance and their checkboxes flip to Complete via this plan's SUMMARY
- SPEC.md is now the accurate build contract for the attestation gate and compile partition — a future implementer reading it alone cannot reconstruct the un-attested pearl channel LOCKED ADR-PED-02/07 forbids
- ROADMAP SC3 (build contract matches LOCKED ADR) holds; Phase 4 (real-lecture proof re-run) can proceed against an accurate SPEC.md and a fully-provenanced REQUIREMENTS.md
- Server suite baseline remains 1027 / web 357 — this plan added no new tests (documentation-only), so the floor Phase 4 should treat as its starting point is unchanged from 03-02's summary

---
*Phase: 03-attestation-gate-compile-honesty*
*Completed: 2026-08-10*

## Self-Check: PASSED

- FOUND: SPEC.md
- FOUND: .planning/REQUIREMENTS.md
- FOUND: .planning/phases/03-attestation-gate-compile-honesty/03-03-SUMMARY.md
- FOUND: 6858f9e (Task 1 commit)
- FOUND: 9366935 (Task 2 commit)
