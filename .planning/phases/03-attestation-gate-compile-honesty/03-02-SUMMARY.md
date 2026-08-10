---
phase: 03-attestation-gate-compile-honesty
plan: 02
subsystem: testing
tags: [vitest, compileRenderer, attestation, compile-honesty, anchor-links]

# Dependency graph
requires:
  - phase: 03-attestation-gate-compile-honesty
    provides: "03-01's route-level GATE-01 proof (server/test/reviewRoutes.test.ts) — independent wave-mate, no code dependency, only a shared 1024-server/357-web baseline"
provides:
  - "server/test/compile.test.ts — three new regressions pinning the two COMP-01 partition edges left unguarded by the shipped test (commit 468e0b8), plus one COMP-02 parity regression proving pearl/attested-unit/legacy-concept anchors render the identical seek-link convention renderNotesTokens produces"
affects: [03-03, 04-real-lecture-proof-rerun]

# Actuals (#2632)
actuals:
  tokens: 1556
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Derived-expectation parity test: compute the expected string once from the canonical renderer (renderNotesTokens) rather than hardcoding it a second time in the test, so the assertion only stays green if all call sites move together — reusable for any future cross-renderer convention pin"

key-files:
  created: []
  modified:
    - server/test/compile.test.ts

key-decisions:
  - "Task 2's parity test uses two renderCompiledDocument calls sharing one derived expectedLink, not the single call the plan's action text described. renderCompiledDocument treats analysisUnits and analysisConcepts as mutually exclusive alternatives under the same 'Concept breakdown' heading (analysisUnits wins when both are present — confirmed by the file's own pre-existing 'analysisUnits takes priority over analysisConcepts' test at line ~375). Seeding a pearl + attested unit + legacy concept into one call would silently drop the concept heading rather than render it, so the concept-heading assertion needed a second call. Both calls derive from the same renderNotesTokens output, preserving the parity property the test exists to prove. Documented inline in the test's comment block. No server/src change — this is a test-authoring correction, not an architectural one (Rule 1 territory, applied to test code)."
  - "REQUIREMENTS.md's COMP-01/COMP-02 checkboxes stay Pending after this plan: 03-03-PLAN.md also declares both in its requirements frontmatter and hasn't executed yet — same shared-ID gate (#2388) precedent as GATE-01 (03-01) and ANLZ-01/ANLZ-02 (Phase 2). The checkbox flips only once every declaring plan has a SUMMARY."

patterns-established: []

requirements-completed: []

coverage:
  - id: D1
    description: "A unit the learner dismissed renders under '### Dismissed', never under '### Not yet reviewed', even when it also carries a userTake (dismiss always wins) (SC4)"
    requirement: "COMP-01"
    verification:
      - kind: unit
        ref: "server/test/compile.test.ts#COMP-01 / SC4: dismissal outranks a generation attempt — a dismissed unit carrying a userTake still renders only in the Dismissed titles list, never its AI body or the learner's take"
        status: pass
    human_judgment: false
  - id: D2
    description: "The '### Dismissed' heading is absent from the compiled document when no unit is dismissed — the section is truthful, not a permanent empty shell (SC4)"
    requirement: "COMP-01"
    verification:
      - kind: unit
        ref: "server/test/compile.test.ts#COMP-01 / SC4: the Dismissed heading is absent from the document when nothing is dismissed — the section is truthful, not a permanent empty shell"
        status: pass
    human_judgment: false
  - id: D3
    description: "A pearl anchor, a concept anchor, and an attested-unit anchor all render the identical seek-link form that renderNotesTokens emits for a note's ^t: token at the same second (SC5)"
    requirement: "COMP-02"
    verification:
      - kind: unit
        ref: "server/test/compile.test.ts#COMP-02: pearl, attested-unit, and legacy-concept anchors all render the same seek-link form renderNotesTokens produces for a ^t: token at the same second"
        status: pass
    human_judgment: false

# Metrics
duration: 15min
completed: 2026-08-10
status: complete
---

# Phase 3 Plan 2: COMP-01/COMP-02 Compile Honesty Coverage Summary

**Three regressions in `compile.test.ts` pin the shipped COMP-01 dismiss-always-wins partition and empty-section truthfulness, plus a COMP-02 parity test proving analysis anchors render the exact seek-link convention `renderNotesTokens` uses for user-note `^t:` tokens — zero production source touched.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-08-10T12:00:00-05:00 (approx)
- **Completed:** 2026-08-10T12:07:57-05:00
- **Tasks:** 2 completed
- **Files modified:** 1 (server/test/compile.test.ts)

