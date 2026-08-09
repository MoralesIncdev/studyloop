---
phase: 01-ingestion-pipeline-repair
plan: 03
subsystem: ui
tags: [react, vitest, css-modules, zustand, slides]

# Dependency graph
requires:
  - phase: 01-ingestion-pipeline-repair (plan 01-02)
    provides: "emptyPageCount field on ExtractedSlides/SlidesMetaSchema/POST slides route"
provides:
  - "emptyPageCount mirrored onto the web SlidesMeta interface (web/src/lib/types.ts)"
  - "slidesWarningText(meta) pure warning-copy function in web/src/lib/slidesWarning.ts"
  - "warnNote conditional render in SlidesRow surfacing the empty-page signal to the learner"
affects: [phase-4-proof-run]

# Actuals (#2632)
actuals:
  tokens: 1800
  tasks: 1
  commits: 1

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure, DOM-free, node-testable copy function (slidesWarning.ts) feeding a React conditional render — keeps warning wording/trigger logic unit-tested without standing up a component-test harness"

key-files:
  created:
    - web/src/lib/slidesWarning.ts
    - web/src/lib/slidesWarning.test.ts
  modified:
    - web/src/lib/types.ts
    - web/src/study/SlidesRow.tsx
    - web/src/study/SlidesRow.module.css

key-decisions:
  - "emptyPageCount is required (not optional) on the web SlidesMeta interface — no web-side code constructs a SlidesMeta literal, it only ever arrives from the API, and plan 01-02 guarantees the server always sends it."
  - "slidesWarningText computed once per render into a local `slidesWarning` const rather than called twice inline, avoiding duplicate work in the JSX conditional."
  - "No store change: web/src/state/store.ts already passes the whole upload-response meta object through to slidesMeta, so emptyPageCount arrives for free once the type mirror is updated — git diff on store.ts stays empty, matching the plan's acceptance criterion."

requirements-completed: []

coverage:
  - id: D1
    description: "emptyPageCount mirrored onto the web SlidesMeta interface, keeping the hand-maintained server/web type mirror in sync"
    requirement: "PIPE-02"
    verification:
      - kind: other
        ref: "npm run typecheck -w web (exit 0) — proves SlidesRow compiles against the new required field"
        status: pass
      - kind: other
        ref: "npm run build -w web (exit 0)"
        status: pass
    human_judgment: false
  - id: D2
    description: "slidesWarningText(meta) pure function implements every wording case (null/singular-partial/plural-partial/all-empty singular+plural noun) and is unit-tested"
    requirement: "PIPE-02"
    verification:
      - kind: unit
        ref: "web/src/lib/slidesWarning.test.ts#slidesWarningText (PIPE-02) — 7/7 passing, including the /\\p{Extended_Pictographic}/u zero-emoji-glyph assertion"
        status: pass
    human_judgment: false
  - id: D3
    description: "A learner attaching an image-only slide deck sees a visible amber warning naming how many pages carried no extractable text, and a normal text-layer deck's row is unchanged (ROADMAP SC3/SC4, UI half)"
    requirement: "PIPE-02"
    verification: []
    human_judgment: true
    rationale: "No component-test harness exists for SlidesRow (web workspace runs vitest environment: node over src/**/*.test.ts only — the pure helper is unit-tested but the actual conditional render against the real fixtures needs a human to visually confirm placement, legibility, and that the normal-deck row is untouched). This is Task 2's checkpoint:human-verify, PENDING at time of this SUMMARY — see below."

# Metrics
duration: 12min
completed: 2026-08-09
status: halted
---

# Phase 1 Plan 3: Slide-Warning UI Summary

**`emptyPageCount` now reaches the learner as tested, glyph-free amber-pill copy in the slides row — `slidesWarningText` unit-tested for every wording case, wired into `SlidesRow` with zero store changes; Task 2's visual checkpoint is pending human confirmation.**

## Performance

- **Duration:** 12 min (Task 1 only; Task 2 checkpoint pending)
- **Tasks:** 1 of 2 (Task 2 is a blocking human-verify checkpoint, not yet confirmed)
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments

- Added `emptyPageCount: number` to the `SlidesMeta` interface in `web/src/lib/types.ts`, the hand-maintained mirror of the server's `SlidesMetaSchema` — the only cross-tier type-safety net in this codebase.
- Created `web/src/lib/slidesWarning.ts` exporting `slidesWarningText(meta): string | null` — a pure, dependency-free, DOM-free function covering every case in the plan's `<behavior>`: no warning for zero empty pages, singular/plural partial wording, and all-empty wording with correct singular/plural page noun.
- `web/src/lib/slidesWarning.test.ts`: 7 unit tests, including an explicit assertion that no produced string matches `/\p{Extended_Pictographic}/u`, pinning the design contract's zero-emoji rule to an automated check.
- `web/src/study/SlidesRow.module.css` gained `warnNote` — an amber pill built entirely from existing tokens (`--radius-pill`, `--type-12`, `--accent-amber`, `color-mix`), no new animation/transition (keeps `prefers-reduced-motion` satisfied with no media query needed).
- `web/src/study/SlidesRow.tsx` computes `slidesWarningText(slidesMeta)` once per render and conditionally renders it as a sibling `<span>` next to the existing chip and Remove button — the existing chip, Remove button, hidden file input, and `staleNote` conditional are untouched.
- Confirmed `git diff web/src/state/store.ts` is empty: `store.slidesMeta` already passes the whole upload-response meta object through, so `emptyPageCount` arrives for free.

