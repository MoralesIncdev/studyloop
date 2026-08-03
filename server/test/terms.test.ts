// Phase 2 "Terminology layer v1" (design/EXECUTION-PLAN-post-review-v1.md).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  applyTerms,
  applyTermsToSegments,
  correctTranscriptSegments,
  flattenTermsFile,
  isClinicalDomain,
  loadEffectiveTerms,
  loadNursingGlossary,
  markAnalysisStale,
  mergeGlossaryDefaults,
  readTermCorrections,
  readTerms,
  writeTerms,
  __resetGeneratedGlossaryCacheForTests,
  __resetNursingGlossaryCacheForTests,
} from "../src/lib/terms.js";
import { lensGlossaryFilePath, __resetLensRegistryCacheForTests } from "../src/lib/lenses.js";
import { analysisJsonPath, writeJsonAtomic } from "../src/lib/store.js";
import type { TermsFile } from "../src/lib/models.js";

describe("applyTerms", () => {
  it("rewrites a case-insensitive, word-boundary match", () => {
    const { text, hits } = applyTerms("give metoprolol 25mg", { metoprolol: "metoprolol" });
    expect(text).toBe("give metoprolol 25mg");
    expect(hits).toEqual([{ garbled: "metoprolol", correct: "metoprolol", count: 1 }]);
  });

  it("rewrites a garbled multi-word phrase to the correct term", () => {
    const { text, hits } = applyTerms("the patient is on metro pro law twice daily", { "metro pro law": "metoprolol" });
    expect(text).toBe("the patient is on metoprolol twice daily");
    expect(hits).toEqual([{ garbled: "metro pro law", correct: "metoprolol", count: 1 }]);
  });

  it("respects word boundaries — does not rewrite a garbled key that's only a substring of a longer word", () => {
    const { text, hits } = applyTerms("the metroplex is far away", { metro: "metoprolol" });
    expect(text).toBe("the metroplex is far away");
    expect(hits).toEqual([]);
  });

  it("is case-insensitive when matching (and preserves the ALL-CAPS casing it matched)", () => {
    const { text } = applyTerms("METRO PRO LAW was given", { "metro pro law": "metoprolol" });
    expect(text).toBe("METOPROLOL was given");
  });

  it("preserves an ALL-CAPS casing pattern in the replacement", () => {
    const { text } = applyTerms("METRO PRO LAW", { "metro pro law": "metoprolol" });
    expect(text).toBe("METOPROLOL");
  });

  it("preserves a Title-Case casing pattern in the replacement", () => {
    const { text } = applyTerms("Metro Pro Law was given at 0800", { "metro pro law": "metoprolol" });
    expect(text).toBe("Metoprolol was given at 0800");
  });

  it("longest-match-first: a longer garbled phrase wins over a shorter one that's also a substring match", () => {
    const termsMap = { "lie sin o pril": "lisinopril", "lie sin o": "wrong-shorter-match" };
    const { text, hits } = applyTerms("start lie sin o pril today", termsMap);
    expect(text).toBe("start lisinopril today");
    expect(hits).toEqual([{ garbled: "lie sin o pril", correct: "lisinopril", count: 1 }]);
  });

  it("counts multiple occurrences of the same garbled key in one text", () => {
    const { hits } = applyTerms("metro pro law now, more metro pro law later", { "metro pro law": "metoprolol" });
    expect(hits).toEqual([{ garbled: "metro pro law", correct: "metoprolol", count: 2 }]);
  });

  it("is idempotent — re-applying the same map to already-corrected text is a no-op", () => {
    const termsMap = { "metro pro law": "metoprolol" };
    const first = applyTerms("give metro pro law now", termsMap);
    const second = applyTerms(first.text, termsMap);
    expect(second.text).toBe(first.text);
    expect(second.hits).toEqual([]);
  });

  it("returns the text unchanged (and no hits) for an empty terms map", () => {
    const { text, hits } = applyTerms("give metro pro law now", {});
    expect(text).toBe("give metro pro law now");
    expect(hits).toEqual([]);
  });

  it("returns empty text unchanged", () => {
    expect(applyTerms("", { foo: "bar" })).toEqual({ text: "", hits: [] });
  });
});

