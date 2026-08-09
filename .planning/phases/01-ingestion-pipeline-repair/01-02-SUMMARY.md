---
phase: 01-ingestion-pipeline-repair
plan: 02
subsystem: ingestion
tags: [pdf-parse, zod, vitest, fixtures, slides]

# Dependency graph
requires: []
provides:
  - "isEmptyPageText exported predicate in server/src/lib/slides.ts (trimmed-length emptiness test)"
  - "emptyPageCount field on ExtractedSlides, SlidesMetaSchema, and the POST /api/projects/:id/slides meta response"
  - "server/test/fixtures/slides-empty-page.pdf and slides-text-layer.pdf — real, committed PDF fixtures for slide-extraction regression tests"
affects: [phase-4-proof-run, 01-03-plan (web half of PIPE-02)]

# Actuals (#2632)
actuals:
  tokens: 3475
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Real-extractor regression test against a committed binary fixture (departs from the mocked-SlideExtractor norm; carve-out already documented at slides.ts:55)"
    - "cupsfilter-generated PDF fixtures committed to server/test/fixtures/ (macOS/CUPS-only tool used once at authoring time; CI only ever reads the committed binary)"

key-files:
  created:
    - server/test/fixtures/slides-empty-page.pdf
    - server/test/fixtures/slides-text-layer.pdf
  modified:
    - server/src/lib/slides.ts
    - server/src/lib/models.ts
    - server/src/routes/slides.ts
    - server/test/slides.test.ts

key-decisions:
  - "isEmptyPageText is a trimmed-length check, not a bare === '' check — pinned by the empty-page fixture, whose blank second page has raw text length > 0 (renderer whitespace) but trimmed length 0."
  - "emptyPageCount is incremented inside PdfParseSlideExtractor's existing pagerender callback (the only place per-page text is materialized), never in a second pass over the pages array — guarantees the counter can never drift from what gets stored."
  - "SlidesMetaSchema.emptyPageCount defaults to 0, so every slides.json written before this field existed still parses instead of readSlides silently returning null for an already-attached deck."

patterns-established:
  - "Any future slides.ts signal that must be pinned against real pdf-parse output should follow the same 'tiny committed fixture + real extractor' pattern rather than extending the injectable-fake convention."

requirements-completed: [PIPE-02]

