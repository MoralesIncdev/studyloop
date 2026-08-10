---
phase: 02-analysis-fidelity-hardening
plan: 02
subsystem: analysis
tags: [safety-tier, clinical-lens, concept-registry, config-mirror, regression-tests]

requires:
  - phase: 02-analysis-fidelity-hardening
    provides: "plan 02-01's enrichment groundwork (unrelated surface; no direct dependency, same phase/wave)"
provides:
  - "PRIORITIZATION as a first-class safety-tier unit type in server/lenses/clinical.json's safetyTier array (D-02)"
  - "PRIORITIZATION mirrored into web/src/lib/safetyTier.ts's SAFETY_TIER_UNIT_TYPES literal set (D-02)"
  - "four-type never-auto-merge regression coverage in server/test/conceptRegistry.test.ts proving D-01's distinct-facts-never-merge guarantee for DOSAGE/CONTRAINDICATION/LAB_VALUE/PRIORITIZATION"
  - "four-type verbatim-rendering predicate coverage in web/src/lib/safetyTier.test.ts, tied explicitly to UnitProposalCard's existing verbatim-quote block"
affects: [02-03-pearls-and-compile, 02-04-real-lecture-proof]

actuals:
  tokens: 1555
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Hand-kept-in-sync config/code mirror (clinical.json safetyTier <-> safetyTier.ts SAFETY_TIER_UNIT_TYPES) — never a cross-workspace import, each side pinned by its own exact-membership test so drift breaks a build instead of degrading silently at runtime"
    - "it.each parameterized regression case over all four safety-tier types, reusing the existing unit() factory and evaluateNewUnit — one test body proves the guarantee for every type instead of four near-duplicate it() blocks"

key-files:
  created: []
  modified:
    - server/lenses/clinical.json
    - web/src/lib/safetyTier.ts
    - web/src/lib/safetyTier.test.ts
    - server/test/lenses.test.ts
    - server/test/conceptRegistry.test.ts

key-decisions:
  - "clinical.json's unitTypeEmphasis prose stays three-type (per plan Assumption A1) — D-02 rules on the safetyTier array only; the prose sentence is about exact-value rounding, not PRIORITIZATION's scenario-judgment failure mode. No production prompt behavior changed."
  - "The two pre-existing safetyTier.test.ts assertions that hard-coded the three-type set were realigned (renamed + updated expected values), never deleted, per the plan's explicit instruction — the suite still pins the exact membership of the tier at every step."
  - "server/test/conceptRegistry.test.ts's four-type regression case is parameterized with it.each rather than four near-duplicate it() blocks, keeping the file's 'pure logic, no fs' contract intact (no import from lib/lenses.js) while covering all four types identically"
  - "UnitProposalCard.tsx was not touched, as the plan required — its verbatim-quote block already calls isSafetyTierUnitType dynamically, so PRIORITIZATION units start rendering verbatim quotes the moment the predicate's backing set changed"

requirements-completed: [ANLZ-01]

coverage:
  - id: D1
    description: "PRIORITIZATION is present in clinical.json's safetyTier array and in SAFETY_TIER_UNIT_TYPES, with both sides pinned by exact-membership (contents + length) assertions"
    requirement: "ANLZ-01"
    verification:
      - kind: unit
        ref: "server/test/lenses.test.ts#clinical lens declares nclex questionStyle, nursing glossaryRef, and the four safety-tier unit types (D-02)"
        status: pass
      - kind: unit
        ref: "web/src/lib/safetyTier.test.ts#SAFETY_TIER_UNIT_TYPES has exactly four members and no more/fewer than the expected set (D-02)"
        status: pass
      - kind: other
        ref: "node -e \"console.log(require('./server/lenses/clinical.json').safetyTier.length)\" -> 4"
        status: pass
    human_judgment: false
  - id: D2
    description: "All four safety-tier types (DOSAGE, CONTRAINDICATION, LAB_VALUE, PRIORITIZATION) are blocked from cross-project auto-merge by evaluateNewUnit's safety guard, and the pre-existing registry unit's projectRefs are provably unaffected by the blocked merge attempt"
    requirement: "ANLZ-01"
    verification:
      - kind: unit
        ref: "server/test/conceptRegistry.test.ts#D-02: never auto-merges a distinct %s fact across projects (it.each over DOSAGE/CONTRAINDICATION/LAB_VALUE/PRIORITIZATION)"
        status: pass
    human_judgment: false
  - id: D3
    description: "All four safety-tier types return true from isSafetyTierUnitType, the exact predicate UnitProposalCard's verbatim-quote block reads dynamically — PRIORITIZATION units gain verbatim rendering with zero component-file changes"
    requirement: "ANLZ-01"
    verification:
      - kind: unit
        ref: "web/src/lib/safetyTier.test.ts#returns true for all four safety-tier types — the exact predicate UnitProposalCard's verbatim-quote block reads (D-02)"
        status: pass
    human_judgment: true
    rationale: "The predicate's correctness is proven by a passing unit test, but whether a PRIORITIZATION unit actually renders its verbatim quote correctly on the live card is a rendering/UX judgment no unit test asserts — web/src/concepts/ has no component-test harness (01-03/02-01 precedent). Final visual confirmation is deferred to plan 02-04's human-verify checkpoint per this plan's threat register (T-02-06)."

