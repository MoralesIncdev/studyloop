<!-- refreshed: 2026-08-09 -->
# Codebase Concerns

**Analysis Date:** 2026-08-09

## Tech Debt

**Monolithic store with 2743 lines of business logic:**
- Issue: `web/src/state/store.ts` handles routing, library load, config, projects, notes, bubbles, transcripts, analysis orchestration, review, polling, and more in a single Zustand store.
- Files: `web/src/state/store.ts`
- Impact: Difficult to test in isolation, high cognitive load when debugging, merge conflicts likely with concurrent feature work, difficult to reason about timing and side-effects across large coordinate space
- Fix approach: Split into domain-specific stores (one per major feature: analysis, review, library, etc.) or extract orchestration logic into higher-level hooks, keeping current store as a unifying interface layer

**Module-level timer/state management scattered across store:**
- Issue: Multiple `ReturnType<typeof setTimeout|setInterval>` variables live outside the store at module scope (notesSaveTimer, analyzePollTimer, transcribePollTimer, heatmapDebounceTimer, playbackFocusTimer, contextFlashTimer). While cleanup is implemented in `clearProjectSession()` (lines 1369-1440), edge cases around navigation/unmounting could leave orphaned timers.
- Files: `web/src/state/store.ts` lines 61-148 (timer declarations), 1369-1374 (cleanup)
- Impact: Potential memory leak if `clearProjectSession()` is bypassed (e.g., browser close during request, React StrictMode teardown). Timers firing after project switch cause state mutations to wrong project.
- Fix approach: Move timer state into a separate module-scoped manager class with guaranteed cleanup hooks, or use React refs + useEffect to bind timers to component lifecycle instead

**Zod v3 hardcoded while analysis engine uses v4-style imports:**
- Issue: `server/package.json` pins `"zod": "^3.23.8"`. Analysis engine (`server/src/lib/analysis.ts` lines 1-30) deliberately avoids `client.messages.parse()` and `zodOutputFormat()` because the SDK internally uses zod/v4, and mixing v3-classic and v4 schemas causes "parse helper fights you" errors. Manual JSON schema validation + zod validation is implemented as a workaround.
- Files: `server/package.json` line 22, `server/src/lib/analysis.ts` lines 1-30
- Impact: Can't adopt SDK's structured-output helpers when zod upgrades occur. Maintenance burden if any schema library changes.
- Fix approach: Upgrade to zod v4 ecosystem-wide, then migrate all schema definitions and re-enable `client.messages.parse()`; or document the v3→v4 barrier as permanent if backward compat is required

**Large analysis.ts file (1968 lines):**
- Issue: `server/src/lib/analysis.ts` combines chunk windowing, LLM prompt orchestration, merge/dedup logic, spine typing, evidence/overlay fields, and merge pass orchestration. Line count exceeds sustainable review/test boundaries.
- Files: `server/src/lib/analysis.ts`
- Impact: High complexity per function, difficult to test chunk logic without a full analysis run, difficult to modify merge pass without regression risk
- Fix approach: Extract chunking into `lib/analysisChunking.ts`, merge pass into `lib/analysisMerge.ts`, and overlay/evidence field handling into `lib/analysisOverlay.ts`; keep main file as orchestrator only

## Known Bugs