coverage:
  - id: D1
    description: "isEmptyPageText exported predicate (trimmed-length emptiness test) covering empty string, whitespace-only, single-char, and padded-real-text cases"
    requirement: "PIPE-02"
    verification:
      - kind: unit
        ref: "server/test/slides.test.ts#isEmptyPageText (PIPE-02) > is true for an empty string / is true for whitespace-only text / is false for a single non-whitespace character / is false for text with surrounding whitespace around real content"
        status: pass
    human_judgment: false
  - id: D2
    description: "The real PdfParseSlideExtractor, run against a committed 2-page fixture whose second page is whitespace-only, returns pageCount 2 / emptyPageCount 1, and the fixture's raw-vs-trimmed text distinction is proven (ROADMAP SC3 server half)"
    requirement: "PIPE-02"
    verification:
      - kind: integration
        ref: "server/test/slides.test.ts#PdfParseSlideExtractor against real PDF fixtures (PIPE-02) > slides-empty-page.pdf: pageCount 2, emptyPageCount 1, and page 2's raw text is non-empty while its trimmed text is empty"
        status: pass
    human_judgment: false
  - id: D3
    description: "The real extractor, run against a committed 2-page text-layer fixture, returns emptyPageCount 0 and both pages carry real text — the ROADMAP SC4 text-layer regression guard proving normal decks are unaffected"
    requirement: "PIPE-02"
    verification:
      - kind: integration
        ref: "server/test/slides.test.ts#PdfParseSlideExtractor against real PDF fixtures (PIPE-02) > slides-text-layer.pdf: pageCount 2, emptyPageCount 0, and both pages carry non-whitespace text"
        status: pass
      - kind: unit
        ref: "server/test/slides.test.ts#PdfParseSlideExtractor against real PDF fixtures (PIPE-02) > both fixtures produce a pages array whose length equals the reported pageCount"
        status: pass
    human_judgment: false
  - id: D4
    description: "emptyPageCount added to SlidesMetaSchema (Zod-validated, non-negative int, default 0) and to the POST route's meta object literal, sourced from extracted.emptyPageCount"
    requirement: "PIPE-02"
    verification:
      - kind: unit
        ref: "server/test/slides.test.ts#emptyPageCount schema + GET-response surface (PIPE-02, threat T-01-06/T-01-07) > a route-shaped meta object (matching routes/slides.ts's literal) parses cleanly through SlidesMetaSchema"
        status: pass
      - kind: other
        ref: "git diff server/src/routes/slides.ts — exactly one changed line inside the meta object literal"
        status: pass
    human_judgment: false
  - id: D5
    description: "A slides.json written before emptyPageCount existed (no key present) still loads via readSlides, with meta.emptyPageCount defaulting to 0 rather than the file becoming unreadable — no pre-existing project loses its attached deck"
    requirement: "PIPE-02"
    verification:
      - kind: unit
        ref: "server/test/slides.test.ts#slides.json store round-trip > PIPE-02: a slides.json written before emptyPageCount existed still loads, defaulting to 0 (not null)"
        status: pass
    human_judgment: false
  - id: D6
    description: "GET /api/projects/:id/slides continues to expose meta only, never extracted page text — re-asserted after adding emptyPageCount (threat T-01-07)"
    requirement: "PIPE-02"
    verification:
      - kind: unit
        ref: "server/test/slides.test.ts#emptyPageCount schema + GET-response surface (PIPE-02, threat T-01-06/T-01-07) > the GET response shape exposes meta only — no page-text field — built from a readSlides result"
        status: pass
    human_judgment: false

# Metrics
duration: 20min
completed: 2026-08-09
status: complete
---

# Phase 1 Plan 2: Slide-PDF emptyPageCount Signal Summary

**`emptyPageCount` now flows end-to-end from the real `pdf-parse` extractor through `SlidesMetaSchema` to the upload response, proven against two committed PDF fixtures generated with `cupsfilter` and parsed by the actual (non-mocked) extractor — not a synthetic mock.**

## Performance

- **Duration:** 20 min
- **Tasks:** 2
- **Files modified:** 6 (2 fixtures created, 4 source/test files modified)

## Accomplishments

- Exported `isEmptyPageText(text)` from `server/src/lib/slides.ts` — a trimmed-length emptiness predicate, deliberately not a bare `=== ""` check, because a real PDF text layer routinely yields whitespace-only pages (proven by the committed fixture, whose blank page has raw text length > 0 but trimmed length 0).
- `PdfParseSlideExtractor.extract` now counts empty pages inside its existing `pagerender` callback — the only place per-page text is materialized — so the counter can never disagree with the `pages` array actually stored in `slides.json`.
- `SlidesMetaSchema` gained `emptyPageCount: z.number().int().nonnegative().default(0)`; the default is what keeps every pre-existing `slides.json` parseable, so no on-disk deck silently disappears.
- `routes/slides.ts`'s POST handler passes `extracted.emptyPageCount` through to the meta literal — verified via `git diff` to be exactly one changed line, leaving the size cap, multipart limits, and 422 degradation path untouched.
- Two real, committed PDF fixtures (`slides-empty-page.pdf`, `slides-text-layer.pdf`) generated with `cupsfilter` against plain-text inputs, each independently re-verified by running the actual extractor logic before writing any test assertions — the fixture behavior (`pageCount: 2`, `emptyPageCount: 1` / `0`) matches the plan's pinned expectations exactly.
- 8 new/extended test cases in `server/test/slides.test.ts`: 4 `isEmptyPageText` cases, 3 real-extractor cases (empty-page pin, text-layer regression guard, cross-fixture `pages.length === pageCount` invariant), a round-trip/backward-compat pair, and a schema + GET-surface pair guarding threats T-01-06/T-01-07.