describe("applyTermsToSegments", () => {
  it("rewrites every segment's text and aggregates hit counts across segments", () => {
    const segments = [
      { start: 0, end: 2, text: "give metro pro law" },
      { start: 2, end: 4, text: "another dose of metro pro law later" },
    ];
    const { segments: corrected, hits } = applyTermsToSegments(segments, { "metro pro law": "metoprolol" });
    expect(corrected.map((s) => s.text)).toEqual(["give metoprolol", "another dose of metoprolol later"]);
    expect(hits).toEqual([{ garbled: "metro pro law", correct: "metoprolol", count: 2 }]);
  });

  it("preserves start/end and returns the same segment reference when nothing matched", () => {
    const segments = [{ start: 0, end: 2, text: "no matches here" }];
    const { segments: corrected } = applyTermsToSegments(segments, { "metro pro law": "metoprolol" });
    expect(corrected[0]).toBe(segments[0]);
  });

  it("returns a shallow copy (not the same array) when the terms map is empty", () => {
    const segments = [{ start: 0, end: 2, text: "text" }];
    const { segments: corrected } = applyTermsToSegments(segments, {});
    expect(corrected).toEqual(segments);
    expect(corrected).not.toBe(segments);
  });
});

describe("flattenTermsFile", () => {
  it("drops per-entry metadata, keeping only garbled->correct", () => {
    const file: TermsFile = {
      "metro pro law": { correct: "metoprolol", source: "user", createdAt: "2026-01-01T00:00:00Z" },
    };
    expect(flattenTermsFile(file)).toEqual({ "metro pro law": "metoprolol" });
  });
});

describe("terms.json store round-trip", () => {
  let dataDir: string;
  const projectId = "proj-terms";

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-terms-"));
  });

  afterEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it("returns {} when terms.json doesn't exist yet", async () => {
    expect(await readTerms(dataDir, projectId)).toEqual({});
  });

  it("round-trips a written terms map", async () => {
    const file: TermsFile = {
      "metro pro law": { correct: "metoprolol", source: "user", createdAt: "2026-01-01T00:00:00Z" },
    };
    await writeTerms(dataDir, projectId, file);
    expect(await readTerms(dataDir, projectId)).toEqual(file);
  });

  it("degrades to {} (rather than throwing) when terms.json is corrupt/invalid shape", async () => {
    const dir = path.join(dataDir, "projects", projectId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "terms.json"), JSON.stringify({ foo: { correct: 123 } }));
    expect(await readTerms(dataDir, projectId)).toEqual({});
  });
});

describe("nursing glossary + mergeGlossaryDefaults precedence", () => {
  beforeEach(() => {
    __resetNursingGlossaryCacheForTests();
  });

  it("loads a substantial glossary of garbled->correct mappings", () => {
    const glossary = loadNursingGlossary();
    const keys = Object.keys(glossary);
    expect(keys.length).toBeGreaterThan(150);
    expect(glossary["metro pro law"]).toEqual({ correct: "metoprolol", source: "glossary", createdAt: expect.any(String) });
    for (const entry of Object.values(glossary)) {
      expect(entry.source).toBe("glossary");
    }
  });

  it("isClinicalDomain is true only for the literal 'clinical' string (inert for every current Domain value)", () => {
    expect(isClinicalDomain("clinical")).toBe(true);
    expect(isClinicalDomain("biology")).toBe(false);
    expect(isClinicalDomain("generic")).toBe(false);
    expect(isClinicalDomain(undefined)).toBe(false);
    expect(isClinicalDomain(null)).toBe(false);
  });

  it("mergeGlossaryDefaults is a no-op (inert) for a non-clinical domain, even with an empty user map", () => {
    expect(mergeGlossaryDefaults({}, "biology")).toEqual({});
    expect(mergeGlossaryDefaults({}, undefined)).toEqual({});
  });

  it("merges glossary defaults in for domain 'clinical'", () => {
    const merged = mergeGlossaryDefaults({}, "clinical");
    expect(merged["metro pro law"]).toEqual({ correct: "metoprolol", source: "glossary", createdAt: expect.any(String) });
  });

  it("a user entry for the same garbled key overrides the glossary default", () => {
    const userTerms: TermsFile = {
      "metro pro law": { correct: "USER OVERRIDE", source: "user", createdAt: "2026-02-02T00:00:00Z" },
    };
    const merged = mergeGlossaryDefaults(userTerms, "clinical");
    expect(merged["metro pro law"]).toEqual({ correct: "USER OVERRIDE", source: "user", createdAt: "2026-02-02T00:00:00Z" });
  });

  it("a user entry for a key the glossary doesn't have is simply added alongside the glossary defaults", () => {
    const userTerms: TermsFile = {
      "my own garble": { correct: "my correction", source: "user", createdAt: "2026-02-02T00:00:00Z" },
    };
    const merged = mergeGlossaryDefaults(userTerms, "clinical");
    expect(merged["my own garble"]).toEqual(userTerms["my own garble"]);
    expect(merged["metro pro law"].source).toBe("glossary");
  });
});