**Store state race condition during project switching:**
- Symptoms: If a network request (analyze, load concepts, etc.) is in-flight when `navigate({view: "library"})` is called, the response handler checks `get().currentProject?.id !== projectId` to discard stale results. However, if a *second* project is loaded while the first response is pending, the check passes incorrectly (comparing against the new project's id).
- Files: `web/src/state/store.ts` lines 2336, 2374, etc. (many "stale-GET discard" patterns)
- Trigger: 1. Load Project A (network request pending) 2. Navigate to Library 3. Load Project B (while A's response is still in-flight) 4. A's response arrives, check passes because `currentProject?.id === B.id`
- Workaround: The code uses `sessionRequestId` (line 1376) to guard against this, but it's not consistently applied to all async flows — some use only the projectId check
- Status: Observed pattern documented but not confirmed as active bug

**Polling timers not idempotent across concurrent API errors:**
- Symptoms: If `pollAnalyzeStatus` (lines 2364-2398) encounters a network error on line 2373 `api.getAnalyzeStatus(projectId)`, it silently catches and retries on the next tick. However, if the error is transient and recovers mid-poll, the polled `status` updates could be out-of-order (e.g., old pct=20% arrives after newer pct=80%, resetting progress bar).
- Files: `web/src/state/store.ts` lines 2394-2396 (silent catch in poll loop)
- Impact: Progress bar jitter on flaky networks, misleading user feedback on analysis progress
- Fix approach: Track poll request timestamps and discard stale responses; or use a promise queue to guarantee poll responses are applied in order

**Notes autosave doesn't flush on component unmount in all code paths:**
- Symptoms: `StudyView.tsx` calls `flushNotes()` on unmount cleanup, but if a user closes the browser tab or navigates via back button before React cleanup fires, in-flight edits are lost.
- Files: `web/src/state/store.ts` (flushNotes at lines 2081-2111), components that call it
- Trigger: Close tab mid-edit in notes pane
- Workaround: localStorage auto-recovery not implemented
- Status: Acknowledged in code comments but no mitigation

## Security Considerations

**No authentication or authorization layer:**
- Risk: The StudyLoop server binds to loopback only by default (HOST defaults to 127.0.0.1, line 47 in `server/src/index.ts`), but if deployed with `HOST=0.0.0.0` or behind a proxy with `X-Forwarded-For`, any network peer can read/modify projects, concepts, notes, attestations without auth.
- Files: `server/src/index.ts` lines 44-47, all route handlers assume trusted client
- Current mitigation: Loopback binding only + documentation warning
- Recommendations: If exposing beyond localhost, implement OAuth2/session tokens before production use; consider rate limiting on all endpoints

**CORS allows all localhost origins:**
- Risk: Overly permissive `origin` check (line 59-64 in `server/src/index.ts`) allows any localhost variant (127.0.0.1, localhost, ::1) with any port. If a malicious localhost web server runs on a different port, it can make requests on behalf of the user.
- Files: `server/src/index.ts` lines 58-65
- Current mitigation: Localhost binding in default config
- Recommendations: Restrict to a fixed origin (e.g., http://localhost:5173) rather than regex match, or require explicit CORS header negotiation

**No validation of uploaded slide PDFs:**
- Risk: `routes/slides.ts` accepts multipart file uploads and passes them to `pdf-parse` library. If a malicious PDF triggers a parser DoS or OOM, it could crash the server.
- Files: Upstream dependency `pdf-parse`, route handler in `server/src/routes/slides.ts`
- Impact: Server crash via crafted PDF, denial of service
- Recommendations: Add file size limit (e.g., max 50MB), add timeout wrapper around pdf-parse call, consider rate-limiting file uploads per project

**Path traversal validation is lexical, not realpath:**
- Risk: `isInsideRoot()` check in `projectDir()` and `overlayFilePath()` uses lexical path string comparison, not filesystem resolution. A symlink could theoretically bypass this check if a project directory contains symlinks pointing outside the projects root.
- Files: `server/src/lib/store.ts` lines 114-121, 180-187, `server/src/lib/paths.ts` (isInsideRoot implementation)
- Current mitigation: Project IDs are UUIDs (schema-validated), overlay filenames are server-generated, so attacker can't directly control the path traversal sequence
- Recommendations: If user-provided filenames ever become part of project operations, use realpath resolution instead of lexical checks

## Performance Bottlenecks

**Analysis chunking with overlap causes redundant LLM calls:**
- Problem: Chunks are windowed with 1-minute overlap (SPEC). For a 1-hour lecture, this results in ~52 chunks instead of 8. Each chunk makes an independent LLM call. For dense videos, this multiplies cost and latency.
- Files: `server/src/lib/analysis.ts` lines 355-400 (chunking logic)
- Cause: Overlap was added to ensure concepts on chunk boundaries aren't missed, but the tradeoff isn't configurable per lens or heuristically optimized based on transcript density
- Improvement path: Implement adaptive overlap based on concept-detection confidence at boundaries, or add a per-lens `chunkOverlapSeconds` parameter to allow trading cost/recall

**Concept merge queue processes *all* previous concepts for every new project:**
- Problem: `conceptRegistry.ts` calls `updateRegistryForProject()` on every analysis completion, which re-examines every existing concept for merge candidates. For large registries (100s of concepts), this is quadratic on new projects.
- Files: `server/src/routes/analyze.ts` line 14, `server/src/lib/conceptRegistry.ts`
- Impact: Analysis completion blocks on registry merge pass; slow on the 3rd+ project
- Improvement path: Implement incremental merge (only candidate=new concepts against recent analyses), or defer merge to background cron task

**Web app doesn't implement virtualization for large concept lists:**
- Problem: The Concepts cabinet renders `concepts.length` cards without windowing (e.g., 200+ concepts in a dense lecture). React renders all cards even if 20 fit on screen.
- Files: `web/src/console/cabinets/ConceptsCabinet.tsx` (or similar)
- Impact: Main thread blocking on large projects, jank during scroll
- Improvement path: Add react-window or similar virtualization layer to concept card list

**Transcript segment rendering in study view doesn't debounce scroll updates:**
- Problem: Seeking/scrubbing on the timeline triggers `activateSegment` logic which may re-render the entire transcript pane. No debounce on seek events.
- Files: `web/src/study/RightRail.tsx` (transcript rendering)
- Impact: Jank on playback speed changes or rapid scrubbing
- Improvement path: Debounce transcript segment highlight updates to 100ms

## Fragile Areas

**Heatmap overlay state is not atomic with analysis metadata:**
- Files: `web/src/state/store.ts` (loadHeatmap at 2407-2433), `web/src/study/RightRail.tsx` (heatmap rendering)
- Why fragile: Analysis can exist but heatmap can fail to load (network error, server returns 404). The UI assumes heatmap and analysis are in sync. If heatmap fails mid-render, progress bar may hang in "loading" state.
- Safe modification: Wrap loadHeatmap in a try-catch that falls back to "no heatmap" view rather than leaving the UI in an indeterminate state; or make heatmap loading part of the analysis completion pipeline (either both succeed or both fail)

**Attestation mutations use optimistic updates without rollback:**
- Files: `web/src/state/store.ts` lines 1565-1589 (attestUnit, saveUnitTake, etc.)
- Why fragile: Attestation patch mutations update local state immediately, then call the API. If the API fails after local update, the UI is out of sync with server. Retry logic would reapply a stale patch.
- Safe modification: Use transactional pattern — update local state only after API confirms, or implement proper rollback on API failure (revert to server state)

**Concept continuity rail loads independently of analysis:**
- Files: `web/src/state/store.ts` (loadContinuity at 2254-2281), routes/continuity.ts
- Why fragile: Continuity is loaded on project open alongside analysis, but continuity depends on analysis concepts being present. If analysis is stale/missing, continuity can reference concepts that don't exist in the current analysis, causing render crashes.
- Safe modification: Make continuity a child of the analysis payload (load it as part of analysis completion), or validate continuity concept IDs against current analysis before rendering

**E2E test smoke suite is minimal (1 file, console-smoke.spec.ts):**
- Files: `e2e/console-smoke.spec.ts`
- Why fragile: Only one end-to-end Playwright test exists. No coverage of: upload → analyze → review → export flows, multi-project scenarios, offline/slow-network resilience, or browser back-button behavior
- Safe modification: Add e2e tests for critical flows before making large refactors; consider adding visual regression testing for the console UI

## Scaling Limits

**Server analysis job queue is single-process in-memory:**
- Current capacity: `analysisJobs` (lines 26-27, routes/analyze.ts) uses a Map to track running jobs. Only one analysis can run at a time per project, enforced by `evaluateAnalyzeGuard()`. Across all projects, the limit is the LLM API rate limit.
- Limit: If a 2-hour lecture analysis takes 30 minutes, the user can't queue a second project's analysis — they must wait. Browsers tab limit is per-device.
- Scaling path: Implement a persistent job queue (Redis, PostgreSQL) with a worker pool; allows queueing analyses across sessions/restarts

**Concept registry is all-in-memory JSON file:**
- Current capacity: `conceptRegistry.json` grows with every unique concept created. Current observed size: 85KB for ~500 concepts across 20 projects.
- Limit: At ~10KB per 60 concepts, a 10,000-concept registry would be ~1.7MB. Read/write on every analysis completion becomes slow. Merge-candidate computation is O(n²).
- Scaling path: Migrate to SQLite with indexed queries for merge-candidate lookup; implement lazy-load for concept profiles

**Local video storage model assumes single device:**
- Current capacity: The server stores projects at `<dataDir>/projects/<id>/` on local disk. No cloud sync, no multi-device access.
- Limit: Project size is bounded by local disk space (typical: 100GB+). Exceeding available space causes write failures with poor UX.
- Scaling path: Implement S3 or cloud storage backend for video/analysis assets; or document disk-space monitoring and user guidance

## Dependencies at Risk

**pdf-parse (pdf-parse ^1.1.1) — parsing stability and performance:**
- Risk: `pdf-parse` is a thin wrapper around PDF.js. Known issues: large PDFs can trigger OOM/timeout, some PDF features (embedded fonts, complex graphics) don't parse correctly, library is not actively maintained (last update 2021).
- Impact: Server crash on large PDFs, missing slide text channel content, user confusion when PDF import silently fails
- Migration plan: If PDF parsing becomes a bottleneck, evaluate `pdfjs-dist` directly (more up-to-date), or use a cloud PDF service (AWS Textract, Google Document AI) for offloading

**youtubei.js (^17.2.0) — YouTube API reverse-engineering:**
- Risk: YouTube actively changes their client API. `youtubei.js` is community-maintained. Breaking changes (auth flow changes, endpoint deprecations) can disable auto-transcript and video metadata fetches without warning.
- Impact: YouTube projects can't be created, auto-transcripts fail, video titles/captions become unavailable
- Migration plan: Monitor `youtubei.js` releases; consider adding a fallback to yt-dlp CLI for transcript extraction if the SDK breaks. Document manual transcript upload as a workaround.

**@anthropic-ai/sdk (^0.115.0) — Claude API changes:**
- Risk: SDK major versions change frequently. `structured outputs` (used in analysis engine) are relatively new and subject to API changes. If Anthropic deprecates or changes the JSON schema format, the analysis engine needs rework.
- Impact: Analysis engine becomes incompatible with future Claude versions; cost/performance characteristics may change
- Migration plan: Pin a known-good SDK version in production; monitor Anthropic docs for deprecation notices; consider implementing a compatibility layer that can adapt to schema format changes

## Missing Critical Features

**No backup/export of project data:**
- Problem: A user's projects live entirely in `<dataDir>/projects/`. There's no built-in export to cloud storage or backup tool. If the dataDir is lost, all work is gone.
- Blocks: Production deployment without user confidence in data persistence
- Recommendation: Implement export-to-zip-file feature + optional cloud sync (S3, Google Drive, etc.)

**No undo/rollback for destructive operations:**
- Problem: Deleting overlays, clearing attestations, or running a forced re-analysis are one-way. No undo.
- Blocks: Safe collaborative review workflows, recovery from accidental deletes
- Recommendation: Implement operation log with rollback for attestation mutations; add "Are you sure?" confirmation for force-analysis; consider git-like commit model for analysis snapshots

**No search across all projects:**
- Problem: Search endpoint searches the current project only. Multi-project workspaces have no way to find a concept across many lectures.
- Blocks: Tracking learning progress across a curriculum
- Recommendation: Index concepts by title/id in the registry; implement global search endpoint

**No real-time collaboration:**
- Problem: StudyLoop is single-user per dataDir. If two people want to review the same analysis, they need separate copies.
- Blocks: Peer review workflows, group study sessions
- Recommendation: Consider implementing CRDTs or operational transformation for concurrent edits (out of scope for MVP but document as future roadmap)

## Test Coverage Gaps

**Web UI components lack unit tests:**
- What's not tested: `web/src/study/`, `web/src/console/`, `web/src/library/` React components. Only `store.ts` has extensive tests.
- Files: All `.tsx` files except `App.tsx` (which has minimal tests)
- Risk: Refactors to component props/state break silently; visual regressions go undetected; error boundaries missing means error handling isn't proven
- Priority: High — components are the user-facing interface and likely source of regression bugs

**Analysis engine doesn't test failure paths:**
- What's not tested: LLM API failures (rate limit, auth error, malformed response), chunk validation, merge pass dedup correctness under adversarial concept names, overlay field merging with conflicting types
- Files: `server/test/analysisV3.test.ts` (currently tests happy path + FakeAnalysisClient), `server/test/analysis.test.ts`
- Risk: Silent data corruption if LLM returns invalid JSON and validation doesn't catch it; merge pass could produce duplicate concepts under edge cases
- Priority: High — analysis output is the core product

**Route error handling is not exercised:**
- What's not tested: 404 project not found, permission errors (though auth isn't implemented), malformed request bodies, file I/O failures (disk full, permission denied), concurrent access races
- Files: All `routes/*.ts` files
- Risk: Unhandled exceptions crash the server; user gets generic 500 instead of actionable error message
- Priority: Medium — can be mitigated with integration tests

**E2E test flakiness due to no retry or retry strategy:**
- What's not tested: Actual user workflows (upload video → transcribe → analyze → review → export)
- Files: `e2e/console-smoke.spec.ts`
- Risk: CI flakes on timing-sensitive operations (analysis completion polling, file I/O), developers lose confidence in test suite
- Priority: Medium — implement Playwright retry config and explicit wait strategies

## Anti-Patterns

### Void operator suppressing promise rejections

**What happens:** Multiple async operations start with `void` prefix (e.g., `void get().startAnalyze(true)` on line 2362, `void api...then(...).catch(...)` on line 2414) to suppress TypeScript errors about unawaited promises.

**Why it's wrong:** Errors inside those promises are silently swallowed. If a network call fails or an exception is thrown, the user sees no error toast, the UI doesn't update, and debugging becomes nearly impossible because the error never surfaces.

**Do this instead:** Either `await` the operation and handle errors in a try-catch, or explicitly attach `.catch(err => { get().pushToast(...) })` to the promise. If you need fire-and-forget behavior, at least log the error to console so debugging is possible:
```typescript
// Current (dangerous):
void get().startAnalyze(true);

// Better (explicit error handling):
void get().startAnalyze(true).catch(err => {
  console.error("startAnalyze failed:", err);
  // optionally toast if not already handled inside startAnalyze
});

// Best (if you can refactor):
await get().startAnalyze(true); // error handling is inside the function
```

### Optimistic updates without rollback

**What happens:** Attestation mutations (lines 1565-1589) update local state immediately, then POST to the API. If the API fails, the local state is stale.

**Why it's wrong:** The UI shows success (concept marked "Attested") but the server never received it. Closing the app and reopening shows the attestation was lost. Users lose work and trust the app.

**Do this instead:** Keep mutations pessimistic (wait for API success before updating local state), or implement explicit rollback:
```typescript
// Current (optimistic, no rollback):
set({ attestations: { ...get().attestations, [unitId]: { status: "attested" } } });
await api.patchAttestation(...);

// Better (pessimistic):
const result = await api.patchAttestation(...);
set({ attestations: result });

// Also acceptable (optimistic + rollback):
const prev = get().attestations;
set({ attestations: { ...prev, [unitId]: { status: "attested" } } });
try {
  const result = await api.patchAttestation(...);
  set({ attestations: result });
} catch (err) {
  set({ attestations: prev }); // rollback
  get().pushToast(`Could not save: ${errorMessage(err)}`, "error");
}
```

### Polling with silent catch-all

**What happens:** The poll loop in `pollAnalyzeStatus` (lines 2394-2396) silently catches *all* errors and retries on the next tick. A transient network failure is indistinguishable from a persistent API outage.

**Why it's wrong:** Users see a progress bar stuck at a percentage with no indication of what went wrong. After several silent failures, the polled response arrives out-of-order, rolling back progress incorrectly.

**Do this instead:** Track poll attempt count and bail after N failures; or emit an error status to the UI:
```typescript
// Current (silent catch-all):
void (async () => {
  try {
    const status = await api.getAnalyzeStatus(projectId);
    // ...
  } catch {
    // Transient poll failure (e.g. a dropped request) — retry on the next tick.
  }
})();

// Better (failure tracking):
let pollFailures = 0;
const MAX_POLL_FAILURES = 5;
void (async () => {
  try {
    const status = await api.getAnalyzeStatus(projectId);
    pollFailures = 0; // reset on success
    // ...
  } catch (err) {
    pollFailures++;
    if (pollFailures >= MAX_POLL_FAILURES) {
      clearAnalyzePoll();
      set({ analyzeStatus: { state: "error", message: "Analysis polling failed — please retry" } });
    }
  }
})();
```

---

*Concerns audit: 2026-08-09*
