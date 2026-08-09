# Phase 1: Ingestion Pipeline Repair - Pattern Map

**Mapped:** 2026-08-09
**Files analyzed:** 8 (new + modified)
**Analogs found:** 8 / 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `server/test/youtube.test.ts` (NEW) | test (route) | request-response | `server/test/innertube.test.ts` (lib-layer DI test) + Fastify's own `app.inject()` docs (no route-test precedent in repo) | role-match (no exact route-test precedent exists in repo) |
| `server/src/lib/ytdlp.ts` (add `__setResolveYoutubeForTests` DI hook) | service/utility | request-response | `server/src/lib/innertube.ts:145-150` (`__setInnertubeClientForTests`) / `server/src/lib/slides.ts:95-104` (`__setSlideExtractorForTests`) | exact (same DI-hook idiom, three prior instances) |
| `server/test/slides.test.ts` (extend with `emptyPageCount` cases) | test (lib) | CRUD/file-I/O | itself — extend existing file in place, same `describe` block style | exact |
| `server/src/lib/models.ts` (`SlidesMetaSchema` +`emptyPageCount`) | model (Zod schema) | CRUD | itself — `SlidePageSchema`/`SlidesMetaSchema` immediately above/below (lines 264-283) | exact |
| `server/src/lib/slides.ts` (`PdfParseSlideExtractor.extract` + `ExtractedSlides`) | service/utility | file-I/O | itself — extend existing extractor method, same closure-over-mutable-state idiom already used for `pages` | exact |
| `server/src/routes/slides.ts` (meta object literal, line ~69) | route (controller) | request-response | itself — one-line addition to existing `meta = {...}` object | exact |
| `web/src/lib/types.ts` (`SlidesMeta` interface, lines 527-532) | model (type mirror) | request-response | itself — hand-mirrored interface immediately below the server schema comment | exact |
| `web/src/study/SlidesRow.tsx` (warning chip) | component | request-response | itself — existing `staleReason === "slides-changed"` conditional render (line 69-71) is the closest in-file "conditional inline note" precedent | exact |

## Pattern Assignments

### `server/test/youtube.test.ts` (NEW — test, request-response)

