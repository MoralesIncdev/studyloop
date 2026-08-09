---
phase: 01-ingestion-pipeline-repair
plan: 01
subsystem: testing
tags: [vitest, fastify, youtube, dependency-injection, route-testing]

# Dependency graph
requires: []
provides:
  - "server/test/youtube.test.ts — first route-level (app.inject()) test in the repo, covering all five branches of routes/youtube.ts:40-84"
  - "__setResolveYoutubeForTests DI seam in server/src/lib/ytdlp.ts"
  - "PIPE-01 provenance note in REQUIREMENTS.md; descope + adjacent-gap records in STATE.md"
affects: [phase-4-proof-run, transcriptChain]

# Actuals (#2632)
actuals:
  tokens: 3750
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fastify app.inject() route-level test bootstrap (Fastify() -> register(routes) -> ready(), close in afterEach) — first instance in this repo, departing from the documented lib-only test convention"
    - "__setXForTests DI seam idiom extended to a fourth module (ytdlp.ts), matching the existing three in innertube.ts/slides.ts/analysis.ts"

key-files:
  created:
    - server/test/youtube.test.ts
  modified:
    - server/src/lib/ytdlp.ts
    - .planning/REQUIREMENTS.md
    - .planning/STATE.md

key-decisions:
  - "DI override guard placed AFTER assertValidYoutubeUrl(url) inside resolveYoutube, not before — so the host allowlist runs on every code path including injected test ones (threat T-01-02)"
  - "Descoped: the Innertube 15-minute cache wraps resolveVideo only — the route-level yt-dlp caption merge is never cached, so a repeat resolve of the same video re-spawns yt-dlp. Accepted for Phase 1 since PIPE-01's success criteria require the fallback to run, not to be cached."
  - "Accepted: text.trim().length === 0 is the emptiness threshold for PIPE-02 (next plan), a page with only a footer/page-number counts as non-empty."
  - "Flagged, not fixed: transcriptChain.ts's lazy caption pull (pullYoutubeTranscript) has no yt-dlp fallback — out of Phase 1 scope (PIPE-01 covers the paste-a-URL flow only), recorded as a Phase 4 proof-run watch item."

patterns-established:
  - "Route-level Fastify test bootstrap is now a citable precedent for any future route needing branch-coverage that a lib-level test can't prove alone."

requirements-completed: [PIPE-01]

coverage:
  - id: D1
    description: "DI seam (__setResolveYoutubeForTests) added to ytdlp.ts and used to prove, through a real HTTP-shaped request, that Innertube metadata-only + a successful yt-dlp caption fallback yields a 200 with merged captions; plus a bad-host 400 regression guard for assertValidYoutubeUrl"
    requirement: "PIPE-01"
    verification:
      - kind: integration
        ref: "server/test/youtube.test.ts#innertube metadata-only, yt-dlp caption fallback succeeds > returns 200 with the innertube title and the yt-dlp fallback's captions, calling resolveYoutube exactly once"
        status: pass
      - kind: integration
        ref: "server/test/youtube.test.ts#bad host (threat T-01-02 regression guard) > answers 400 without reaching either adapter for a non-YouTube host"
        status: pass
    human_judgment: false
  - id: D2
    description: "Remaining four branches of routes/youtube.ts:40-84 covered: captioned fast path (no yt-dlp spawn), fallback-throws non-fatal degradation, total-innertube-miss + yt-dlp success, total-innertube-miss + ytdlpMissing degradation"
    requirement: "PIPE-01"
    verification:
      - kind: integration
        ref: "server/test/youtube.test.ts#innertube fast path (captioned video — ROADMAP SC4 regression guard) > returns 200 with captions from innertube's own transcript and never spawns yt-dlp"
        status: pass
      - kind: integration
        ref: "server/test/youtube.test.ts#innertube metadata-only, yt-dlp caption fallback throws > is non-fatal — the metadata-only response still goes out with 200"
        status: pass
      - kind: integration
        ref: "server/test/youtube.test.ts#innertube total miss, yt-dlp fallback succeeds (ROADMAP SC2) > returns 200 with the yt-dlp title/captions and related: []"
        status: pass
      - kind: integration
        ref: "server/test/youtube.test.ts#innertube total miss, yt-dlp absent (ROADMAP SC2 degradation contract) > returns 200 with ytdlpMissing: true rather than throwing"
        status: pass
    human_judgment: false
  - id: D3
    description: "Documentation corrected: PIPE-01 provenance note (code already shipped in 4f7ff0e/PR#10), two descope decisions recorded, transcriptChain adjacent-gap flagged as a Phase 4 watch item — traceability table left untouched"
    requirement: "PIPE-01"
    verification:
      - kind: other
        ref: "grep -c '4f7ff0e' .planning/REQUIREMENTS.md == 1; grep -c 'transcriptChain' .planning/STATE.md == 1; grep -c 'PIPE-01 | Phase 1 | Pending' .planning/REQUIREMENTS.md == 1"
        status: pass
    human_judgment: false

