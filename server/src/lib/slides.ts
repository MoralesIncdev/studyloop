// Phase 6 "Slide-text channel, smallest slice (PDF)"
// (design/EXECUTION-PLAN-post-review-v1.md): nursing (and most lecture)
// content lives on slides; the transcript-only analysis engine misses it
// entirely. Full frame-capture/OCR is future work — this is the smallest
// proven-value slice: upload a PDF, extract text PER PAGE server-side, and
// persist it as `<project>/slides.json` for lib/analysis.ts to fold a naive,
// proportionally-mapped slice of into each chunk's prompt (see analysis.ts's
// buildSlideContextBlock / mapChunkToSlidePages).
//
// Dependency choice: pdf-parse@1.1.1, NOT the current pdf-parse@2.x line.
// 2.x depends on `pdfjs-dist` + `@napi-rs/canvas` — the latter ships
// platform-specific prebuilt native (napi-rs) binaries, exactly what this
// phase's spec rules out ("lightweight dep ... NO native binaries"). 1.1.1
// instead vendors its own pdf.js build directly inside the package
// (`lib/pdf.js/v1.10.100`) and depends on nothing but `debug`/`node-ensure` —
// pure JS, no native addon, no separate pdfjs-dist install, nothing to
// compile. Its own `pagerender` hook (normally used to build one big
// concatenated string) is used below to capture text PER PAGE instead.
// Imports the package's INNER implementation module, not `pdf-parse` itself
// — see pdf-parse-lib.d.ts's doc comment: pdf-parse's own top-level
// `index.js` runs a debug-mode self-test at import time (reads a hardcoded
// fixture path from ITS OWN test/ directory) that throws ENOENT under
// Vitest/ESM's module loading. `lib/pdf-parse.js` is the same function with
// none of that wrapper-file baggage.
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import fs from "node:fs/promises";
import { SlidesFileSchema, type SlidePage, type SlidesFile } from "./models.js";
import { isNotFound, readJsonIfExists, slidesJsonPath, writeJsonAtomic } from "./store.js";

export interface ExtractedSlides {
  pageCount: number;
  pages: SlidePage[];
}

/**
 * SPEC: "size-capped (~25MB)". Kept here (not inline in routes/slides.ts) so
 * the cap has one source of truth and — same reasoning as the injectable
 * `SlideExtractor` above — is unit-testable without spinning up a Fastify
 * instance: this repo's routes/*.ts files aren't otherwise unit-tested (see
 * server/test's existing lib-only convention; terms.test.ts/analysisV3.test.ts
 * etc. all test lib/ modules directly), so the actual size check is a pure
 * function here and routes/slides.ts just calls it.
 */
export const SLIDES_MAX_BYTES = 25 * 1024 * 1024;

export function exceedsSlidesSizeCap(byteLength: number): boolean {
  return byteLength > SLIDES_MAX_BYTES;
}

/**
 * Injectable extraction boundary — same "adapter interface + real impl +
 * fake/test impl" pattern as lib/analysis.ts's `AnalysisLLMClient` and
 * lib/innertube.ts's `InnertubeClient`. Lets routes/slides.ts's tests (and
 * lib/analysis.ts's tests, indirectly) inject a deterministic fake instead of
 * parsing a real PDF binary — SPEC: "extraction adapter mocked (don't parse a
 * real PDF in unit tests unless a tiny fixture is trivial)".
 */
export interface SlideExtractor {
  extract(buffer: Buffer): Promise<ExtractedSlides>;
}

/** A pdf-parse `pagerender` callback's page-data argument is untyped upstream (see @types/pdf-parse) — narrowed here to just the shape actually used. */
interface PdfPageData {
  getTextContent(options: { normalizeWhitespace: boolean; disableCombineTextItems: boolean }): Promise<{
    items: { str: string; transform: number[] }[];
  }>;
}

export class PdfParseSlideExtractor implements SlideExtractor {
  async extract(buffer: Buffer): Promise<ExtractedSlides> {
    const pages: SlidePage[] = [];
    await pdfParse(buffer, {
      // Captures one page's text as its own array entry (pdf-parse's default
      // behavior only ever accumulates everything into one whole-document
      // string) — mirrors the library's own bundled `render_page` line-join
      // logic (group by unchanged text-item Y coordinate) so extracted text
      // reads the same as pdf-parse's normal output, just split per page.
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

let injectedExtractorForTests: SlideExtractor | null = null;

/** Test-only: force `resolveSlideExtractor` to return a fake/spy implementation — mirrors lib/analysis.ts's `__setAnalysisClientForTests`. */
export function __setSlideExtractorForTests(extractor: SlideExtractor | null): void {
  injectedExtractorForTests = extractor;
}

export function resolveSlideExtractor(): SlideExtractor {
  if (injectedExtractorForTests) return injectedExtractorForTests;
  return new PdfParseSlideExtractor();
}

// --- slides.json load/save (store.ts conventions: readJsonIfExists / writeJsonAtomic) ---

/** `null` for both "no slides.json yet" and "slides.json is corrupt/invalid shape" — same degrade-on-corruption rule lib/terms.ts's readTerms applies to terms.json. */
export async function readSlides(dataDir: string, id: string): Promise<SlidesFile | null> {
  const raw = await readJsonIfExists<unknown>(slidesJsonPath(dataDir, id));
  if (raw === null) return null;
  const parsed = SlidesFileSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function writeSlides(dataDir: string, id: string, file: SlidesFile): Promise<void> {
  SlidesFileSchema.parse(file);
  await writeJsonAtomic(slidesJsonPath(dataDir, id), file);
}

/** Deletes slides.json if present; returns whether anything actually existed (so routes/slides.ts only marks analysis stale when a deck was really attached). */
export async function deleteSlidesFile(dataDir: string, id: string): Promise<boolean> {
  try {
    await fs.unlink(slidesJsonPath(dataDir, id));
    return true;
  } catch (err) {
    if (isNotFound(err)) return false;
    throw err;
  }
}