**Analog A (DI/mocking style):** `server/test/innertube.test.ts:1-16`
```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __setInnertubeClientForTests,
  resolveVideo,
  type InnertubeClient,
  type RawVideoInfo,
} from "../src/lib/innertube.js";
```
Use the same import/DI-injection shape for `youtube.test.ts`: import `__setInnertubeClientForTests` from `lib/innertube.js` and (once added) `__setResolveYoutubeForTests` from `lib/ytdlp.js`, and `afterEach` reset both to `null` (mirrors `slides.test.ts:27-29`'s `afterEach(() => __setSlideExtractorForTests(null))`).

**Analog B (route-under-test bootstrap — no repo precedent, use Fastify's documented pattern verbatim, per RESEARCH.md Pattern 2):**
```typescript
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
This is the first route-level test in the repo — flag it explicitly as a documented deviation from the lib-only test convention (see `server/src/lib/slides.ts:38-42` comment acknowledging "this repo's routes/*.ts files aren't otherwise unit-tested").

**Branches to cover (from `server/src/routes/youtube.ts:40-74`, already-correct code — read only, do not modify):**
1. Innertube hit (title + captions present) → fast path, no yt-dlp call.
2. Innertube metadata-only (title, captions null) → yt-dlp fallback succeeds → captions merged in.
3. Innertube metadata-only → yt-dlp fallback throws → non-fatal, metadata-only response returned.
4. Innertube total miss → full legacy `resolveYoutube()` path, yt-dlp succeeds.
5. Innertube total miss → yt-dlp missing → `ytdlpMissing: true`, no throw.

**Read-only source under test** (do not modify — copy nothing except test expectations from this):
```typescript
// Source: server/src/routes/youtube.ts:40-74
const videoId = extractVideoId(url);
if (videoId) {
  const resolved = await resolveVideo(videoId);
  if (resolved.title || resolved.captions) {
    let captions = resolved.captions && resolved.captions.length > 0 ? resolved.captions : undefined;
    if (!captions) {
      try {
        const legacy = await resolveYoutube(url);
        if (legacy.captions && legacy.captions.length > 0) captions = legacy.captions;
      } catch (err) { /* non-fatal — falls through to metadata-only */ }
    }
    return { videoId, title: resolved.title, author: resolved.author ?? undefined,
      durationSeconds: resolved.durationSeconds ?? undefined, captions, related: resolved.related };
  }
}
```

---

### `server/src/lib/ytdlp.ts` — add `__setResolveYoutubeForTests` DI hook

**Analog:** `server/src/lib/slides.ts:95-104` (nearly identical shape) and `server/src/lib/innertube.ts:121-150`

```typescript
// Pattern to replicate (source: server/src/lib/slides.ts:95-104)
let injectedExtractorForTests: SlideExtractor | null = null;

export function __setSlideExtractorForTests(extractor: SlideExtractor | null): void {
  injectedExtractorForTests = extractor;
}

export function resolveSlideExtractor(): SlideExtractor {
  if (injectedExtractorForTests) return injectedExtractorForTests;
  return new PdfParseSlideExtractor();
}
```

```typescript
// Innertube's richer variant, also clears caches on injection (source: server/src/lib/innertube.ts:121-150)
let clientOverride: InnertubeClient | null = null;

export function __setInnertubeClientForTests(client: InnertubeClient | null): void {
  clientOverride = client;
  clientPromise = null;
  videoCache.clear();
  searchCache.clear();
}
```

**Applied shape for `ytdlp.ts`:** wrap `resolveYoutube` behind a resolver so the exported `resolveYoutube` becomes the injectable seam, or add a module-level override checked at the top of `resolveYoutube()`:
```typescript
// Recommended addition to server/src/lib/ytdlp.ts
let resolveYoutubeOverride: ((url: string) => Promise<YoutubeMetadata>) | null = null;

export function __setResolveYoutubeForTests(fn: ((url: string) => Promise<YoutubeMetadata>) | null): void {
  resolveYoutubeOverride = fn;
}

export async function resolveYoutube(url: string): Promise<YoutubeMetadata> {
  if (resolveYoutubeOverride) return resolveYoutubeOverride(url);
  // ...existing implementation unchanged below this line
}
```
Existing `resolveYoutube` signature (do not otherwise alter): `server/src/lib/ytdlp.ts:143` — `export async function resolveYoutube(url: string): Promise<YoutubeMetadata>`. `YoutubeMetadata` type at `ytdlp.ts:129-135`.

---

### `server/test/slides.test.ts` (extend — test, file-I/O)

**Analog:** itself. Existing structure at `server/test/slides.test.ts:60-78` ("a mocked extraction adapter") is the direct template for new `emptyPageCount` cases:

```typescript
// Source: server/test/slides.test.ts:60-78 — existing pattern to extend
describe("a mocked extraction adapter (no real PDF parsing)", () => {
  it("a fake extractor's output round-trips through the ExtractedSlides shape", async () => {
    const fake: SlideExtractor = {
      extract: async (buffer: Buffer): Promise<ExtractedSlides> => ({
        pageCount: 2,
        pages: [
          { page: 1, text: `first page, ${buffer.byteLength} bytes` },
          { page: 2, text: "second page" },
        ],
      }),
    };
    const result = await fake.extract(Buffer.from("pretend-pdf-bytes"));
    expect(result.pageCount).toBe(2);
  });
});
```
New cases to add in the same style: (a) mocked-extractor case asserting `emptyPageCount` passes through the `ExtractedSlides` shape unchanged; (b) per Pitfall 3 in RESEARCH.md, at least one test against the **real** `PdfParseSlideExtractor` with a tiny fixture PDF (all-empty-pages case + normal-text case), since the mocked-extractor tests alone won't catch a bug in the real per-page callback in `slides.ts:78-89`.

Existing `slides.json` round-trip tests (`slides.test.ts:80-141`) are the analog for asserting `emptyPageCount` survives `writeSlides`/`readSlides` round-trip once added to `SlidesMetaSchema`.

---

### `server/src/lib/models.ts` — `SlidesMetaSchema` + `emptyPageCount`

**Analog:** itself, in-place extension.

```typescript
// Current (source: server/src/lib/models.ts:270-276) — extend with new field
export const SlidesMetaSchema = z.object({
  filename: z.string(),
  pageCount: z.number().int().nonnegative(),
  uploadedAt: z.string(),
});
export type SlidesMeta = z.infer<typeof SlidesMetaSchema>;
```
Add `emptyPageCount: z.number().int().nonnegative(),` matching the existing `pageCount` field's validator shape exactly (same type, same non-negativity constraint).

---

### `server/src/lib/slides.ts` — `PdfParseSlideExtractor.extract` + `ExtractedSlides`

**Analog:** itself, in-place extension. The mutable-state-closed-over-callback idiom already used for `pages` is the pattern to replicate for `emptyPageCount` (per RESEARCH.md Pitfall 3 — must be incremented inside the same `pagerender` callback, not in a second pass).

```typescript
// Current (source: server/src/lib/slides.ts:30-33, 69-93)
export interface ExtractedSlides {
  pageCount: number;
  pages: SlidePage[];
}

export class PdfParseSlideExtractor implements SlideExtractor {
  async extract(buffer: Buffer): Promise<ExtractedSlides> {
    const pages: SlidePage[] = [];
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
        pages.push({ page: pages.length + 1, text });
        return text;
      },
    });
    return { pageCount: pages.length, pages };
  }
}
```
Add `emptyPageCount: z.number()...` to `ExtractedSlides`; add `let emptyPageCount = 0;` before the `pdfParse(...)` call; increment `if (text.trim().length === 0) emptyPageCount += 1;` right after building `text`, before `pages.push(...)`; return `{ pageCount: pages.length, pages, emptyPageCount }`.

---

### `server/src/routes/slides.ts` — meta object (line ~69)

**Analog:** itself, one-line addition.

```typescript
// Current (source: server/src/routes/slides.ts:68-73)
const result = await withProjectLock(params.data.id, async () => {
  const meta = { filename, pageCount: extracted.pageCount, uploadedAt: new Date().toISOString() };
  await writeSlides(dataDir, params.data.id, { meta, pages: extracted.pages });
  const analysisMarkedStale = await markAnalysisStale(dataDir, params.data.id, "slides-changed");
  return { meta, analysisMarkedStale };
});
```
Add `emptyPageCount: extracted.emptyPageCount` to the `meta` object literal, matching the existing destructure-from-`extracted` style used for `pageCount`.

---

### `web/src/lib/types.ts` — `SlidesMeta` interface (lines 527-532)

**Analog:** itself, hand-mirror pattern already documented in-file.

```typescript
// Current (source: web/src/lib/types.ts:527-532)
// --- Phase 6 "Slide-text channel, smallest slice (PDF)" ...
// Mirrors server/src/lib/models.ts's SlidesMetaSchema/SlidesFileSchema.
export interface SlidesMeta {
  filename: string;
  pageCount: number;
  uploadedAt: string;
}
```
Add `emptyPageCount: number;` — this is the codebase's only cross-tier type-safety net (no shared-types package, per RESEARCH.md Anti-Pattern/Pitfall 4); must land in the same commit as the server schema change.

---

### `web/src/study/SlidesRow.tsx` — warning chip

**Analog:** itself — existing conditional inline-note render at the bottom of the component (lines 69-71) is the closest precedent in the file for a conditional warning affordance.

```typescript
// Current (source: web/src/study/SlidesRow.tsx:69-71) — existing conditional-note pattern to replicate
{staleReason === "slides-changed" && (
  <span className={styles.staleNote}>analysis predates slide attach — re-analyze</span>
)}
```
Also note the existing chip render just above it (lines 41-45), which already destructures `slidesMeta`:
```typescript
// Source: web/src/study/SlidesRow.tsx:41-45
<span className={styles.chip} title={`${slidesMeta.filename} — ${slidesMeta.pageCount} pages`}>
  📄 {slidesMeta.filename} · {slidesMeta.pageCount} {slidesMeta.pageCount === 1 ? "page" : "pages"}
