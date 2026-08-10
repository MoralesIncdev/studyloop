---
phase: 03-attestation-gate-compile-honesty
plan: 01
subsystem: testing
tags: [vitest, fastify, app-inject, route-level-testing, attestation-gate, review-queue]

# Dependency graph
requires:
  - phase: 02-analysis-fidelity-hardening
    provides: typed analysis v3 units/pearls, safety-tier types, ANLZ-01/02 enrichment fields the fixtures build on
provides:
  - "server/test/reviewRoutes.test.ts — a route-level regression suite proving GET /api/review/queue honors the attestation gate end-to-end through the real Fastify handler"
  - "A reusable dynamic-import-based route-test isolation pattern (STUDYLOOP_CONFIG_DIR + two fs.mkdtemp roots) any future route test needing a disposable dataDir can copy"
affects: [03-02, 03-03, 04-real-lecture-proof-rerun]

# Actuals (#2632)
actuals:
  tokens: 4066
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dynamic-import route isolation: every StudyLoop module loaded via `await import(...)` inside `beforeAll`, AFTER STUDYLOOP_CONFIG_DIR is set and a fake config.json is pre-written — avoids config.ts's module-scope CONFIG_DIR capture ever resolving against the real home directory"
    - "Inline `import(\"path\").Type` / `typeof import(\"path\")[\"export\"]` type queries let a route test get full compile-time typing against src/ modules without a single static `import ... from \"../src/...\"` line — verified by grep in the plan's own acceptance criteria"

key-files:
  created:
    - server/test/reviewRoutes.test.ts
  modified: []

key-decisions:
  - "GATE-01's requirements checkbox stays Pending after this plan: 03-03-PLAN.md also declares GATE-01 and hasn't run yet — same shared-ID gate (#2388) precedent as Phase 2's ANLZ-01/ANLZ-02. Reverted an over-eager `requirements mark-complete` call before committing."
  - "Case A's attested-linked pearl fixture omits the linked unit from analysis.units entirely — isUnitFeedable() only reads attestations[unitId], not analysis.units, so a matching unit object isn't required to prove the gate opens. Kept anyway for Case A specifically (per plan text) to also pin the V3-B B4 'attestation opens both the pearl and the unit card' behavior; Cases B/C/D reference unitIds that never appear in units at all, which is intentional and still schema-valid."

patterns-established:
  - "Route-level tests for any handler with no dataDir injection hook: seed via `await import()`-loaded lib/store.ts writers directly into a temp dataDir, never through HTTP POST setup routes — keeps the isolation seam the only thing under test, and the test's Vitest module registry is intact for the trick to work at all"

requirements-completed: []

coverage:
  - id: D1
    description: "GET /api/review/queue never returns a pearl the learner neither attested (via its linked unit) nor explicitly added"
    requirement: "GATE-01"
    verification:
      - kind: integration
        ref: "server/test/reviewRoutes.test.ts#omits an un-attested, non-explicitly-added pearl from the due queue while surfacing the live bubble control card"
        status: pass
    human_judgment: false
  - id: D2
    description: "A pearl whose linked unit is feedable (attested) is admitted, and the linked unit's own generation card is served by the same attestation (V3-B B4)"
    requirement: "GATE-01"
    verification:
      - kind: integration
        ref: "server/test/reviewRoutes.test.ts#admits a pearl whose linked unit is attested, and also serves that unit's own generation card (V3-B B4)"
        status: pass
    human_judgment: false
  - id: D3
    description: "A pearl explicitly added via pearlReviewAdds is admitted even with no unit link (ADR-PED-02 path b)"
    requirement: "GATE-01"
    verification:
      - kind: integration
        ref: "server/test/reviewRoutes.test.ts#admits a pearl with no unit link once the learner explicitly adds it to review"
        status: pass
    human_judgment: false
  - id: D4
    description: "A legacy pre-gating pearl card with reps > 0 is suspended (invisible in the due list, entry survives in review.json — never delete learner progress), while a legitimately scheduled card's persisted entry stays byte-identical across the migrating read"
    requirement: "GATE-01"
    verification:
      - kind: integration
        ref: "server/test/reviewRoutes.test.ts#suspends a legacy pearl card carrying real progress without corrupting a legitimately scheduled card's persisted state (SC2)"
        status: pass
    human_judgment: false
  - id: D5
    description: "A legacy pre-gating pearl card with reps === 0 is dropped from review.json like any other orphan; the live control card's entry survives"
    requirement: "GATE-01"
    verification:
      - kind: integration
        ref: "server/test/reviewRoutes.test.ts#drops a legacy pearl card with no progress like any other orphan (SC2)"
        status: pass
    human_judgment: false

# Metrics
duration: 20min
completed: 2026-08-10
status: complete
---

# Phase 3 Plan 1: Attestation Gate Route-Level Proof Summary

**Five `app.inject` regressions against the real `GET /api/review/queue` handler proving the attestation gate holds end-to-end — un-attested pearls excluded, both learner-signal paths admitted, and legacy review.json state migrates without corrupting a legitimately scheduled card's persisted entry.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-08-10T16:53:11Z
- **Completed:** 2026-08-10T17:00:55Z
- **Tasks:** 2 completed
- **Files modified:** 1 created (server/test/reviewRoutes.test.ts)

