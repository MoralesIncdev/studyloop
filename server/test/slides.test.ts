// Phase 6 "Slide-text channel, smallest slice (PDF)"
// (design/EXECUTION-PLAN-post-review-v1.md): lib/slides.ts's extraction
// adapter (mocked here — never parses a real PDF binary, per the phase
// spec), slides.json round-trip, delete semantics, and the size-cap pure
// function routes/slides.ts calls. Mirrors terms.test.ts's structure for the
// analogous store round-trip.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  __setSlideExtractorForTests,
  deleteSlidesFile,
  exceedsSlidesSizeCap,
  isEmptyPageText,
  PdfParseSlideExtractor,
  readSlides,
  resolveSlideExtractor,
  SLIDES_MAX_BYTES,
  writeSlides,
  type ExtractedSlides,
  type SlideExtractor,
} from "../src/lib/slides.js";
import { analysisJsonPath, slidesJsonPath, writeJsonAtomic } from "../src/lib/store.js";
import { markAnalysisStale } from "../src/lib/terms.js";
import { SlidesMetaSchema, type SlidesFile } from "../src/lib/models.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, "fixtures");

describe("resolveSlideExtractor / __setSlideExtractorForTests", () => {
  afterEach(() => {
    __setSlideExtractorForTests(null);
  });

  it("returns the real PdfParseSlideExtractor by default", () => {
    const extractor = resolveSlideExtractor();
    expect(extractor.constructor.name).toBe("PdfParseSlideExtractor");
  });

  it("returns the injected test double once set, until reset to null", () => {
    const fake: SlideExtractor = { extract: async () => ({ pageCount: 0, pages: [], emptyPageCount: 0 }) };
    __setSlideExtractorForTests(fake);
    expect(resolveSlideExtractor()).toBe(fake);
    __setSlideExtractorForTests(null);
    expect(resolveSlideExtractor()).not.toBe(fake);
  });
});

describe("exceedsSlidesSizeCap (SPEC: size-capped ~25MB)", () => {
  it("is false for a buffer at or under the cap", () => {
    expect(exceedsSlidesSizeCap(0)).toBe(false);
    expect(exceedsSlidesSizeCap(SLIDES_MAX_BYTES)).toBe(false);
  });

  it("is true for a buffer over the cap", () => {
    expect(exceedsSlidesSizeCap(SLIDES_MAX_BYTES + 1)).toBe(true);
  });

  it("the cap is exactly 25MB", () => {
    expect(SLIDES_MAX_BYTES).toBe(25 * 1024 * 1024);
  });
});

describe("a mocked extraction adapter (no real PDF parsing)", () => {
  it("a fake extractor's output round-trips through the ExtractedSlides shape", async () => {
    const fake: SlideExtractor = {
      extract: async (buffer: Buffer): Promise<ExtractedSlides> => ({
        pageCount: 2,
        pages: [
          { page: 1, text: `first page, ${buffer.byteLength} bytes` },
          { page: 2, text: "second page" },
        ],
        emptyPageCount: 0,
      }),
    };
    const result = await fake.extract(Buffer.from("pretend-pdf-bytes"));
    expect(result.pageCount).toBe(2);
    expect(result.pages).toEqual([
      { page: 1, text: "first page, 17 bytes" },
      { page: 2, text: "second page" },
    ]);
    expect(result.emptyPageCount).toBe(0);
  });
});

describe("isEmptyPageText (PIPE-02)", () => {
  it("is true for an empty string", () => {
    expect(isEmptyPageText("")).toBe(true);
  });

  it("is true for whitespace-only text (the case a bare === '' check would miss)", () => {
    expect(isEmptyPageText("   \n  \n ")).toBe(true);
  });

  it("is false for a single non-whitespace character", () => {
    expect(isEmptyPageText("3")).toBe(false);
  });

  it("is false for text with surrounding whitespace around real content", () => {
    expect(isEmptyPageText(" Slide one ")).toBe(false);
  });
});

