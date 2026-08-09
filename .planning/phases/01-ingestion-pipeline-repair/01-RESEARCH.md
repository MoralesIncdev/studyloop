# Phase 1: Ingestion Pipeline Repair - Research

**Researched:** 2026-08-09
**Domain:** Server-side ingestion (YouTube caption resolution fallback; PDF slide-deck text extraction signal)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

No CONTEXT.md exists for this phase (`/gsd-discuss-phase` was not run). This research treats
`.planning/REQUIREMENTS.md` (PIPE-01, PIPE-02) and the ROADMAP.md Phase 1 section (given in the
task prompt) as the decision source. There are no locked decisions, discretion notes, or deferred
ideas to copy verbatim — the planner has full discretion within the requirement text and success
criteria below.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PIPE-01 | YouTube resolve runs the yt-dlp caption fallback whenever Innertube returns null captions — not only when the whole resolve fails — so the normal paste-a-URL flow produces a transcript-bearing project with no manual workaround. | **Already fixed in code** (commit `4f7ff0e`, merged to `main` via PR #10 on 2026-08-08, *before* REQUIREMENTS.md was authored on 2026-08-09). See Summary. Remaining work is regression-test coverage only — see Architecture Patterns / Common Pitfalls for the exact gap and how to close it within the codebase's existing conventions. |
| PIPE-02 | Slide-PDF ingestion reports pages with no extractable text (`emptyPageCount`) and the app visibly warns on image-only decks instead of silently attaching an empty slides channel. | **Not implemented.** `emptyPageCount` does not exist anywhere in the codebase (`grep -r emptyPageCount server/ web/` → zero hits, verified this session). This is real, unstarted work — full change surface identified below (schema, extractor, route, store, UI). |
</phase_requirements>

## Summary

This phase has two requirements that are in **very different states**, and the planner must treat
them differently.

**PIPE-01 is already fixed on `main`.** The bug the proof report (`docs/REAL-LECTURE-PROOF-2026-08-08.md`)
found — `server/src/routes/youtube.ts` short-circuiting on `resolved.title || resolved.captions`
before the yt-dlp fallback could run — was fixed the same evening the proof ran, in commit
`4f7ff0e` ("Fall through to yt-dlp captions when Innertube resolves metadata-only"), and merged to
`main` via PR #10 on 2026-08-09 09:53:54, roughly four hours before `.planning/REQUIREMENTS.md` was
authored (2026-08-09, per its own header). The commit message states it was "Verified live: the
proof lecture went from no captions to 626 segments." Reading the current file confirms the fix is
in place exactly as PIPE-01's success criteria #1 and #2 describe: metadata-but-no-captions now
triggers a non-fatal yt-dlp caption fallback before the route answers (`server/src/routes/youtube.ts:45-63`),
and `ytdlpMissing: true` degradation (`server/src/lib/ytdlp.ts:186`) already does not block project
creation (`web/src/state/store.ts:968-974` explicitly comments "yt-dlp missing must not block
project creation"). **What is genuinely missing is success criterion #4: regression test coverage.**
There is zero test coverage of `server/src/routes/youtube.ts`'s branching logic — `innertube.test.ts`
and `ytdlp.test.ts` each test their own lib layer in isolation, but nothing exercises the route's
merge/fallback decision tree end-to-end. The planner should scope PIPE-01's plan around **adding
regression tests for both branches of the fallback** (not around re-fixing already-fixed logic),
and should flag this discrepancy for STATE.md/REQUIREMENTS.md so the "Pending" status against
PIPE-01 gets corrected to reflect reality once tests land.

**PIPE-02 (`emptyPageCount`) is real, unstarted work.** `SlidesMetaSchema` (`server/src/lib/models.ts:271-276`)
has no `emptyPageCount` field, `PdfParseSlideExtractor.extract()` (`server/src/lib/slides.ts:70-93`)
extracts text per page but never checks for emptiness, and `SlidesRow.tsx` (`web/src/study/SlidesRow.tsx`)
renders only `filename`/`pageCount` with no warning affordance. This requires a small, well-contained
change across five files: the shared Zod schema, the extractor, the upload route, the web-side type
mirror, and the UI chip. No new npm packages are needed — this is pure counting logic layered onto
extraction that already runs per-page.

**Primary recommendation:** Plan PIPE-01 as "add regression tests for an already-shipped fix" (small,
test-only plan) and PIPE-02 as "add emptyPageCount end-to-end, server schema through UI warning"
(small, cross-tier plan). Do not re-derive or re-implement the PIPE-01 fallback logic — read it first
so the plan's verification step is "assert existing behavior, don't rewrite it."

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| YouTube metadata/caption resolution (Innertube + yt-dlp fallback) | API / Backend | — | `server/src/routes/youtube.ts` + `server/src/lib/innertube.ts` + `server/src/lib/ytdlp.ts`; client only calls `POST /api/youtube/resolve` and passes the result through, no client-side YouTube API logic exists |
| Project creation with resolved captions | API / Backend | Browser / Client | `POST /api/projects` (`server/src/routes/projects.ts:62-111`) persists `captions.json` server-side; client (`web/src/state/store.ts:960-995`) orchestrates the resolve→create sequence and owns the `ytdlpMissing` toast |
| PDF slide text extraction | API / Backend | — | `server/src/lib/slides.ts` (pdf-parse wrapper) + `server/src/routes/slides.ts` (multipart upload route); pure server-side, no client parsing |
| Empty-page / image-only detection signal | API / Backend | Browser / Client | Computing `emptyPageCount` is a backend concern (byproduct of extraction already happening server-side); *surfacing* the warning is a client concern (`SlidesRow.tsx`) — both tiers need a coordinated schema change |
| Regression test coverage for the fallback branches | API / Backend (test) | — | Codebase convention is lib-layer unit tests, not route-level tests (see Architecture Patterns) — testing `routes/youtube.ts`'s branching directly requires either extracting the logic to a testable lib function or a `Fastify().inject()`-based route test, both server-side concerns |

## Standard Stack

### Core (already installed — no new packages needed this phase)

| Library | Version (verified) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `pdf-parse` | `^1.1.1` [VERIFIED: server/package.json:20] | Per-page PDF text extraction | Already the project's chosen extractor; deliberately pinned to the pure-JS 1.x line to avoid native binaries (see `server/src/lib/slides.ts:10-18` header comment) — do not upgrade to 2.x as part of this phase, that's a separate, larger change |
| `youtubei.js` | `^17.2.0` [VERIFIED: server/package.json:21] | Innertube client for YouTube metadata/captions | Already the project's fast-path resolver; this phase touches its *consumer* (`routes/youtube.ts`), not the library itself |
| `zod` | `^3.23.8` [VERIFIED: server/package.json:22] | Schema validation for `SlidesMetaSchema`/`SlidesFileSchema` and all route bodies | Existing project-wide convention; extend the existing schema, don't introduce a parallel validation approach |
| `fastify` | `^4.28.1` [VERIFIED: server/package.json:19] | HTTP routing/plugin system | `youtubeRoutes` and `slidesRoutes` are both plain `async (app: FastifyInstance) => {...}` plugin functions with no special registration order dependency — see Architecture Patterns for the testing implication |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Counting empty pages by `text.trim().length === 0` | OCR-based "is this page actually an image" detection | Explicitly out of scope — `server/src/lib/slides.ts:4` header comment: "Full frame-capture/OCR is future work — this is the smallest proven-value slice." PIPE-02's own requirement text only asks for `emptyPageCount`, not OCR. Do not scope OCR into this phase. |
| Route-level `app.inject()` test for `routes/youtube.ts` | Extracting the fallback/merge logic into a pure, injectable lib function (matching the `__setXForTests` pattern used elsewhere) | Either is viable; the lib-extraction approach better matches existing codebase convention (see Architecture Patterns) and produces faster, more isolated tests, but touches production code (moving logic out of the route file) where the `app.inject()` approach tests the route file as-is. Planner should pick based on how much the phase wants to touch already-working code — leaning toward `app.inject()` to minimize risk to a fix that's already verified live. |

**Installation:** None required — this phase modifies existing dependencies' call sites only.

## Package Legitimacy Audit

Not applicable. This phase introduces no new external packages; all libraries used (`pdf-parse`,
`youtubei.js`, `zod`, `fastify`) are pre-existing project dependencies verified against
`server/package.json`. No `package-legitimacy check` run was needed.

## Architecture Patterns

### System Architecture Diagram

```text
PIPE-01 flow (already fixed — verify with regression tests, don't rewrite):

  Browser (web/src/state/store.ts:960 createYoutubeProject)
    │
    │ POST /api/youtube/resolve { url }
    ▼
  routes/youtube.ts (server)
    │
    ├─▶ resolveVideo(videoId)  [lib/innertube.ts — Innertube/youtubei.js, 10s timeout, 15-min cache]
    │      │
    │      ├─ title present, captions present  → return immediately (fast path)
    │      │
    │      └─ title present, captions NULL     → [FIXED 2026-08-08] try yt-dlp fallback:
    │             │                                resolveYoutube(url) [lib/ytdlp.ts]
    │             │                                merge legacy.captions into response
    │             │                                (non-fatal: falls through to metadata-only
    │             │                                 on any yt-dlp failure)
    │             ▼
    │           return { videoId, title, author, durationSeconds, captions, related }
    │
    └─▶ (Innertube totally empty) → resolveYoutube(url) [lib/ytdlp.ts] full legacy path
           │
           ├─ yt-dlp present  → { videoId, title, captions }
           └─ yt-dlp missing  → { videoId, title: null, captions: null, ytdlpMissing: true }
                                  (does NOT throw — project creation proceeds)
    │
    ▼
  Browser: POST /api/projects { source, captions, ... }
    │
    ▼
  routes/projects.ts (server) → writeCaptions() → captions.json → transcript {type:"file"}


PIPE-02 flow (NOT implemented — build this):

  Browser: <input type=file> PDF (SlidesRow.tsx)
    │
    │ POST /api/projects/:id/slides (multipart)
    ▼
  routes/slides.ts
    │
    ▼
  resolveSlideExtractor().extract(buffer)  [lib/slides.ts — PdfParseSlideExtractor]
    │
    │  pdf-parse pagerender callback already runs PER PAGE (slides.ts:78-89)
    │  ADD HERE: after building `text` for a page, if text.trim() === "",
    │  count it toward emptyPageCount before pushing to `pages[]`
    ▼
  { pageCount, pages, emptyPageCount }  ← extend ExtractedSlides return shape
    │
    ▼
  routes/slides.ts: meta = { filename, pageCount, emptyPageCount, uploadedAt }
    │
    ▼
  writeSlides() → slides.json { meta, pages }
    │
    ▼
  Browser: store.ts uploadSlides() sets slidesMeta = res.meta
    │
    ▼
  SlidesRow.tsx: slidesMeta.emptyPageCount > 0 → visible warning chip
```

### Recommended Project Structure

No new files/directories are needed. This phase is a targeted edit to existing files:

```text
server/src/
├── lib/
│   ├── models.ts         # extend SlidesMetaSchema with emptyPageCount: z.number().int().nonnegative()
│   ├── slides.ts         # ExtractedSlides gains emptyPageCount; PdfParseSlideExtractor computes it
│   └── ytdlp.ts          # (PIPE-01 test coverage) consider adding __setResolveYoutubeForTests DI hook
├── routes/
│   ├── slides.ts         # meta object gains emptyPageCount (line ~69)
│   └── youtube.ts        # unchanged — already fixed; read-only for this phase
└── test/
    ├── slides.test.ts    # extend: extractor emptyPageCount cases, route meta shape
    └── youtube.test.ts   # NEW FILE — route-level regression test (doesn't exist yet)

web/src/
├── lib/types.ts           # SlidesMeta interface gains emptyPageCount: number
└── study/SlidesRow.tsx    # render warning when slidesMeta.emptyPageCount > 0
```

### Pattern 1: Dependency-Injection Test Boundary (established codebase convention)

**What:** Every server module that talks to an external system (LLM, PDF library, YouTube client)
exposes a `resolveX()` factory plus a `__setXForTests(fake)` override, so tests inject a deterministic
fake instead of hitting the real dependency.

**When to use:** Any time a test needs to control the fallback/merge branch of `routes/youtube.ts`
without spawning a real yt-dlp process or hitting the network.

**Example (existing pattern — `lib/slides.ts:95-104`):**
```typescript
// Source: server/src/lib/slides.ts:95-104 (read this session)
let injectedExtractorForTests: SlideExtractor | null = null;

export function __setSlideExtractorForTests(extractor: SlideExtractor | null): void {
  injectedExtractorForTests = extractor;
}

export function resolveSlideExtractor(): SlideExtractor {
  if (injectedExtractorForTests) return injectedExtractorForTests;
  return new PdfParseSlideExtractor();
}
```
The same shape exists for Innertube (`server/src/lib/innertube.ts:145-150`,
`__setInnertubeClientForTests`) and the analysis LLM client (`server/src/lib/analysis.ts`,
`__setAnalysisClientForTests`, per `CONCERNS.md`/`TESTING.md`).

**Gap found this session:** `server/src/lib/ytdlp.ts` has **no equivalent** `__setXForTests` hook —
only `process.env.STUDYLOOP_YTDLP_BIN` (used today to point at a nonexistent binary so calls fail
deterministically; see `server/test/ytdlp.test.ts:81-95`). This is sufficient for testing the
"yt-dlp unavailable" branch but **not** sufficient for testing "yt-dlp is available and returns
captions" — the branch PIPE-01's fallback actually depends on. The planner should decide between:
(a) adding a `__setResolveYoutubeForTests` hook to `ytdlp.ts` matching the established pattern, or
(b) writing a tiny fixture stub script (invoked via `STUDYLOOP_YTDLP_BIN`) that mimics yt-dlp's CLI
output (writes a `.vtt` file for `--write-auto-sub`, prints a title for `--print %(title)s`).
Option (a) is more consistent with codebase convention and faster/more deterministic; option (b) is
closer to a true integration test. Given the codebase's own stated test philosophy (`TESTING.md`:
"What NOT to Mock: ... Core business logic — always test real implementations", but also "What to
Mock: ... LLM API clients (use Fake implementations)" and the DI pattern used for every other
external system), **(a) matches project convention** and is the recommended default.

### Pattern 2: Route-level testing via `Fastify().inject()` on an isolated plugin instance

**What:** Register only the plugin under test on a fresh `Fastify()` instance, then use `.inject()`
to fire virtual HTTP requests — no port binding, no full `index.ts` bootstrap needed.

**When to use:** `routes/youtube.ts`'s POST `/api/youtube/resolve` handler has no dependency on
other registered plugins (no multipart, no CORS requirement for a same-process test) — it can be
tested standalone.

**Example:**
```typescript
// Pattern confirmed by Fastify's own testing guide — general Fastify convention,
// not yet used anywhere in this codebase (server/test has zero app.inject() usage
// today, verified via grep this session — routes are conventionally untested
// directly, only lib/ modules are). Source: https://fastify.dev/docs/v5.3.x/Guides/Testing/
import Fastify from "fastify";
import { youtubeRoutes } from "../src/routes/youtube.js";

const app = Fastify();
await app.register(youtubeRoutes);
await app.ready();

const res = await app.inject({
  method: "POST",
  url: "/api/youtube/resolve",
  payload: { url: "https://www.youtube.com/watch?v=xxxxxxxxxxx" },
});
```
[CITED: fastify.dev/docs/v5.3.x/Guides/Testing] — this is the officially documented Fastify pattern,
not yet used in this repo (repo convention is lib-only testing — see `server/src/lib/slides.ts:38-42`
comment: "this repo's routes/*.ts files aren't otherwise unit-tested"). Introducing the first
route-level test is a **deviation from stated convention** worth flagging explicitly in the plan —
either justify it (route-level is the only way to exercise the actual branching decision in
`routes/youtube.ts:45-63`) or extract the branching logic into a testable `lib/` function instead
(see Alternatives Considered above).

### Anti-Patterns to Avoid

- **Re-implementing the PIPE-01 fix:** The fallback logic in `routes/youtube.ts:45-63` is already
  correct and verified live. Do not regenerate this logic from the requirement text alone — read the
  file first (this research already has). A plan that rewrites this code risks introducing a
  regression into working, proof-verified behavior.
- **Treating `text === ""` as the only "empty" signal:** PDF text extraction can return whitespace-only
  strings (a stray space, newline, or non-breaking space from a caption layer) that are visually empty
  but not `===""`. Use `text.trim().length === 0` for the `emptyPageCount` check, matching how the
  rest of the codebase treats "empty" (`server/src/lib/analysis.ts:155-158`'s empty-string array
  filtering, per `docs/REAL-LECTURE-PROOF-2026-08-08.md` Bug 5, also uses trim-equivalent emptiness).
- **Skipping the web-side type mirror:** `web/src/lib/types.ts:527-532`'s `SlidesMeta` interface is a
  hand-maintained mirror of `server/src/lib/models.ts:271-276`'s `SlidesMetaSchema` (comment at
  `types.ts:525`: "Mirrors server/src/lib/models.ts's SlidesMetaSchema/SlidesFileSchema") — there is
  no shared-types package. Forgetting to update the web-side interface will produce a TypeScript-valid
  but runtime-silent bug (the field exists on the wire but the client type doesn't know about it, so
  nothing renders and no compile error fires unless `strict` unused-property checks catch it, which
  they generally don't for extra fields on an inbound JSON object).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Detecting whether a PDF page has no real text (vs. genuinely blank) | A heuristic "is this an image" classifier, image-density analysis, or OCR pass | Simple `text.trim().length === 0` count per page, already computable inside the existing `pagerender` callback (`server/src/lib/slides.ts:78-89`) | PIPE-02's requirement text explicitly scopes to `emptyPageCount` as a signal, not a fix; OCR is explicitly deferred future work per the file's own header comment |
| Testing yt-dlp CLI behavior | A full subprocess mocking framework or shelling out to a real network-dependent yt-dlp call in tests | The existing `STUDYLOOP_YTDLP_BIN` env-var override (already proven in `ytdlp.test.ts`) plus (recommended) a new `__setResolveYoutubeForTests` DI hook matching the `innertube.ts`/`slides.ts`/`analysis.ts` pattern | Keeps tests fast/deterministic and consistent with the rest of the test suite; avoids flaky network-dependent CI runs |
| A generic Fastify test-server bootstrap utility | A shared `buildApp()`/`createTestServer()` helper importing all 25+ route plugins | Register only `youtubeRoutes` (or the plugin under test) on a fresh, minimal `Fastify()` instance | `youtubeRoutes` has no cross-plugin dependency (unlike `slidesRoutes`, which needs `multipart` registered first — see `index.ts:84,98`); a minimal per-test instance is faster and avoids coupling the test to unrelated plugin registration order |

**Key insight:** Both requirements in this phase are solvable with additions to code that already
does 90% of the work (the extraction loop, the fallback branch) — the risk in this phase is not
missing library knowledge, it's disturbing already-correct, proof-verified logic while adding the
missing 10%.

## Common Pitfalls

### Pitfall 1: Planning PIPE-01 as if the bug still exists
**What goes wrong:** A plan generated purely from PIPE-01's requirement text and the proof doc
(without reading current `routes/youtube.ts`) will re-derive and re-implement the fallback logic,
potentially diverging from the already-verified-live fix, or duplicating logic and creating a second,
subtly different code path.
**Why it happens:** `REQUIREMENTS.md` was authored 2026-08-09 from the proof doc dated 2026-08-08,
but the fix landed on `main` at 2026-08-08 19:01 (commit `4f7ff0e`) — before the requirements doc's
own timestamp. The requirements text describes the *symptom*, not the *current code state*.
**How to avoid:** Plan tasks should start with "read `server/src/routes/youtube.ts:45-63`, confirm the
fallback is present and correct" as an explicit verification step, then scope remaining tasks to test
coverage only.
**Warning signs:** A plan with tasks like "modify the short-circuit condition in youtube.ts" — the
condition is already correct; there's nothing to modify there.

### Pitfall 2: Repeated resolve calls re-trigger the 30s yt-dlp subprocess on every request
**What goes wrong:** `resolveVideo()`'s in-memory cache (`server/src/lib/innertube.ts:172,330-363`,
15-minute TTL) caches the *Innertube-only* result — `captions: null` when Innertube's transcript call
fails. The yt-dlp merge happens in `routes/youtube.ts`, **outside** `resolveVideo()`, so it is never
cached. Every repeat resolve of the same video within the 15-minute Innertube cache window re-spawns
yt-dlp (up to a 30s timeout per `server/src/lib/ytdlp.ts:43`) even though the previous call already
fetched captions successfully.
**Why it happens:** The cache boundary is drawn around `resolveVideo()` only; the route-level merge
was added afterward and wasn't threaded through the cache.
**How to avoid:** Out of scope for PIPE-01's stated success criteria (which only requires the fallback
to *run*, not to be cached) — but worth flagging as an **Open Question** for the planner to explicitly
descope or accept, rather than leave undiscovered. Not a blocker; a repeat resolve within the flow
described by the success criteria (paste URL once) only hits this path once.
**Warning signs:** A user re-opening the same "add YouTube video" form for a URL they just added
would trigger a second ~5-30s yt-dlp spawn with no visible caching benefit.