## Task Commits

Each task was committed atomically:

1. **Task 1: One empty-page count becomes one visible warning in the slides row** - `4f0ce27` (feat)

_Task 2 (checkpoint:human-verify, gate="blocking") has not run — this plan is not autonomous and no auto-mode config is active, so the executor stopped at the checkpoint per protocol rather than self-certifying the visual/functional check. See "Next Phase Readiness" below for exact verification steps and running dev servers._

## Files Created/Modified

- `web/src/lib/types.ts` - added `emptyPageCount: number` to `SlidesMeta`
- `web/src/lib/slidesWarning.ts` - new pure warning-copy function
- `web/src/lib/slidesWarning.test.ts` - new, 7 unit tests
- `web/src/study/SlidesRow.tsx` - imports and renders `slidesWarningText(slidesMeta)` as a `warnNote` span
- `web/src/study/SlidesRow.module.css` - new `warnNote` amber-pill class

## Decisions Made

- `emptyPageCount` required (not optional) on `SlidesMeta` — safe because no web-side literal constructs this interface; it only ever arrives from the API and plan 01-02 guarantees the server always sends it.
- Computed the warning text once into a local variable rather than calling `slidesWarningText` twice inline in JSX, avoiding redundant computation on every render.
- No store change needed or made — `web/src/state/store.ts` already forwards the full `meta` object from the upload response.

## Deviations from Plan

None - plan executed exactly as written for Task 1. Task 2 is the plan's own designed checkpoint, not a deviation.

## Verification Results (Task 1)

- `npm run test -w web -- slidesWarning`: 7/7 passing (all `<behavior>` cases + zero-emoji assertion).
- `npm run typecheck -w web`: exit 0.
- `npm run typecheck -w server`: exit 0.
- `npm run build -w web`: exit 0.
- `npm test` (full suite): server 980/980 passing (≥ 964 baseline), web 352/352 passing (≥ 345 baseline). No regressions.
- `git diff --stat web/src/state/store.ts`: empty, as required by the plan's acceptance criteria.

## Issues Encountered

None for Task 1. Note for the human verifier: the plan's checkpoint text says to visit `http://127.0.0.1:4601`; in this environment Node's `fetch` (and likely the browser) only resolves the dev server at `http://localhost:4601` — `127.0.0.1:4601` did not respond in three attempts while `localhost:4601` responded 200 each time. Use `http://localhost:4601` for verification.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Task 2 checkpoint is PENDING.** Dev servers are already running (started by this executor):
- Server: `http://127.0.0.1:4600` (confirmed 200 via `/api/health`)
- Web: `http://localhost:4601` (confirmed 200; NOT `127.0.0.1:4601` in this environment — see Issues Encountered)

**How to verify (from the plan's Task 2):**
1. Open `http://localhost:4601`, open any project, find the slides row in project settings (next to the domain/novice toggle, below the channel row).
2. Attach `server/test/fixtures/slides-empty-page.pdf` (2 pages, second page carries no extractable text).
   Expected: filename chip appears AND an amber warning reads "1 of 2 pages has no extractable text — analysis will miss those slides".
3. Remove that deck, then attach `server/test/fixtures/slides-text-layer.pdf`.
   Expected: filename chip appears, NO warning is shown.
4. Confirm the warning has no emoji glyph and is legible against the dark surface (design/DESIGN.md: zero emoji, oklch tokens).
5. Capture a screenshot of the warning state for the phase record.

Once Task 2 is confirmed ("approved" or issue description), the plan is fully complete: this SUMMARY should be updated to `status: complete`, `requirements-completed: [PIPE-02]` (subject to the shared-ID gate — PIPE-02 is also declared by plan 01-02, which already finished, so it becomes ready once this plan's SUMMARY flips to complete), and STATE.md/ROADMAP.md advanced.

---
*Phase: 01-ingestion-pipeline-repair*
*Completed: 2026-08-09 (Task 1 only — Task 2 checkpoint pending)*

## Self-Check: PASSED

- FOUND: web/src/lib/types.ts (emptyPageCount field present)
- FOUND: web/src/lib/slidesWarning.ts
- FOUND: web/src/lib/slidesWarning.test.ts
- FOUND: web/src/study/SlidesRow.tsx (warnNote render present)
- FOUND: web/src/study/SlidesRow.module.css (warnNote class present)
- FOUND commit: 4f0ce27 (feat, Task 1)