// PIPE-02: runs the REAL PdfParseSlideExtractor against committed fixture
// PDFs rather than the injectable fake used everywhere else in this file —
// an intentional departure from the mocked-extractor norm this codebase
// otherwise follows (see slides.ts:55's "unless a tiny fixture is trivial"
// carve-out). The distinction being pinned (raw text non-empty, trimmed
// text empty) can only be proven against pdf-parse's actual output.
describe("PdfParseSlideExtractor against real PDF fixtures (PIPE-02)", () => {
  it("slides-empty-page.pdf: pageCount 2, emptyPageCount 1, and page 2's raw text is non-empty while its trimmed text is empty", async () => {
    const buffer = await fs.readFile(path.join(FIXTURES, "slides-empty-page.pdf"));
    const extractor = new PdfParseSlideExtractor();
    const result = await extractor.extract(buffer);
    expect(result.pageCount).toBe(2);
    expect(result.emptyPageCount).toBe(1);
    const page2 = result.pages[1];
    expect(page2.text.length).toBeGreaterThan(0);
    expect(page2.text.trim().length).toBe(0);
  });

  // ROADMAP SC4 text-layer regression guard: a normal deck must keep
  // reporting zero empty pages and behave exactly as before this signal
  // was added.
  it("slides-text-layer.pdf: pageCount 2, emptyPageCount 0, and both pages carry non-whitespace text", async () => {
    const buffer = await fs.readFile(path.join(FIXTURES, "slides-text-layer.pdf"));
    const extractor = new PdfParseSlideExtractor();
    const result = await extractor.extract(buffer);
    expect(result.pageCount).toBe(2);
    expect(result.emptyPageCount).toBe(0);
    expect(result.pages[0].text.trim().length).toBeGreaterThan(0);
    expect(result.pages[1].text.trim().length).toBeGreaterThan(0);
  });

  it("both fixtures produce a pages array whose length equals the reported pageCount — the counter can never disagree with what gets stored", async () => {
    const extractor = new PdfParseSlideExtractor();
    for (const fixture of ["slides-empty-page.pdf", "slides-text-layer.pdf"]) {
      const buffer = await fs.readFile(path.join(FIXTURES, fixture));
      const result = await extractor.extract(buffer);
      expect(result.pages.length).toBe(result.pageCount);
    }
  });
});

describe("emptyPageCount schema + GET-response surface (PIPE-02, threat T-01-06/T-01-07)", () => {
  it("a route-shaped meta object (matching routes/slides.ts's literal) parses cleanly through SlidesMetaSchema", () => {
    const meta = { filename: "deck.pdf", pageCount: 2, uploadedAt: new Date().toISOString(), emptyPageCount: 1 };
    expect(() => SlidesMetaSchema.parse(meta)).not.toThrow();
  });

  it("the GET response shape exposes meta only — no page-text field — built from a readSlides result", async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-slides-get-"));
    try {
      const projectId = "proj-slides-get";
      await writeSlides(dataDir, projectId, {
        meta: { filename: "deck.pdf", pageCount: 1, uploadedAt: "2026-08-01T00:00:00.000Z", emptyPageCount: 0 },
        pages: [{ page: 1, text: "some extracted page text that must never leak to GET" }],
      });
      const slides = await readSlides(dataDir, projectId);
      // Mirrors routes/slides.ts's GET handler: `{ meta: slides?.meta ?? null }`.
      const getResponse = { meta: slides?.meta ?? null };
      expect(Object.keys(getResponse)).toEqual(["meta"]);
      expect(getResponse).not.toHaveProperty("pages");
      expect(JSON.stringify(getResponse)).not.toContain("must never leak");
    } finally {
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  });
});

describe("slides.json store round-trip", () => {
  let dataDir: string;
  const projectId = "proj-slides";

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-slides-"));
  });

  afterEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it("returns null when slides.json doesn't exist yet", async () => {
    expect(await readSlides(dataDir, projectId)).toBeNull();
  });

  it("round-trips a written slides file (meta + pages)", async () => {
    const file: SlidesFile = {
      meta: { filename: "deck.pdf", pageCount: 2, uploadedAt: "2026-08-01T00:00:00.000Z", emptyPageCount: 0 },
      pages: [
        { page: 1, text: "Slide one text" },
        { page: 2, text: "Slide two text" },
      ],
    };
    await writeSlides(dataDir, projectId, file);
    expect(await readSlides(dataDir, projectId)).toEqual(file);
  });

  it("PIPE-02: a slides.json written before emptyPageCount existed still loads, defaulting to 0 (not null)", async () => {
    // Simulates a pre-existing on-disk file from before this field was added
    // — written directly via writeJsonAtomic (bypassing writeSlides, which
    // would validate against the current schema) so the meta object has no
    // emptyPageCount key at all, the way an old slides.json genuinely would.
    await writeJsonAtomic(slidesJsonPath(dataDir, projectId), {
      meta: { filename: "old-deck.pdf", pageCount: 1, uploadedAt: "2026-01-01T00:00:00.000Z" },
      pages: [{ page: 1, text: "old text" }],
    });
    const loaded = await readSlides(dataDir, projectId);
    expect(loaded).not.toBeNull();
    expect(loaded?.meta.emptyPageCount).toBe(0);
  });

  it("degrades to null (rather than throwing) when slides.json is corrupt/invalid shape", async () => {
    const dir = path.join(dataDir, "projects", projectId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "slides.json"), JSON.stringify({ meta: { filename: 123 }, pages: "nope" }));
    expect(await readSlides(dataDir, projectId)).toBeNull();
  });

  it("writeSlides rejects a shape that fails SlidesFileSchema", async () => {
    // @ts-expect-error — deliberately malformed for the runtime-validation assertion below
    await expect(writeSlides(dataDir, projectId, { meta: { filename: "x" }, pages: [] })).rejects.toThrow();
  });

  it("deleteSlidesFile removes an existing slides.json and returns true", async () => {
    await writeSlides(dataDir, projectId, {
      meta: { filename: "deck.pdf", pageCount: 1, uploadedAt: "2026-08-01T00:00:00.000Z", emptyPageCount: 0 },
      pages: [{ page: 1, text: "x" }],
    });
    expect(await deleteSlidesFile(dataDir, projectId)).toBe(true);
    expect(await readSlides(dataDir, projectId)).toBeNull();
  });

  it("deleteSlidesFile returns false (not an error) when nothing existed to delete", async () => {
    expect(await deleteSlidesFile(dataDir, projectId)).toBe(false);
  });

  it("the on-disk file actually lives at <project>/slides.json (store.ts convention)", async () => {
    await writeSlides(dataDir, projectId, {
      meta: { filename: "deck.pdf", pageCount: 1, uploadedAt: "2026-08-01T00:00:00.000Z", emptyPageCount: 0 },
      pages: [{ page: 1, text: "x" }],
    });
    const raw = JSON.parse(await fs.readFile(slidesJsonPath(dataDir, projectId), "utf8"));
    expect(raw.meta.filename).toBe("deck.pdf");
  });
});

