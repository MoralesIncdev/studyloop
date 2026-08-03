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
import {
  __setSlideExtractorForTests,
  deleteSlidesFile,
  exceedsSlidesSizeCap,
  readSlides,
  resolveSlideExtractor,
  SLIDES_MAX_BYTES,
  writeSlides,
  type ExtractedSlides,
  type SlideExtractor,
} from "../src/lib/slides.js";
import { analysisJsonPath, slidesJsonPath, writeJsonAtomic } from "../src/lib/store.js";
import { markAnalysisStale } from "../src/lib/terms.js";
import type { SlidesFile } from "../src/lib/models.js";

describe("resolveSlideExtractor / __setSlideExtractorForTests", () => {
  afterEach(() => {
    __setSlideExtractorForTests(null);
  });

  it("returns the real PdfParseSlideExtractor by default", () => {
    const extractor = resolveSlideExtractor();
    expect(extractor.constructor.name).toBe("PdfParseSlideExtractor");
  });

  it("returns the injected test double once set, until reset to null", () => {
    const fake: SlideExtractor = { extract: async () => ({ pageCount: 0, pages: [] }) };
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
      }),
    };
    const result = await fake.extract(Buffer.from("pretend-pdf-bytes"));
    expect(result.pageCount).toBe(2);
    expect(result.pages).toEqual([
      { page: 1, text: "first page, 17 bytes" },
      { page: 2, text: "second page" },
    ]);
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
      meta: { filename: "deck.pdf", pageCount: 2, uploadedAt: "2026-08-01T00:00:00.000Z" },
      pages: [
        { page: 1, text: "Slide one text" },
        { page: 2, text: "Slide two text" },
      ],
    };
    await writeSlides(dataDir, projectId, file);
    expect(await readSlides(dataDir, projectId)).toEqual(file);
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
      meta: { filename: "deck.pdf", pageCount: 1, uploadedAt: "2026-08-01T00:00:00.000Z" },
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
      meta: { filename: "deck.pdf", pageCount: 1, uploadedAt: "2026-08-01T00:00:00.000Z" },
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
      meta: { filename: "deck.pdf", pageCount: 1, uploadedAt: "2026-08-01T00:00:00.000Z" },
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