### Pitfall 3: `pdf-parse`'s `pagerender` callback signature is easy to get wrong when adding a second counter
**What goes wrong:** The existing callback (`server/src/lib/slides.ts:78-89`) closes over `pages` (an
array, mutated via `.push`) inside the `pagerender` async callback, which pdf-parse invokes once per
page as it parses. Adding `emptyPageCount` tracking requires a second piece of shared, mutable state
closed over the same way (a `let emptyPageCount = 0` in `extract()`'s scope, incremented inside the
same callback) — not a separate pass over `pages` after `pdfParse()` resolves, because the callback is
the only place per-page text is materialized before it's joined into pdf-parse's own return value
(which this codebase discards, relying entirely on the `pages` side-channel).
**Why it happens:** `pdf-parse`'s API is designed around returning one concatenated string; this
codebase's per-page capture is already a workaround (see the file's own header comment,
`slides.ts:73-77`) built on a side-effecting callback, which is a slightly unusual pattern to extend
correctly on a first read.
**How to avoid:** Increment `emptyPageCount` inside the same `pagerender` callback, right where
`pages.push({ page: pages.length + 1, text })` already happens, using the same `text.trim()` check.
**Warning signs:** A test that mocks `SlideExtractor.extract()` entirely (as `slides.test.ts` already
does, per the injectable-extractor pattern) won't catch a bug in the *real* `PdfParseSlideExtractor`'s
callback — the planner should ensure at least one test exercises the real extractor against a tiny
fixture PDF (or explicitly document why the mocked-extractor-only strategy is accepted, consistent
with `slides.test.ts`'s existing "don't parse a real PDF binary in unit tests unless a tiny fixture is
trivial" comment at `server/src/lib/slides.ts:55`).

### Pitfall 4: Forgetting the web-side `SlidesMeta` type mirror (see Anti-Patterns above)
**What goes wrong:** Server returns `emptyPageCount` on the wire; `web/src/lib/types.ts`'s
`SlidesMeta` interface still only declares `filename`/`pageCount`/`uploadedAt`, so
`slidesMeta.emptyPageCount` is a TypeScript error in `SlidesRow.tsx`, OR (if accessed via an `any`-typed
escape hatch) silently `undefined` at runtime with no compile-time signal.
**Why it happens:** No shared-types package exists between `server/` and `web/` — every cross-tier
shape is hand-mirrored (explicit comment at `web/src/lib/types.ts:525`).
**How to avoid:** Update `web/src/lib/types.ts:528-532`'s `SlidesMeta` interface in the same task/commit
as the server-side `SlidesMetaSchema` change.
**Warning signs:** `npm run typecheck -w web` failing on `SlidesRow.tsx` after adding the warning
render logic is actually the *good* outcome here — it means the type wasn't updated yet. Silent
`undefined` (no typecheck failure) means someone worked around the type instead of updating it.

## Code Examples

### Current (already-correct) PIPE-01 fallback — read before planning, don't rewrite

```typescript
// Source: server/src/routes/youtube.ts:40-74 (read this session, current main)
const videoId = extractVideoId(url);
if (videoId) {
  const started = Date.now();
  const resolved = await resolveVideo(videoId);
  const elapsedMs = Date.now() - started;
  if (resolved.title || resolved.captions) {
    let captions = resolved.captions && resolved.captions.length > 0 ? resolved.captions : undefined;
    if (captions) {
      app.log.info({ videoId, elapsedMs }, "youtube resolve: innertube hit");
    } else {
      // Innertube resolved metadata but not captions — on some networks
      // its transcript endpoint reliably fails while yt-dlp's caption
      // path works. Returning metadata-only here would make the normal
      // resolve-then-create flow build a transcript-less project, so try
      // the yt-dlp caption fallback before answering (non-fatal: on any
      // failure the metadata-only response below still goes out).
      app.log.info({ videoId, elapsedMs }, "youtube resolve: innertube metadata-only, trying yt-dlp for captions");
      try {
        const legacy = await resolveYoutube(url);
        if (legacy.captions && legacy.captions.length > 0) captions = legacy.captions;
      } catch (err) {
        app.log.warn({ videoId, err }, "youtube resolve: yt-dlp caption fallback failed, returning metadata-only");
      }
    }
    return {
      videoId, title: resolved.title, author: resolved.author ?? undefined,
      durationSeconds: resolved.durationSeconds ?? undefined, captions, related: resolved.related,
    };
  }
  app.log.info({ videoId, elapsedMs }, "youtube resolve: innertube miss, falling back to yt-dlp");
}
```

### Where `emptyPageCount` must be computed (PIPE-02, new logic)

```typescript
// Source: server/src/lib/slides.ts:69-93 (read this session) — extension point
export class PdfParseSlideExtractor implements SlideExtractor {
  async extract(buffer: Buffer): Promise<ExtractedSlides> {
    const pages: SlidePage[] = [];
    // NEW: track alongside `pages`, incremented in the same callback below.
    // let emptyPageCount = 0;
    await pdfParse(buffer, {
      pagerender: async (pageData: PdfPageData) => {
        const content = await pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false });
        let lastY: number | undefined;
        let text = "";
        for (const item of content.items) {
          if (lastY === item.transform[5] || lastY === undefined) text += item.str;
          else text += "\n" + item.str;
          lastY = item.transform[5];
        }
        // NEW: if (text.trim().length === 0) emptyPageCount += 1;
        pages.push({ page: pages.length + 1, text });
        return text;
      },
    });
    return { pageCount: pages.length, pages /* , emptyPageCount */ };
  }
}
```

### Current schema to extend (PIPE-02)

```typescript
// Source: server/src/lib/models.ts:271-276 (read this session, verbatim)
export const SlidesMetaSchema = z.object({
  filename: z.string(),
  pageCount: z.number().int().nonnegative(),
  uploadedAt: z.string(),
});
export type SlidesMeta = z.infer<typeof SlidesMetaSchema>;
```

```typescript
// Source: web/src/lib/types.ts:527-532 (read this session, verbatim) — the hand-mirrored web type
export interface SlidesMeta {
  filename: string;
  pageCount: number;
  uploadedAt: string;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| YouTube resolve returns metadata-only if Innertube gets a title but no captions | Metadata-but-no-captions triggers a non-fatal yt-dlp caption fallback before answering | 2026-08-08 19:01, commit `4f7ff0e` | Already shipped to `main`; PIPE-01's remaining scope is test coverage, not a behavior change |
| Dismissed units listed under "Not yet reviewed" in compile export | Dismissed units get a distinct "Dismissed" section | 2026-08-08 19:01, commit `468e0b8` | Out of this phase's scope (COMP-01/Phase 3) but relevant context: the same evening's commit batch also fixed several *other* proof-doc bugs (COMP-01, COMP-02, ANLZ-01 partially, ANLZ-03 partially) — the planner for later phases should re-verify current code state before planning those phases too, the same way this research did for Phase 1. |
| pdf-parse extraction silently returns `""` per page with no signal | (target state, not yet built) `emptyPageCount` surfaced in upload response and UI | N/A — PIPE-02 not yet implemented | This phase's actual remaining work |

**Deprecated/outdated:** None — no library deprecations affect this phase; both `pdf-parse@1.1.1` and
`youtubei.js@17.2.0` remain the project's deliberately-pinned choices (see Standard Stack).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Fastify's officially documented `app.inject()` pattern (register a single plugin on a fresh instance, no port bind) is the right approach for testing `routes/youtube.ts`, rather than extracting logic into a `lib/` module | Architecture Patterns, Pattern 2 | Low — this is a planning-time choice with two documented, viable alternatives (Pattern 2 vs. Alternatives Considered); either satisfies PIPE-01 success criterion #4. Confirmed via official Fastify docs (`fastify.dev/docs/v5.3.x/Guides/Testing`), so risk is about which the planner picks, not about correctness of either. |
| A2 | Adding `__setResolveYoutubeForTests` to `ytdlp.ts` is the best way to test the yt-dlp-succeeds branch, versus a stub-binary fixture script | Architecture Patterns, Pattern 1 | Low-medium — both are workable; the DI hook is a training-knowledge-informed recommendation based on the codebase's own established convention (verified: `innertube.ts`, `slides.ts`, and per `TESTING.md`/`CONCERNS.md`, `analysis.ts` all use this exact shape), not verified against an explicit statement that this is "the" required approach. If the planner prefers the stub-binary route (closer to true integration testing), that is also consistent with `ytdlp.test.ts`'s existing `STUDYLOOP_YTDLP_BIN` convention. |
| A3 | `text.trim().length === 0` is the correct emptiness check for `emptyPageCount` (rather than `text === ""` or a stricter/looser heuristic) | Common Pitfalls, Pitfall 3; Anti-Patterns | Low — PIPE-02's requirement text just says "no extractable text"; `.trim()` is the minimal correct interpretation and matches the codebase's existing empty-string handling elsewhere (`analysis.ts:155-158`, referenced in the proof doc's Bug 5), but the exact threshold (e.g., whether 1-2 stray characters like a page number should also count as "empty") is a product judgment call the planner/user should confirm, not a technical fact. |

## Open Questions

1. **Should the Innertube-cache-miss re-triggering yt-dlp on every repeat resolve (Pitfall 2) be fixed in this phase, or explicitly descoped?**
   - What we know: The behavior is real (traced through `innertube.ts` cache boundary vs. route-level merge) and could cause repeated 30s-timeout yt-dlp spawns for the same video within a 15-minute window.
   - What's unclear: Whether this is in scope for PIPE-01's stated success criteria, which only requires the fallback to *run* whenever captions are null — it doesn't specify caching behavior.
   - Recommendation: Treat as out of scope for Phase 1 (success criteria don't mention caching), but have the planner add one line to the plan's "explicitly not doing" list so it's a documented decision, not a missed finding.

2. **Should PIPE-01's plan include correcting `REQUIREMENTS.md`/`STATE.md`'s "Pending" status once tests land, given the underlying fix already exists?**
   - What we know: `REQUIREMENTS.md` traceability table lists PIPE-01 as "Pending" against Phase 1; the code fix is already on `main`.
   - What's unclear: Whether GSD's phase-completion workflow (outside this research agent's scope) already handles updating REQUIREMENTS.md automatically on phase completion, or whether the plan needs an explicit doc-update task.
   - Recommendation: Defer to the planner/orchestrator's standard phase-completion process; flag in the RESEARCH COMPLETE return so it isn't lost.

3. **Threshold for "empty" page in `emptyPageCount` — should a page with only a slide number or footer (e.g., "3") count as empty?**
   - What we know: `text.trim().length === 0` is unambiguous for genuinely no text.
   - What's unclear: A page with a stray page-number footer character will have non-empty `trim()` but still be functionally "image-only" for analysis purposes.
   - Recommendation: Use the strict `trim().length === 0` check for this phase (matches "no extractable text" literally); if real-world decks show the footer-only false-negative pattern, that's a Phase 4 proof-run finding to address later, not a Phase 1 blocker.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `yt-dlp` | PIPE-01 fallback path (already implemented) | ✓ (this dev machine) | 2026.07.04 | Already handled in code: `ytdlpMissing: true`, does not block project creation |
| `ffmpeg` | Not required by this phase (frame-grab only, unrelated) | ✓ (this dev machine) | 8.1.1 | N/A — out of scope |
| Node.js | Server/test runtime | ✓ | v22.23.1 | — (package.json requires `>=18.17`, machine exceeds it) |

**Missing dependencies with no fallback:** None — both optional binaries (`yt-dlp`, `ffmpeg`) are
present on this dev machine, and the code path already degrades gracefully when they're absent
(verified in `server/src/lib/ytdlp.ts` and `server/test/ytdlp.test.ts`'s "unavailable" test block).

**Missing dependencies with fallback:** None applicable to this phase's scope.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 1.6.0 (server), co-located tests in `server/test/*.test.ts` [VERIFIED: .planning/codebase/TESTING.md] |
| Config file | `server/vitest.config.ts` — `{ environment: "node", include: ["test/**/*.test.ts"] }` [VERIFIED: server/vitest.config.ts, read this session] |
| Quick run command | `npm run test -w server` |
| Full suite command | `npm test` (runs server + web per root `package.json` script, verified this session) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PIPE-01 | Innertube resolves metadata but null captions → yt-dlp fallback runs → captions merged into response | unit/route | `npm run test -w server -- youtube` | ❌ Wave 0 — `server/test/youtube.test.ts` does not exist; must be created |
| PIPE-01 | Total Innertube failure → falls back to yt-dlp legacy path; yt-dlp absent → `ytdlpMissing: true`, no throw | unit | `npm run test -w server -- ytdlp` | ✅ partially — `server/test/ytdlp.test.ts:81-112` covers `resolveYoutube`'s `ytdlpMissing` path at the lib layer; route-level wiring of this branch (the "Innertube totally empty" branch in `routes/youtube.ts:76-84`) is untested |
| PIPE-01 | Existing captioned-YouTube flow unchanged (regression) | unit/route | `npm run test -w server -- youtube` | ❌ Wave 0 — same new file as above should include the "Innertube hit, captions present" fast-path case |
| PIPE-02 | Slide upload with image-only PDF (all pages empty text) reports `emptyPageCount` correctly | unit | `npm run test -w server -- slides` | ❌ Wave 0 — extend existing `server/test/slides.test.ts`; current file has no emptiness-related tests |
| PIPE-02 | Existing text-layer PDF flow unchanged — `emptyPageCount: 0` for a normal deck | unit | `npm run test -w server -- slides` | ❌ Wave 0 — same file, add a "not empty" counter-case alongside the new "all empty" case |
| PIPE-02 | UI visibly warns when `emptyPageCount > 0` | manual/UI (or web unit test if `SlidesRow.tsx` gets a test file — none exists today) | browser verification per DESIGN.md interaction-matrix convention (`TESTING.md`: "Web UI components lack unit tests... only store.ts has extensive tests") | ❌ Wave 0 — no `SlidesRow.test.tsx` exists; given the codebase's stated convention (component tests are a known gap, not yet a norm), plan for manual/browser verification unless the planner elects to establish a new component-test pattern here |

### Sampling Rate
- **Per task commit:** `npm run test -w server -- youtube` / `-- slides` (targeted quick runs)
- **Per wave merge:** `npm test` (full server+web suite — currently 964 server + 345 web tests green per commit `468e0b8`'s message, baseline to not regress below)
- **Phase gate:** Full suite green before `/gsd-verify-work`, plus `npm run typecheck` (both workspaces) since this phase touches shared type shapes (`SlidesMeta` mirrored server↔web)

### Wave 0 Gaps
- [ ] `server/test/youtube.test.ts` — NEW, covers PIPE-01's three branches (Innertube hit / Innertube metadata-only+yt-dlp-fallback-succeeds / Innertube metadata-only+yt-dlp-fallback-fails / Innertube total-miss+yt-dlp-succeeds / Innertube total-miss+yt-dlp-missing)
- [ ] `server/src/lib/ytdlp.ts` — consider adding `__setResolveYoutubeForTests` DI hook (needed to make the "yt-dlp succeeds with captions" branch deterministically testable without a stub binary or real network call — see Architecture Patterns, Pattern 1)
- [ ] `server/test/slides.test.ts` — extend with `emptyPageCount` cases against the real `PdfParseSlideExtractor` (not just the mocked `SlideExtractor` interface) using a tiny fixture PDF, per the file's own stated exception ("unless a tiny fixture is trivial")
- [ ] Framework install: none — Vitest already configured and running (964+345 tests green as of the last commit on `main`)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | App has no auth by design (loopback-only, documented in `ARCHITECTURE.md`) — out of scope for this phase |
| V3 Session Management | No | Stateless server, no sessions — out of scope |
| V4 Access Control | No | No new access-control surface introduced by either requirement |
| V5 Input Validation | Yes | `SlidesMetaSchema`/`ResolveBodySchema` — Zod validation is already the project convention (`SlidesMetaSchema` at `server/src/lib/models.ts:271-276`, extend it, don't bypass it, for the new `emptyPageCount` field) |
| V6 Cryptography | No | Not touched by this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Oversized/malicious PDF causing DoS in the extraction path (already flagged in `CONCERNS.md`: "No validation of uploaded slide PDFs... could crash the server") | Denial of Service | Already mitigated by `SLIDES_MAX_BYTES` (25MB cap, `server/src/lib/slides.ts:44-48`) and the try/catch around `resolveSlideExtractor().extract(buffer)` in `routes/slides.ts:61-66` returning a 422 rather than crashing; this phase's `emptyPageCount` addition sits entirely inside the already-guarded extraction call, so no new attack surface is introduced — do not weaken these existing guards while adding the new field |
| SSRF via a crafted YouTube "URL" reaching yt-dlp/Innertube | Spoofing / SSRF | Already mitigated by `assertValidYoutubeUrl()`'s host allowlist (`server/src/lib/ytdlp.ts:18-37`, `ALLOWED_YOUTUBE_HOSTS`) applied before both the Innertube and yt-dlp paths — this phase's fallback logic reuses the already-validated `url`/`videoId`, introduces no new unvalidated input |

## Sources

### Primary (HIGH confidence — read directly this session)
- `server/src/routes/youtube.ts` (full file) — current PIPE-01 fallback implementation
- `server/src/lib/innertube.ts` (full file) — Innertube adapter, cache, DI pattern
- `server/src/lib/ytdlp.ts` (full file) — yt-dlp adapter, `ytdlpMissing` behavior
- `server/src/lib/slides.ts` (full file) — PDF extraction, DI pattern, size cap
- `server/src/routes/slides.ts` (full file) — slide upload route
- `server/src/lib/models.ts:255-283` — `SlidePageSchema`/`SlidesMetaSchema`/`SlidesFileSchema`
- `web/src/lib/types.ts:520-549` — web-side type mirrors
- `web/src/study/SlidesRow.tsx` (full file) — UI surface for the PIPE-02 warning
- `server/src/routes/projects.ts:1-112` — project-creation flow consuming resolved captions
- `web/src/state/store.ts:945-995` — client-side resolve→create orchestration
- `server/test/ytdlp.test.ts`, `server/test/innertube.test.ts`, `server/test/slides.test.ts` (full/`describe`+`it` listing) — existing test coverage baseline
- `server/src/index.ts` (full file) — plugin registration order/dependencies
- `server/package.json:19-22` — verified dependency versions
- Git history: `git log -p 4f7ff0e -- server/src/routes/youtube.ts`, `git show 468e0b8 --stat`, `git show 4d85af5 --stat` — confirmed fix timeline and PR merge

### Secondary (MEDIUM confidence — WebSearch, cross-referenced against official docs)
- [Fastify Testing Guide](https://fastify.dev/docs/v5.3.x/Guides/Testing/) — `app.inject()` pattern confirmed as the officially documented approach
- [How to Unit Test Fastify Routes and Plugins — AST Consulting](https://astconsulting.in/java-script/nodejs/fastify/how-to-unit-test-fastify-routes-plugins-guide) — corroborates the register-single-plugin-then-inject pattern

### Tertiary (LOW confidence — general web context, not project-specific)
- General web search on pdf-parse/image-only PDF detection confirmed there is no built-in "is this page an image" API in the pdf-parse ecosystem, supporting the trim-based emptiness heuristic as the standard lightweight approach (no authoritative single source; synthesized across several general PDF-tooling articles)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, all versions read directly from `package.json`
- Architecture: HIGH — both flows traced through actual current source files, git history confirms the PIPE-01 fix timeline
- Pitfalls: HIGH for Pitfalls 1, 3, 4 (all derived from reading actual code); MEDIUM for Pitfall 2 (real behavior traced through code, but its in-scope-ness is a product judgment, not a technical fact)

**Research date:** 2026-08-09
**Valid until:** 2026-08-16 (7 days — this is an actively-changing repo with same-day commits landing fixes to the exact files this phase touches; re-verify current `main` state before executing if more than a few days pass)