</span>
```
Add a sibling conditional block: `{slidesMeta.emptyPageCount > 0 && (<span className={styles.staleNote}>...</span>)}` (or a new CSS class in `SlidesRow.module.css` if a visually distinct "warning" style — vs. the existing muted "stale" style — is wanted; check `SlidesRow.module.css` for `.staleNote`'s exact styling before deciding whether to reuse it or add a new class). No dedicated "warning chip" component exists elsewhere in `web/src/study/` — this conditional-`<span>`-with-CSS-module-class is the established idiom for all inline affordances in this file.

No component test exists for `SlidesRow.tsx` today (`TESTING.md`: "Web UI components lack unit tests... only store.ts has extensive tests") — per RESEARCH.md, plan manual/browser verification for this file unless the plan explicitly elects to establish a new `SlidesRow.test.tsx` pattern (no analog to copy from if so — would be the first).

## Shared Patterns

### Dependency-Injection Test Boundary
**Source:** `server/src/lib/innertube.ts:121-150` (`__setInnertubeClientForTests`), `server/src/lib/slides.ts:95-104` (`__setSlideExtractorForTests`)
**Apply to:** `server/src/lib/ytdlp.ts` (new `__setResolveYoutubeForTests` hook) and any test needing to control the yt-dlp-succeeds branch deterministically.
```typescript
let injectedXForTests: X | null = null;
export function __setXForTests(x: X | null): void { injectedXForTests = x; }
export function resolveX(): X { return injectedXForTests ?? new RealX(); }
```

### Zod Schema Extension
**Source:** `server/src/lib/models.ts:270-276`
**Apply to:** `SlidesMetaSchema` — extend in place with `.nonnegative()` int fields, matching `pageCount`'s existing validator; never bypass Zod for the new field.

### Hand-Mirrored Cross-Tier Types
**Source:** `web/src/lib/types.ts:520-532` (comment: "Mirrors server/src/lib/models.ts's SlidesMetaSchema/SlidesFileSchema")
**Apply to:** Any server schema change must be paired with an identical interface edit in `web/src/lib/types.ts` in the same commit — no shared-types package exists in this repo.

### Test-file describe/it structure
**Source:** `server/test/slides.test.ts` (whole file), `server/test/innertube.test.ts:1-60`
**Apply to:** `server/test/youtube.test.ts` (new) and extensions to `slides.test.ts` — `describe` blocks grouped by function/behavior, `afterEach` resets to clear DI overrides, Vitest `vi`/`describe`/`it`/`expect` imports from `"vitest"`.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| Route-level test bootstrap (`app.inject()` on isolated Fastify instance) | test infra | request-response | No existing route-level test exists anywhere in `server/test/` — repo convention is lib-only testing. Use Fastify's own documented pattern (cited in RESEARCH.md) verbatim rather than inventing a local variant. |
| `SlidesRow.test.tsx` (if planner elects to add one) | test (component) | request-response | No component test exists for any file in `web/src/study/` today — `TESTING.md` states this is a known, accepted gap, not yet a norm. Manual/browser verification is the recommended default per RESEARCH.md. |

## Metadata

**Analog search scope:** `server/src/lib/`, `server/src/routes/`, `server/test/`, `web/src/lib/`, `web/src/study/`, `web/src/state/`
**Files scanned:** `ytdlp.ts`, `innertube.ts`, `innertube.test.ts`, `slides.ts`, `slides.test.ts`, `routes/slides.ts`, `routes/youtube.ts`, `models.ts`, `web/src/lib/types.ts`, `web/src/study/SlidesRow.tsx`, `web/src/state/store.ts`
**Pattern extraction date:** 2026-08-09