## Accomplishments
- Proved GATE-01 end-to-end at the route layer, not just the lib layer: `lib/review.ts`'s `deriveLiveCards`/`buildReviewQueue` are unit-tested, but nothing previously drove `routes/review.ts`'s real disk I/O (`readAttestations`, `readPearlReviewAdds`, `readReviewState`, `writeReviewState`) together with them until now
- Established a copyable dynamic-import isolation pattern for any future route test that needs a disposable dataDir without a dedicated injection hook — `STUDYLOOP_CONFIG_DIR` set before any StudyLoop module import, two separate `fs.mkdtemp` roots, config.json pre-written with a null API key for deterministic offline behavior
- Confirmed both attestation-gate open paths (linked-unit-attested, explicitly-added) are admitted and the closed path (neither) is excluded — the gate is exactly two paths wide
- Proved SC2's two migration clauses (suspend-with-progress, drop-without-progress) against the persisted file, not just the response body, since a suspended card is by definition invisible in the response
- Spot-checked the isolation seam is load-bearing: temporarily removing the pre-written config.json made the tracer test fail (confirms the test isn't silently passing against an empty real dataDir), then restored before committing

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end "the queue honors the gate" — one path through the real route** - `cf2dd91` (test)
2. **Task 2: Expand the slice — both gate-open paths and the legacy review.json migration** - `e1ab225` (test)

**Plan metadata:** pending (this commit)

## Files Created/Modified
- `server/test/reviewRoutes.test.ts` - Five route-level `app.inject` regressions for GATE-01 / ROADMAP SC1 and SC2, isolated on a disposable temp dataDir via `STUDYLOOP_CONFIG_DIR` + dynamic imports

## Decisions Made
- GATE-01's requirements checkbox stays **Pending**: `03-03-PLAN.md` also declares `GATE-01` in its `requirements` frontmatter and hasn't executed yet. An automated `requirements mark-complete GATE-01` call flipped the checkbox prematurely (the tool has no awareness of the shared-ID gate); this was caught and manually reverted (both the `- [x]` checkbox and the traceability table row) before the final commit, following the same precedent Phase 2 established for ANLZ-01/ANLZ-02 (issue #2388) — the checkbox flips only once every plan that declares the requirement has a SUMMARY.
- Case A's attested-linked pearl fixture omits a matching unit object from `analysis.units` for the negative/positive gate cases (B, C, D) since `isUnitFeedable()` only reads `attestations[unitId]`, never cross-checks `analysis.units` — kept the actual matching unit object only in Case A itself, per the plan's explicit intent to also pin the V3-B B4 "one attestation opens both the pearl and the unit card" behavior there.

## Deviations from Plan

None - plan executed exactly as written. The one process deviation (premature `requirements mark-complete`) is documented above under Decisions Made rather than here, since it wasn't a code/test deviation — it was caught and reverted before the plan's own commits were finalized.

## Issues Encountered

None. Every acceptance criterion in both tasks passed on first implementation:
- `npm run test -w server -- reviewRoutes` — 5/5 passing
- `grep -c "await import("` — 6 (≥1 required)
- `grep -c "^import .*src/"` — 0
- `grep -c "StudyLoopData\|\.studyloop"` — 0
- `grep -c "mkdtemp"` — 2 (≥2 required)
- Config-deletion spot-check — test failed as expected, confirming the isolation seam is load-bearing (restored before commit)
- `npm run typecheck -w server` and `-w web` — both clean
- Full suite: server 1024/1024 (1019 baseline + 5 new, zero regressions), web 357/357 (unchanged, untouched by this plan)
- `git log --name-only --oneline 7181639..HEAD -- server/src` — 0 matches; this plan changed no production source, matching its hard constraint

## Known Stubs

None. This plan is test-only and adds no UI or data-rendering surface.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `03-02-PLAN.md` (COMP-01/COMP-02, compile honesty) and `03-03-PLAN.md` (GATE-02/GATE-01/COMP-01/COMP-02) can proceed independently — this plan touched no production source and has no downstream code dependency
- GATE-01's requirements checkbox will flip to Complete once `03-03-PLAN.md` also produces a SUMMARY (shared-ID gate #2388) — track this when planning/executing 03-03
- The dynamic-import route-isolation pattern established here (`STUDYLOOP_CONFIG_DIR` + `fs.mkdtemp` pair + `await import()` in `beforeAll`) is directly reusable for any future route-level test needing a disposable dataDir

---
*Phase: 03-attestation-gate-compile-honesty*
*Completed: 2026-08-10*

## Self-Check: PASSED

- FOUND: server/test/reviewRoutes.test.ts
- FOUND: .planning/phases/03-attestation-gate-compile-honesty/03-01-SUMMARY.md
- FOUND: cf2dd91 (Task 1 commit)
- FOUND: e1ab225 (Task 2 commit)