## Accomplishments
- Pinned COMP-01's two unguarded edges: a dismissed unit carrying a userTake still renders only in the Dismissed titles list (dismiss-always-wins per `isUnitFeedable`), and the Dismissed heading is genuinely absent — not a permanently-empty shell — when nothing is dismissed
- Pinned COMP-02/SC5 as an actual cross-renderer *relationship* rather than three independent per-renderer format checks: the expected `[mm:ss](#t=N)` link string is derived once from `renderNotesTokens`'s own output, then asserted against the pearl line, the attested-unit heading, and the legacy-concept heading — a future format change can only keep the test green if it moves all of them together
- Confirmed via source pins that the shipped COMP-01 (`468e0b8`)/COMP-02/GATE-01 (`813dc21`) implementations remain untouched: comment-stripped `Dismissed` count 1 (≥1), `timestampLink` count 5 (≥4), `review.ts`'s `explicitlyAdded` pearl-gate count 2 (≥2)
- Verified `git diff --name-only -- server/src` is 0 lines against the phase base commit `7181639` — this plan changed no production source, per its hard constraint
- Full suite green with zero regressions: server 1027/1027 (1024 baseline + 3 new), web 357/357 unchanged; `npm run typecheck -w server` and `-w web` both clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Pin the COMP-01 partition at its two unguarded edges** - `c95f4e0` (test)
2. **Task 2: Pin COMP-02's convention parity between note tokens and analysis anchors** - `6950f1c` (test)

**Plan metadata:** pending (this commit)

## Files Created/Modified
- `server/test/compile.test.ts` - Two new `it` blocks in the existing V3-B B2 describe pinning COMP-01's dismiss-outranks-userTake and empty-Dismissed-section edges; one new describe block with a single `it` pinning COMP-02's anchor-link parity across pearls, attested units, and legacy concepts

## Decisions Made
- The COMP-02 parity test derives its expected link from `renderNotesTokens(`^t:65`)` once, then asserts it in two `renderCompiledDocument` calls (pearl+attested-unit in one call, legacy concept in a second) rather than the plan's literally-worded "single call" — `renderCompiledDocument` renders `analysisUnits`/`analysisConcepts` as mutually exclusive alternatives under "Concept breakdown" (confirmed by the file's own pre-existing "analysisUnits takes priority" test), so seeding all three in one call would silently skip the concept heading rather than render it. Both calls still share the one derived `expectedLink`, which is what makes it a parity test. Documented inline in the test's comment block.
- REQUIREMENTS.md's COMP-01/COMP-02 checkboxes stay Pending: `03-03-PLAN.md` also declares both and hasn't run yet (shared-ID gate #2388, same precedent as GATE-01 in 03-01 and ANLZ-01/02 in Phase 2).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - test-authoring correction] COMP-02 parity test split into two `renderCompiledDocument` calls instead of one**
- **Found during:** Task 2
- **Issue:** The plan's action text asked for a single `renderCompiledDocument` call seeded with a pearl, an attested unit, and an analysis concept, asserting the derived link in all three anchor surfaces. The shipped renderer (`compileRenderer.ts`'s `if (analysisUnits) {...} else if (analysisConcepts) {...}`) makes `analysisUnits` and `analysisConcepts` mutually exclusive under the same "Concept breakdown" heading — seeding all three into one call would render only the unit heading, never the concept heading, silently defeating the assertion the plan asked for.
- **Fix:** Used two `renderCompiledDocument` calls (pearl+attested-unit in one, legacy concept in the other), both deriving the expected seek-link from a single `renderNotesTokens` call up front, so the parity property (all three conventions must move together to stay green) is preserved exactly as SC5 requires.
- **Files modified:** server/test/compile.test.ts
- **Verification:** `npm run test -w server -- compile` — 24/24 passing, including the new parity test; `npm run typecheck -w server` clean.
- **Committed in:** `6950f1c` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (test-authoring correction, Rule 1 territory applied to test code — no production source touched)
**Impact on plan:** The correction preserves the exact invariant the plan intended to pin (SC5's cross-renderer parity); it does not weaken the test or touch `server/src`.

## Issues Encountered

None. Every acceptance criterion in both tasks passed on first implementation:
- `npm run test -w server -- compile` — 24/24 passing (21 baseline + 3 new)
- `npm run typecheck -w server` and `-w web` — both clean
- `git diff --name-only -- server/src | wc -l` — 0 (both tasks)
- Source pins: `Dismissed` count 1 (≥1), `timestampLink` count 5 (≥4), `explicitlyAdded` count 2 (≥2)
- Full suite: server 1027/1027 (1024 baseline + 3 new, zero regressions), web 357/357 (unchanged)
- `git log --name-only --oneline 7181639..HEAD -- server/src | grep -c "^server/src"` — 0 matches; hard constraint honored

## Known Stubs

None. This plan is test-only and adds no UI or data-rendering surface.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `03-03-PLAN.md` (GATE-02/GATE-01/COMP-01/COMP-02, SPEC.md sync) can proceed independently — this plan touched no production source and has no downstream code dependency
- COMP-01/COMP-02's requirements checkboxes will flip to Complete once `03-03-PLAN.md` also produces a SUMMARY (shared-ID gate #2388) — track this when executing 03-03
- Server suite baseline is now 1027 (1024 + this plan's 3); 03-03 and any later phase work should treat 1027 server / 357 web as the new floor, not 1024/357

---
*Phase: 03-attestation-gate-compile-honesty*
*Completed: 2026-08-10*