# Metrics
duration: 20min
completed: 2026-08-09
status: complete
---

# Phase 1 Plan 1: YouTube Caption-Fallback Regression Coverage Summary

**First route-level test in the repo (`server/test/youtube.test.ts`, 6 tests) permanently guards the caption-fallback fix that shipped once, live-verified, with zero prior automated coverage — plus a new DI seam in `ytdlp.ts` and corrected PIPE-01 provenance in the planning docs.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-08-09
- **Completed:** 2026-08-09
- **Tasks:** 3
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- Added `__setResolveYoutubeForTests` dependency-injection seam to `server/src/lib/ytdlp.ts`, placed *after* the `assertValidYoutubeUrl` allowlist guard so the security check still runs on every path, including injected test ones.
- Wrote `server/test/youtube.test.ts` — the first route-level (`app.inject()`) test in this codebase — covering all five branches of `POST /api/youtube/resolve` (`routes/youtube.ts:40-84`): innertube fast path, metadata-only + fallback success, metadata-only + fallback throw (non-fatal), total innertube miss + yt-dlp success, total innertube miss + yt-dlp absent (`ytdlpMissing: true`), plus a bad-host 400 regression guard for the SSRF-adjacent allowlist (threat T-01-02).
- Corrected `.planning/REQUIREMENTS.md`'s PIPE-01 entry with a provenance note (the route-side fix landed on `main` in commit `4f7ff0e`/PR #10 before this requirements file was authored) and recorded two Phase 1 descope decisions plus the `transcriptChain.ts` adjacent-gap finding in `.planning/STATE.md`.
- `server/src/routes/youtube.ts` is byte-identical to its state at plan start — verified via `git diff --stat` both against the working tree and against `main`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Prove the caption-fallback path end-to-end through a real route request** - `0c36dad` (test)
2. **Task 2: Cover the four remaining resolve branches** - `01365c0` (test)
3. **Task 3: Record the real PIPE-01 status, the descope, and the adjacent gap found while planning** - `b11f901` (docs)

_No TDD RED/GREEN split — these are regression tests against already-shipped, proof-verified behavior (tracer + auto task types), not new behavior being test-driven into existence._

## Files Created/Modified

- `server/test/youtube.test.ts` - New file, 6 tests, first route-level test in the repo
- `server/src/lib/ytdlp.ts` - Added `resolveYoutubeOverride` module state + `__setResolveYoutubeForTests` export + one guard line inside `resolveYoutube`
- `.planning/REQUIREMENTS.md` - PIPE-01 bullet gained a provenance parenthetical; traceability table untouched
- `.planning/STATE.md` - Two new dated Decisions entries; one new Blockers/Concerns entry

## Decisions Made

- DI override guard placed after `assertValidYoutubeUrl(url)`, not before — matches the plan's explicit security requirement and is proven by the bad-host test asserting neither adapter is reached.
- Uncached repeat-resolve latency (yt-dlp re-spawns on every cache-miss route call) is explicitly descoped for Phase 1 — PIPE-01's success criteria require the fallback to run, not to be cached, and single-paste flows hit it once.
- `transcriptChain.ts`'s lazy caption pull (`pullYoutubeTranscript`, chain step 3) has no yt-dlp fallback and is out of Phase 1 scope — flagged as a Phase 4 proof-run watch item rather than silently left undiscovered.

## Deviations from Plan

None - plan executed exactly as written. All three tasks matched their `<action>` and `<acceptance_criteria>` blocks without requiring auto-fixes, blocking-issue resolution, or architectural changes.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for `01-02-PLAN.md` (PIPE-02: slide-PDF `emptyPageCount` signal).
- ROADMAP SC1, SC2 (route-level), and SC4 (YouTube half) are now automated-test-guarded; the 2026-08-08 proof bug cannot silently regress.
- The Phase 4 proof run should watch for: (a) repeat-resolve latency from the uncached yt-dlp fallback, and (b) whether `transcriptChain.ts`'s unfallback'd lazy pull ever surfaces on an Innertube-transcript-blocked network during a real session.
- No blockers for Phase 1 Plan 2.

---
*Phase: 01-ingestion-pipeline-repair*
*Completed: 2026-08-09*

## Self-Check: PASSED

- FOUND: server/test/youtube.test.ts
- FOUND: server/src/lib/ytdlp.ts
- FOUND: .planning/phases/01-ingestion-pipeline-repair/01-01-SUMMARY.md
- FOUND commit: 0c36dad (test 1/3)
- FOUND commit: 01365c0 (test 2/3)
- FOUND commit: b11f901 (docs 3/3)