duration: 20min
completed: 2026-08-10
status: complete
---

# Phase 2 Plan 2: PRIORITIZATION Joins the Safety Tier Summary

**PRIORITIZATION added to both sides of the hand-kept clinical.json/safetyTier.ts safety-tier mirror, with parameterized regression coverage proving all four safety-tier types resist cross-project auto-merge and drive unconditional verbatim-quote rendering — zero production component changes.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-08-10T01:53:59Z
- **Completed:** 2026-08-10T01:59:09Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- `server/lenses/clinical.json`'s `safetyTier` array now reads `["DOSAGE", "CONTRAINDICATION", "LAB_VALUE", "PRIORITIZATION"]`, matching ROADMAP SC4's four-type list (D-02)
- `web/src/lib/safetyTier.ts`'s `SAFETY_TIER_UNIT_TYPES` mirrors the same four-type set — the hand-kept, never-imported mirror stays in sync
- Both pre-existing `safetyTier.test.ts` assertions that hard-coded the old three-type set were realigned (not deleted): the exclusion list dropped `PRIORITIZATION`, and the exact-size assertion moved from 3 to 4, plus a new sorted-contents assertion so a future silent addition/removal fails loudly
- `server/test/lenses.test.ts`'s clinical-lens declaration test now asserts all four types via `arrayContaining` plus an exact-length pin, renamed from "three" to "four"
- `server/test/conceptRegistry.test.ts` gained a parameterized (`it.each`) regression case proving, for each of DOSAGE/CONTRAINDICATION/LAB_VALUE/PRIORITIZATION, that a distinct safety-critical fact arriving from a second project always produces the `candidate` outcome (never `auto-merged`), and that the original registry unit's `projectRefs` stay untouched — the D-01 distinct-facts-never-merge guarantee, now proven for all four types instead of three
- `web/src/lib/safetyTier.test.ts` gained a dedicated case asserting `isSafetyTierUnitType` is true for all four types, named to make explicit that this is the same predicate `UnitProposalCard`'s verbatim-quote block reads dynamically — no component file was touched

## Task Commits

Each task was committed atomically:

1. **Task 1: PRIORITIZATION joins the safety tier on both sides of the mirror** - `394a430` (feat)
2. **Task 2: Prove all four safety-tier types resist merging and render verbatim** - `67a5973` (test)

**Plan metadata:** (this commit, docs)

## Files Created/Modified

- `server/lenses/clinical.json` - `safetyTier` array gains `"PRIORITIZATION"`; `unitTypeEmphasis`, `overlayFields`, `questionStyle`, `glossaryRef` unchanged
- `web/src/lib/safetyTier.ts` - `SAFETY_TIER_UNIT_TYPES` literal set gains `"PRIORITIZATION"`
- `web/src/lib/safetyTier.test.ts` - realigned membership/size assertions (Task 1) + new dedicated four-type verbatim-rendering case (Task 2)
- `server/test/lenses.test.ts` - realigned clinical-lens declaration test (four types, exact length)
- `server/test/conceptRegistry.test.ts` - new `it.each` regression block proving the never-auto-merge guarantee for all four safety-tier types

## Decisions Made

See `key-decisions` in frontmatter. No shape decisions were made during execution — D-02 was LOCKED in `02-CONTEXT.md` before this plan started; the only judgment calls were (1) leaving `unitTypeEmphasis` prose untouched per Assumption A1, and (2) using `it.each` to keep the four-type regression coverage compact while preserving the file's pure-logic contract.

## Deviations from Plan

None - plan executed exactly as written. Both tasks followed 02-CONTEXT.md's D-02 ruling and the plan's `<action>` steps verbatim; no Rule 1-4 auto-fixes were needed.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- ROADMAP SC4's four-type safety-tier list is now satisfied by the codebase (config + code + regression tests), not just by roadmap prose
- The `clinical.json` <-> `safetyTier.ts` mirror is pinned tighter than before this plan: both sides carry exact-membership assertions, so a future silent addition or removal on either side fails a test instead of degrading quietly at runtime
- No component file (`UnitProposalCard.tsx`) was touched, as required — plan 02-04's human-verify checkpoint is the right place to visually confirm a PRIORITIZATION unit actually renders its verbatim quote on a live card (T-02-06)
- No blockers for 02-03 or 02-04

## Self-Check: PASSED

All modified files verified present on disk with expected content (`grep`/`node -e` checks above). Both task commits (`394a430`, `67a5973`) verified present in `git log --oneline`. Full acceptance criteria re-run: `npm run test -w web -- safetyTier` 4/4 pass, `npm run test -w server -- lenses` 27/27 pass, `npm run test -w server -- conceptRegistry` 29/29 pass, `node -e "..." ` prints `true 4`, `npm run typecheck -w web` and `npm run typecheck -w server` both exit 0. Root `npm test`: 992/992 server (988 baseline + 4 new `it.each` cases), 357/357 web (356 baseline + 1 new case) — no regression. `git diff` on `clinical.json` confirmed to touch only the `safetyTier` array line.

---
*Phase: 02-analysis-fidelity-hardening*
*Completed: 2026-08-10*