describe("loadEffectiveTerms (project terms.json + glossary merge)", () => {
  let dataDir: string;
  const projectId = "proj-effective";

  beforeEach(async () => {
    __resetNursingGlossaryCacheForTests();
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-effective-terms-"));
  });

  afterEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it("is just the user's own terms.json when domain isn't clinical", async () => {
    await writeTerms(dataDir, projectId, {
      "my garble": { correct: "my correction", source: "user", createdAt: "2026-01-01T00:00:00Z" },
    });
    const effective = await loadEffectiveTerms(dataDir, projectId, "biology");
    expect(Object.keys(effective)).toEqual(["my garble"]);
  });

  it("merges the glossary in for domain 'clinical', with the user's own entries winning on overlap", async () => {
    await writeTerms(dataDir, projectId, {
      "metro pro law": { correct: "USER OVERRIDE", source: "user", createdAt: "2026-01-01T00:00:00Z" },
    });
    const effective = await loadEffectiveTerms(dataDir, projectId, "clinical");
    expect(effective["metro pro law"].correct).toBe("USER OVERRIDE");
    expect(Object.keys(effective).length).toBeGreaterThan(150);
  });
});

// --- Phase 5 "Lens registry + clinical as first data-driven lens", item 7
// "Phase 2 glossary wiring": isClinicalDomain/mergeGlossaryDefaults/
// loadEffectiveTerms now key off the ACTIVE LENS's glossaryRef ("nursing"),
// not a literal `domain === "clinical"` string check — this generalizes to
// ANY lens id (a user-authored or Phase-9-generated one) that declares the
// same glossaryRef, without needing another code change here. ---------------