## Task Commits

Each task was committed atomically:

1. **Task 1: One empty page travels extractor to upload response, proven on a real PDF** - `417b4c7` (feat)
2. **Task 2: Prove the normal text-layer deck is unchanged and the API surface did not leak** - `6855c1b` (test)

_Tracer feedback gate: Task 1's full `<verify>` (server slides suite, typecheck, fixture trackability, route-diff scope) was re-run and confirmed passing before Task 2 began expansion — no failures, no halt required._

## Files Created/Modified

- `server/src/lib/slides.ts` - `isEmptyPageText` predicate; `ExtractedSlides.emptyPageCount`; `PdfParseSlideExtractor` counts empty pages inside its `pagerender` callback
- `server/src/lib/models.ts` - `SlidesMetaSchema.emptyPageCount` (Zod, non-negative int, default 0)
- `server/src/routes/slides.ts` - one-line addition to the POST handler's `meta` object literal
- `server/test/slides.test.ts` - 8 new/extended cases across 4 describe blocks; 6 pre-existing `SlidesFile`/`ExtractedSlides` literals updated to include `emptyPageCount`
- `server/test/fixtures/slides-empty-page.pdf` - new fixture, 2 pages, page 2 whitespace-only (`pageCount: 2`, `emptyPageCount: 1`)
- `server/test/fixtures/slides-text-layer.pdf` - new fixture, 2 pages, both with real text (`pageCount: 2`, `emptyPageCount: 0`)

## Decisions Made

- `isEmptyPageText` is a trimmed-length check, not `=== ""` — the empty-page fixture's second page has non-zero raw text length (renderer-inserted spaces/newlines) but zero trimmed length, and an equality check would have reported `emptyPageCount: 0` incorrectly.
- The counter increments inside the existing `pagerender` callback rather than via a second pass over the resolved `pages` array, so it structurally cannot drift from what's persisted.
- `SlidesMetaSchema`'s new field defaults to `0` rather than being required, preserving read-compatibility for every `slides.json` written before this plan.
- Both fixtures were independently probed with the real extraction logic (via a throwaway script) before any test assertion was written, confirming the plan's pinned expected values (`pageCount: 2`, `emptyPageCount: 1` / `0`) against this repo's actual `pdf-parse@1.1.1` behavior rather than trusting the plan's numbers blindly.

## Deviations from Plan

None - plan executed exactly as written. Both fixtures matched the plan's pinned expected values (`pageCount: 2`, `emptyPageCount: 1` for the empty-page deck; `pageCount: 2`, `emptyPageCount: 0` for the text-layer deck) on the first `cupsfilter` generation attempt, requiring no fixture rework or `<action>` deviation.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- ROADMAP SC3 (server half) and SC4 (PDF half) are now automated-test-guarded for the slide-PDF ingestion path.
- `emptyPageCount` is available on the POST upload response and the `slides.json` meta object — ready for `01-03-PLAN.md` (the web half of PIPE-02: surfacing the signal in the UI).
- The pdf-parse 1.x pin, the 25MB size cap, and the 422 corruption-degradation path are all confirmed unchanged by this plan (existing size-cap tests re-run and still pass unmodified).
- No blockers for Phase 1 Plan 3.

---
*Phase: 01-ingestion-pipeline-repair*
*Completed: 2026-08-09*

## Self-Check: PASSED

- FOUND: server/src/lib/slides.ts
- FOUND: server/src/lib/models.ts
- FOUND: server/src/routes/slides.ts
- FOUND: server/test/slides.test.ts
- FOUND: server/test/fixtures/slides-empty-page.pdf
- FOUND: server/test/fixtures/slides-text-layer.pdf
- FOUND commit: 417b4c7 (feat, Task 1)
- FOUND commit: 6855c1b (test, Task 2)