// Sanity check that writeJsonAtomic/slidesJsonPath (used above transitively)
// are exercised the same way every other per-project sidecar file already is.
describe("slidesJsonPath", () => {
  it("is scoped under the project's own directory", () => {
    const p = slidesJsonPath("/data", "proj-1");
    expect(p.endsWith(path.join("projects", "proj-1", "slides.json"))).toBe(true);
  });
});

// --- Phase 6 item 4 "Stale flag": routes/slides.ts calls the same
// markAnalysisStale helper routes/terms.ts uses (see lib/terms.ts), just
// with reason "slides-changed" instead of "terms-changed" — this is exactly
// what a POST (attach) or DELETE (remove) of a slide deck triggers. ---------

describe("markAnalysisStale with reason 'slides-changed' (Phase 6 item 4)", () => {
  let dataDir: string;
  const projectId = "proj-slides-stale";

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-slides-stale-"));
  });

  afterEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it("returns false and writes nothing when there's no analysis.json yet", async () => {
    expect(await markAnalysisStale(dataDir, projectId, "slides-changed")).toBe(false);
  });

  it("sets staleReason: 'slides-changed' on an existing analysis.json — this is what attaching a deck (POST /api/projects/:id/slides) triggers", async () => {
    const analysisPath = analysisJsonPath(dataDir, projectId);
    await writeJsonAtomic(analysisPath, {
      generatedAt: "2026-01-01T00:00:00Z",
      model: "claude-test",
      version: 3,
      source: "model",
      pearls: [],
      concepts: [],
      themes: [],
    });

    expect(await markAnalysisStale(dataDir, projectId, "slides-changed")).toBe(true);
    const raw = JSON.parse(await fs.readFile(analysisPath, "utf8"));
    expect(raw.staleReason).toBe("slides-changed");
  });

  it("this is also what removing a deck (DELETE /api/projects/:id/slides) triggers", async () => {
    const analysisPath = analysisJsonPath(dataDir, projectId);
    await writeJsonAtomic(analysisPath, {
      generatedAt: "2026-01-01T00:00:00Z",
      model: "claude-test",
      version: 3,
      source: "model",
      pearls: [],
      concepts: [],
      themes: [],
      staleReason: null,
    });

    // Simulates routes/slides.ts's DELETE handler: deleteSlidesFile returned
    // true (a deck genuinely existed), so the route marks analysis stale.
    await writeSlides(dataDir, projectId, {
      meta: { filename: "deck.pdf", pageCount: 1, uploadedAt: "2026-08-01T00:00:00.000Z", emptyPageCount: 0 },
      pages: [{ page: 1, text: "x" }],
    });
    const existed = await deleteSlidesFile(dataDir, projectId);
    expect(existed).toBe(true);
    await markAnalysisStale(dataDir, projectId, "slides-changed");

    const raw = JSON.parse(await fs.readFile(analysisPath, "utf8"));
    expect(raw.staleReason).toBe("slides-changed");
  });

  it("still defaults to 'terms-changed' when no reason is passed (backward compat with routes/terms.ts's existing call sites)", async () => {
    const analysisPath = analysisJsonPath(dataDir, projectId);
    await writeJsonAtomic(analysisPath, {
      generatedAt: "2026-01-01T00:00:00Z",
      model: "claude-test",
      version: 3,
      source: "model",
      pearls: [],
      concepts: [],
      themes: [],
    });
    await markAnalysisStale(dataDir, projectId);
    const raw = JSON.parse(await fs.readFile(analysisPath, "utf8"));
    expect(raw.staleReason).toBe("terms-changed");
  });
});