describe("isClinicalDomain / mergeGlossaryDefaults — Phase 5 glossaryRef generalization", () => {
  let dataDir: string;

  beforeEach(async () => {
    __resetNursingGlossaryCacheForTests();
    __resetLensRegistryCacheForTests();
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-glossary-ref-"));
  });

  afterEach(async () => {
    __resetLensRegistryCacheForTests();
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it("activates for a user-authored lens id (not literally 'clinical') that declares glossaryRef 'nursing'", async () => {
    await fs.mkdir(path.join(dataDir, "lenses"), { recursive: true });
    await fs.writeFile(
      path.join(dataDir, "lenses", "veterinary.json"),
      JSON.stringify({
        id: "veterinary",
        label: "Veterinary",
        routerDescription: "veterinary medicine content",
        unitTypeEmphasis: "Domain lens: veterinary.",
        overlayFields: [],
        questionStyle: "default",
        glossaryRef: "nursing",
      })
    );
    expect(isClinicalDomain("veterinary", dataDir)).toBe(true);
    const merged = mergeGlossaryDefaults({}, "veterinary", dataDir);
    expect(merged["metro pro law"]).toEqual({ correct: "metoprolol", source: "glossary", createdAt: expect.any(String) });
  });

  it("stays inert for a lens id with no glossaryRef at all, even with the same dataDir passed", () => {
    expect(isClinicalDomain("biology", dataDir)).toBe(false);
    expect(mergeGlossaryDefaults({}, "biology", dataDir)).toEqual({});
  });

  it("dataDir defaults to \"\" (repo-only) — the shipped clinical lens's glossaryRef still activates with no dataDir argument at all", () => {
    expect(isClinicalDomain("clinical")).toBe(true);
  });
});

// --- Phase 9 "Lens autogeneration for unknown subjects": a generated lens's
// own starter glossary (server/src/lib/lenses.ts's generateAndPersistLens,
// persisted at <dataDir>/lenses/glossary/<lensId>.json) loads through this
// SAME glossaryRef mechanism — but via a ref that ISN'T "nursing", so
// isClinicalDomain (deliberately nursing-only) stays false for it. ----------

describe("mergeGlossaryDefaults — Phase 9 generated-lens glossary loading", () => {
  let dataDir: string;

  beforeEach(async () => {
    __resetLensRegistryCacheForTests();
    __resetGeneratedGlossaryCacheForTests();
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-generated-glossary-"));
  });

  afterEach(async () => {
    __resetLensRegistryCacheForTests();
    __resetGeneratedGlossaryCacheForTests();
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  async function writeGeneratedLensWithGlossary(): Promise<void> {
    await fs.mkdir(path.join(dataDir, "lenses"), { recursive: true });
    await fs.writeFile(
      path.join(dataDir, "lenses", "astrology.json"),
      JSON.stringify({
        id: "astrology",
        label: "Astrology",
        routerDescription: "astrology, horoscopes, zodiac content",
        unitTypeEmphasis: "Domain lens: astrology.",
        overlayFields: [],
        questionStyle: "default",
        glossaryRef: "astrology",
        origin: "generated",
      })
    );
    await fs.mkdir(path.dirname(lensGlossaryFilePath(dataDir, "astrology")), { recursive: true });
    await fs.writeFile(
      lensGlossaryFilePath(dataDir, "astrology"),
      JSON.stringify([{ correct: "ephemeris", variants: ["ephemerus", "epha merris"] }])
    );
  }

  it("loads a generated lens's own glossary file (glossaryRef named after the lens id, not 'nursing')", async () => {
    await writeGeneratedLensWithGlossary();
    const merged = mergeGlossaryDefaults({}, "astrology", dataDir);
    expect(merged["ephemerus"]).toEqual({ correct: "ephemeris", source: "glossary", createdAt: expect.any(String) });
    expect(merged["epha merris"]).toEqual({ correct: "ephemeris", source: "glossary", createdAt: expect.any(String) });
  });

  it("isClinicalDomain stays false for a generated lens's own (non-nursing) glossaryRef — the two mechanisms are independent", async () => {
    await writeGeneratedLensWithGlossary();
    expect(isClinicalDomain("astrology", dataDir)).toBe(false);
  });

  it("a user correction for the same garbled key still overrides the generated glossary default", async () => {
    await writeGeneratedLensWithGlossary();
    const userTerms: TermsFile = {
      ephemerus: { correct: "USER OVERRIDE", source: "user", createdAt: "2026-02-02T00:00:00Z" },
    };
    const merged = mergeGlossaryDefaults(userTerms, "astrology", dataDir);
    expect(merged["ephemerus"]).toEqual(userTerms["ephemerus"]);
  });

  it("degrades to no glossary (never throws) when the lens declares a glossaryRef but the glossary file is missing", async () => {
    await fs.mkdir(path.join(dataDir, "lenses"), { recursive: true });
    await fs.writeFile(
      path.join(dataDir, "lenses", "ghost.json"),
      JSON.stringify({
        id: "ghost",
        label: "Ghost",
        routerDescription: "d",
        unitTypeEmphasis: "e",
        overlayFields: [],
        questionStyle: "default",
        glossaryRef: "ghost",
      })
    );
    expect(() => mergeGlossaryDefaults({}, "ghost", dataDir)).not.toThrow();
    expect(mergeGlossaryDefaults({}, "ghost", dataDir)).toEqual({});
  });

  it("via loadEffectiveTerms end to end: a project on a generated lens gets its glossary merged in automatically", async () => {
    await writeGeneratedLensWithGlossary();
    const effective = await loadEffectiveTerms(dataDir, "some-project-id", "astrology");
    expect(effective["ephemerus"].correct).toBe("ephemeris");
  });
});

describe("correctTranscriptSegments (read-time rewrite + diff log)", () => {
  let dataDir: string;
  const projectId = "proj-correct";

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-correct-segments-"));
  });

  afterEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it("returns segments unchanged (as a fresh copy) and logs nothing when there's no terms.json", async () => {
    const segments = [{ start: 0, end: 1, text: "no corrections here" }];
    const corrected = await correctTranscriptSegments(dataDir, projectId, segments, undefined);
    expect(corrected).toEqual(segments);
    expect(await readTermCorrections(dataDir, projectId)).toEqual([]);
  });

  it("rewrites segments against the project's terms.json and records a diff log entry", async () => {
    await writeTerms(dataDir, projectId, {
      "metro pro law": { correct: "metoprolol", source: "user", createdAt: "2026-01-01T00:00:00Z" },
    });
    const segments = [{ start: 0, end: 1, text: "give metro pro law now" }];
    const corrected = await correctTranscriptSegments(dataDir, projectId, segments, undefined);
    expect(corrected[0].text).toBe("give metoprolol now");

    const log = await readTermCorrections(dataDir, projectId);
    expect(log).toHaveLength(1);
    expect(log[0].hits).toEqual([{ garbled: "metro pro law", correct: "metoprolol", count: 1 }]);
  });

  it("never writes a log entry when nothing in the segments matched", async () => {
    await writeTerms(dataDir, projectId, {
      "metro pro law": { correct: "metoprolol", source: "user", createdAt: "2026-01-01T00:00:00Z" },
    });
    const segments = [{ start: 0, end: 1, text: "nothing to correct here" }];
    await correctTranscriptSegments(dataDir, projectId, segments, undefined);
    expect(await readTermCorrections(dataDir, projectId)).toEqual([]);
  });

  it("never mutates the caller's segments array/objects (read-time only, never touches source data)", async () => {
    await writeTerms(dataDir, projectId, {
      "metro pro law": { correct: "metoprolol", source: "user", createdAt: "2026-01-01T00:00:00Z" },
    });
    const segments = [{ start: 0, end: 1, text: "give metro pro law now" }];
    const snapshot = JSON.parse(JSON.stringify(segments));
    await correctTranscriptSegments(dataDir, projectId, segments, undefined);
    expect(segments).toEqual(snapshot);
  });
});

describe("markAnalysisStale (Phase 2 item 5: downstream invalidation)", () => {
  let dataDir: string;
  const projectId = "proj-stale";

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-stale-"));
  });

  afterEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it("returns false and writes nothing when there's no analysis.json yet", async () => {
    expect(await markAnalysisStale(dataDir, projectId)).toBe(false);
  });

  it("sets staleReason: 'terms-changed' on an existing analysis.json without disturbing its other fields", async () => {
    const analysisPath = analysisJsonPath(dataDir, projectId);
    const originalAnalysis = {
      generatedAt: "2026-01-01T00:00:00Z",
      model: "claude-test",
      version: 3,
      source: "model",
      pearls: [{ t: 1, label: "x", insight: "y", importance: 1 }],
      concepts: [],
      themes: [],
    };
    await writeJsonAtomic(analysisPath, originalAnalysis);

    expect(await markAnalysisStale(dataDir, projectId)).toBe(true);

    const raw = JSON.parse(await fs.readFile(analysisPath, "utf8"));
    expect(raw.staleReason).toBe("terms-changed");
    expect(raw.model).toBe("claude-test");
    expect(raw.pearls).toEqual(originalAnalysis.pearls);
  });

  it("this is exactly what PATCH /api/projects/:id/terms triggers after a mapping change (see routes/terms.ts)", async () => {
    // Simulates the route's own sequence: write a new mapping, then mark stale.
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
    await writeTerms(dataDir, projectId, {
      "metro pro law": { correct: "metoprolol", source: "user", createdAt: "2026-01-01T00:00:00Z" },
    });
    await markAnalysisStale(dataDir, projectId);
    const raw = JSON.parse(await fs.readFile(analysisPath, "utf8"));
    expect(raw.staleReason).toBe("terms-changed");
  });
});
