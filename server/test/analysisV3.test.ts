// V3-B B1 "Analysis v3 (typed extraction)" — the typed-spine pipeline layered
// on top of analysis.ts's existing chunk/merge machinery. Mirrors
// test/analysis.test.ts's structure (fake-client end-to-end, no live API
// calls) but exercises the new router gate, deterministic unit/edge merge,
// and the resulting version:3 analysis shape.
import { afterEach, describe, expect, it } from "vitest";
import {
  __setAnalysisClientV3ForTests,
  AnalysisSchema,
  FakeAnalysisClient,
  isFakeAnalysisMode,
  mergeEdgesByFingerprint,
  mergeUnitsByFingerprint,
  resolveAnalysisClientV3,
  resolvePearlUnitId,
  runAnalysisJobV3,
  unitsToConceptsMirror,
  type AnalysisLLMClientV3,
  type AnalysisOutcome,
  type AnalysisUnit,
  type ChunkV3Result,
  type MergeV3Result,
} from "../src/lib/analysis.js";
import type { TranscriptSegment } from "../src/lib/transcripts.js";

function segment(start: number, end: number, text = "word"): TranscriptSegment {
  return { start, end, text };
}

describe("mergeUnitsByFingerprint", () => {
  it("dedups units with the same label-fingerprint, averaging confidence and unioning anchors by timestamp", () => {
    const merged = mergeUnitsByFingerprint([
      {
        type: "CLAIM",
        label: "Posture Control",
        summary: "short",
        body: "short body",
        anchors: [{ t: 10, quote: "a" }],
        confidence: 0.6,
      },
      {
        type: "CLAIM",
        label: "posture control!!",
        summary: "a much longer, more complete summary",
        body: "a much longer, more complete body",
        anchors: [{ t: 500, quote: "b" }],
        confidence: 0.8,
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("posture-control");
    expect(merged[0].summary).toBe("a much longer, more complete summary");
    expect(merged[0].confidence).toBeCloseTo(0.7);
    expect(merged[0].anchors).toEqual([
      { t: 10, quote: "a" },
      { t: 500, quote: "b" },
    ]);
  });

  it("picks the most-common unit type across a group, ties going to the first occurrence", () => {
    const raw = (type: "CLAIM" | "MECHANISM") => ({
      type,
      label: "Same Thing",
      summary: "s",
      body: "b",
      anchors: [],
      confidence: 0.5,
    });
    const merged = mergeUnitsByFingerprint([raw("MECHANISM"), raw("CLAIM"), raw("CLAIM")]);
    expect(merged[0].type).toBe("CLAIM");
  });

  it("gives units with no alphanumeric label their own fingerprint rather than merging them together", () => {
    const raw = (body: string) => ({
      type: "CLAIM" as const,
      label: "###",
      summary: "s",
      body,
      anchors: [],
      confidence: 0.5,
    });
    const merged = mergeUnitsByFingerprint([raw("first"), raw("second")]);
    expect(merged).toHaveLength(2);
    expect(new Set(merged.map((u) => u.id)).size).toBe(2);
  });

  it("preserves input order of first appearance across distinct fingerprints", () => {
    const raw = (label: string) => ({ type: "CLAIM" as const, label, summary: "s", body: "b", anchors: [], confidence: 0.5 });
    const merged = mergeUnitsByFingerprint([raw("Second"), raw("First")]);
    expect(merged.map((u) => u.label)).toEqual(["Second", "First"]);
  });
});

// --- V3-D D1/D2: overlay + threshold merging ------------------------------

describe("mergeUnitsByFingerprint — V3-D D1 overlay merging", () => {
  const base = {
    type: "MECHANISM" as const,
    label: "Same Concept",
    summary: "s",
    body: "b",
    anchors: [],
    confidence: 0.5,
  };

  it("omits overlay entirely (undefined, not {}) when no unit in the group carries one", () => {
    const merged = mergeUnitsByFingerprint([{ ...base }]);
    expect(merged[0].overlay).toBeUndefined();
  });

  it("keeps a single unit's overlay, dropping empty-string/empty-array sentinel fields", () => {
    const merged = mergeUnitsByFingerprint([
      { ...base, overlay: { levelOfOrganization: "cell", mechanismType: "", entities: ["mitochondria"], sourceType: "" } },
    ]);
    expect(merged[0].overlay).toEqual({ levelOfOrganization: "cell", entities: ["mitochondria"] });
  });

  it("unions array overlay fields (deduped) and keeps the first non-empty scalar across the group", () => {
    const merged = mergeUnitsByFingerprint([
      { ...base, overlay: { entities: ["hip", "shoulder"], mechanismType: "feedback loop" } },
      { ...base, overlay: { entities: ["shoulder", "knee"], mechanismType: "causal chain" } },
    ]);
    expect(merged[0].overlay?.entities).toEqual(["hip", "shoulder", "knee"]);
    // First non-empty wins — the group's first unit already had a non-empty mechanismType.
    expect(merged[0].overlay?.mechanismType).toBe("feedback loop");
  });

  it("falls through to a later unit's scalar field when an earlier one in the group left it empty", () => {
    const merged = mergeUnitsByFingerprint([
      { ...base, overlay: { mechanismType: "" } },
      { ...base, overlay: { mechanismType: "feedback loop" } },
    ]);
    expect(merged[0].overlay?.mechanismType).toBe("feedback loop");
  });
});

describe("mergeUnitsByFingerprint — V3-D D2 threshold merging", () => {
  const base = { type: "CLAIM" as const, label: "Same Concept", summary: "s", body: "b", anchors: [], confidence: 0.5 };

  it("defaults to false when no unit in the group is flagged (including when threshold is entirely absent)", () => {
    const merged = mergeUnitsByFingerprint([{ ...base }]);
    expect(merged[0].threshold).toBe(false);
  });

  it("is true if ANY unit in the fingerprint group was flagged threshold", () => {
    const merged = mergeUnitsByFingerprint([{ ...base, threshold: false }, { ...base, threshold: true }]);
    expect(merged[0].threshold).toBe(true);
  });
});

describe("mergeEdgesByFingerprint", () => {
  const units: AnalysisUnit[] = [
    { id: "a", type: "CLAIM", label: "A", summary: "s", body: "b", anchors: [], confidence: 0.9, threshold: false },
    { id: "b", type: "EXAMPLE", label: "B", summary: "s", body: "b", anchors: [], confidence: 0.9, threshold: false },
  ];

  it("resolves sourceLabel/targetLabel to unit ids and averages confidence across duplicates", () => {
    const merged = mergeEdgesByFingerprint(
      [
        { sourceLabel: "B", targetLabel: "A", type: "EXAMPLE_OF", quote: "short", confidence: 0.4 },
        { sourceLabel: "b", targetLabel: "a", type: "EXAMPLE_OF", quote: "a much longer quote", confidence: 0.8 },
      ],
      units
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe("b");
    expect(merged[0].target).toBe("a");
    expect(merged[0].type).toBe("EXAMPLE_OF");
    expect(merged[0].quote).toBe("a much longer quote");
    expect(merged[0].confidence).toBeCloseTo(0.6);
  });

  it("drops an edge whose source or target doesn't resolve to a known unit", () => {
    const merged = mergeEdgesByFingerprint(
      [{ sourceLabel: "B", targetLabel: "Unknown Unit", type: "EXAMPLE_OF", quote: "q", confidence: 0.5 }],
      units
    );
    expect(merged).toHaveLength(0);
  });

  it("drops a self-loop edge", () => {
    const merged = mergeEdgesByFingerprint(
      [{ sourceLabel: "A", targetLabel: "A", type: "REQUIRES", quote: "q", confidence: 0.5 }],
      units
    );
    expect(merged).toHaveLength(0);
  });

  it("keeps edges of different types between the same pair of units as distinct entries", () => {
    const merged = mergeEdgesByFingerprint(
      [
        { sourceLabel: "B", targetLabel: "A", type: "EXAMPLE_OF", quote: "q1", confidence: 0.5 },
        { sourceLabel: "B", targetLabel: "A", type: "REQUIRES", quote: "q2", confidence: 0.5 },
      ],
      units
    );
    expect(merged).toHaveLength(2);
  });
});

describe("resolvePearlUnitId", () => {
  const knownUnitIds = new Set(["posture-control"]);

  it("resolves a matching label to its unit id", () => {
    expect(resolvePearlUnitId("Posture Control", knownUnitIds)).toBe("posture-control");
  });

  it("returns undefined for an empty unitLabel", () => {
    expect(resolvePearlUnitId("", knownUnitIds)).toBeUndefined();
    expect(resolvePearlUnitId("   ", knownUnitIds)).toBeUndefined();
  });

  it("returns undefined when the label doesn't match any known unit", () => {
    expect(resolvePearlUnitId("Some Other Thing", knownUnitIds)).toBeUndefined();
  });
});

describe("unitsToConceptsMirror", () => {
  it("maps each unit onto the legacy AnalysisConcept shape 1:1", () => {
    const units: AnalysisUnit[] = [
      { id: "u1", type: "MECHANISM", label: "L", summary: "S", body: "B", anchors: [{ t: 5, quote: "q" }], confidence: 0.9, threshold: false },
    ];
    expect(unitsToConceptsMirror(units)).toEqual([{ id: "u1", title: "L", summary: "S", body: "B", anchors: [{ t: 5 }] }]);
  });
});

describe("AnalysisSchema (v3 round-trip)", () => {
  it("parses a version:3 analysis with domain/units/edges", () => {
    const parsed = AnalysisSchema.parse({
      generatedAt: "2026-01-01T00:00:00Z",
      model: "claude-opus-5",
      version: 3,
      source: "model",
      domain: "physical_skill",
      pearls: [{ t: 1, label: "L", insight: "I", importance: 2, unitId: "u1" }],
      concepts: [{ id: "u1", title: "T", summary: "S", body: "B", anchors: [{ t: 1 }] }],
      themes: [{ title: "Theme", body: "Body" }],
      units: [{ id: "u1", type: "PROCEDURE", label: "T", summary: "S", body: "B", anchors: [{ t: 1, quote: "q" }], confidence: 0.7 }],
      edges: [{ source: "u1", target: "u1", type: "PROCEDURE_STEP", quote: "q", confidence: 0.5 }],
    });
    expect(parsed.version).toBe(3);
    expect(parsed.domain).toBe("physical_skill");
    expect(parsed.units).toHaveLength(1);
    expect(parsed.edges).toHaveLength(1);
    expect(parsed.pearls[0].unitId).toBe("u1");
  });

  it("still parses a legacy version:2 analysis with domain/units/edges absent", () => {
    const parsed = AnalysisSchema.parse({
      generatedAt: "2026-01-01T00:00:00Z",
      model: "claude-opus-5",
      version: 2,
      pearls: [],
      concepts: [],
      themes: [],
    });
    expect(parsed.version).toBe(2);
    expect(parsed.domain).toBeUndefined();
    expect(parsed.units).toBeUndefined();
    expect(parsed.edges).toBeUndefined();
  });

  it("parses a unit with a full overlay object and threshold:true (V3-D D1/D2)", () => {
    const parsed = AnalysisSchema.parse({
      generatedAt: "2026-01-01T00:00:00Z",
      model: "claude-opus-5",
      version: 3,
      source: "model",
      domain: "biology",
      pearls: [],
      concepts: [],
      themes: [],
      units: [
        {
          id: "u1",
          type: "MECHANISM",
          label: "T",
          summary: "S",
          body: "B",
          anchors: [],
          confidence: 0.7,
          overlay: { levelOfOrganization: "cell", entities: ["mitochondria"] },
          threshold: true,
        },
      ],
      edges: [],
    });
    expect(parsed.units![0].overlay).toEqual({ levelOfOrganization: "cell", entities: ["mitochondria"] });
    expect(parsed.units![0].threshold).toBe(true);
  });

  it("defaults threshold to false and overlay to undefined when both are absent (legacy/pre-D1 units)", () => {
    const parsed = AnalysisSchema.parse({
      generatedAt: "2026-01-01T00:00:00Z",
      model: "claude-opus-5",
      version: 3,
      pearls: [],
      concepts: [],
      themes: [],
      units: [{ id: "u1", type: "CLAIM", label: "T", summary: "S", body: "B", anchors: [], confidence: 0.5 }],
      edges: [],
    });
    expect(parsed.units![0].threshold).toBe(false);
    expect(parsed.units![0].overlay).toBeUndefined();
  });

  it("tolerates an overlay object with only some fields set — zod optional everywhere (SPEC D1)", () => {
    const parsed = AnalysisSchema.parse({
      generatedAt: "2026-01-01T00:00:00Z",
      model: "claude-opus-5",
      version: 3,
      pearls: [],
      concepts: [],
      themes: [],
      units: [
        {
          id: "u1",
          type: "PROCEDURE",
          label: "T",
          summary: "S",
          body: "B",
          anchors: [],
          confidence: 0.5,
          overlay: { drillPairing: "isolation drill" },
        },
      ],
      edges: [],
    });
    expect(parsed.units![0].overlay).toEqual({ drillPairing: "isolation drill" });
  });

  it("rejects a version outside {2,3}", () => {
    const result = AnalysisSchema.safeParse({
      generatedAt: "2026-01-01T00:00:00Z",
      model: "claude-opus-5",
      version: 4,
      pearls: [],
      concepts: [],
      themes: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("resolveAnalysisClientV3 / router gate", () => {
  afterEach(() => {
    __setAnalysisClientV3ForTests(null);
    delete process.env.STUDYLOOP_FAKE_ANALYSIS;
  });

  it("returns a test-injected v3 client above all else", () => {
    const routerOutcome: AnalysisOutcome<{ domain: "generic" }> = { kind: "ok", data: { domain: "generic" } };
    const chunkOutcome: AnalysisOutcome<ChunkV3Result> = { kind: "ok", data: { pearls: [], units: [], edges: [] } };
    const mergeOutcome: AnalysisOutcome<MergeV3Result> = { kind: "ok", data: { pearls: [], themes: [] } };
    const fake: AnalysisLLMClientV3 = {
      runRouter: async () => routerOutcome,
      runChunkV3: async () => chunkOutcome,
      runMergeV3: async () => mergeOutcome,
    };
    __setAnalysisClientV3ForTests(fake);
    expect(resolveAnalysisClientV3(null)).toBe(fake);
    expect(isFakeAnalysisMode()).toBe(true);
  });

  it("falls back to domain 'generic' when the router call itself is skipped, without aborting the run", async () => {
    const segments: TranscriptSegment[] = [segment(0, 10, "hello world")];
    const flaky: AnalysisLLMClientV3 = {
      runRouter: async () => ({ kind: "skipped", reason: "refusal", detail: "declined" }),
      runChunkV3: (chunk, domain) => new FakeAnalysisClient().runChunkV3(chunk, domain, "claude-opus-5"),
      runMergeV3: (pearls) => new FakeAnalysisClient().runMergeV3(pearls, "claude-opus-5"),
    };
    const analysis = await runAnalysisJobV3({ segments, model: "claude-opus-5", client: flaky });
    expect(analysis.domain).toBe("generic");
    expect(analysis.version).toBe(3);
  });
});

describe("runAnalysisJobV3 (fake client end-to-end — no live API calls)", () => {
  it("produces a version:3 analysis with domain/pearls/concepts/themes/units/edges", async () => {
    const segments: TranscriptSegment[] = [];
    for (let t = 0; t < 1000; t += 5) segments.push(segment(t, t + 5, `text at ${t}`));

    const analysis = await runAnalysisJobV3({ segments, model: "claude-opus-5", client: new FakeAnalysisClient() });

    expect(analysis.version).toBe(3);
    expect(analysis.model).toBe("claude-opus-5");
    expect(["biology", "history", "music", "physical_skill", "generic"]).toContain(analysis.domain);
    expect(analysis.pearls.length).toBeGreaterThan(0);
    expect(analysis.units && analysis.units.length).toBeGreaterThan(0);
    expect(analysis.edges && analysis.edges.length).toBeGreaterThan(0);
    expect(analysis.themes.length).toBeGreaterThan(0);
    // Backward-compat mirror: concepts stays populated 1:1 with units.
    expect(analysis.concepts.length).toBe(analysis.units!.length);
    // At least one pearl resolved a unitId (fake client always tags unitLabel = its own primary unit's label).
    expect(analysis.pearls.some((p) => p.unitId)).toBe(true);
    // V3-D D2: fake mode deterministically flags every 3rd chunk's primary unit threshold.
    expect(analysis.units!.some((u) => u.threshold)).toBe(true);
    expect(analysis.units!.some((u) => u.threshold === false)).toBe(true);
  });

  it("V3-D D1: emits a domain-shaped overlay on the primary unit, deterministically, for every non-generic domain", async () => {
    const segments: TranscriptSegment[] = [segment(0, 480, "posture control passing the guard")];
    const client = new FakeAnalysisClient();

    for (const domain of ["biology", "history", "music", "physical_skill"] as const) {
      const routed: AnalysisLLMClientV3 = {
        runRouter: async () => ({ kind: "ok", data: { domain } }),
        runChunkV3: (chunk, d) => client.runChunkV3(chunk, d, "claude-opus-5"),
        runMergeV3: (pearls) => client.runMergeV3(pearls, "claude-opus-5"),
      };
      // eslint-disable-next-line no-await-in-loop -- small fixed domain list, sequential is fine in a test
      const analysis = await runAnalysisJobV3({ segments, model: "claude-opus-5", client: routed });
      expect(analysis.domain).toBe(domain);
      const primary = analysis.units!.find((u) => u.type !== "EXAMPLE");
      expect(primary?.overlay).toBeDefined();
      expect(Object.keys(primary!.overlay!).length).toBeGreaterThan(0);
    }

    // generic: overlay stays absent (empty object collapses to undefined — see mergeOverlayFields).
    const genericRouted: AnalysisLLMClientV3 = {
      runRouter: async () => ({ kind: "ok", data: { domain: "generic" } }),
      runChunkV3: (chunk, d) => client.runChunkV3(chunk, d, "claude-opus-5"),
      runMergeV3: (pearls) => client.runMergeV3(pearls, "claude-opus-5"),
    };
    const genericAnalysis = await runAnalysisJobV3({ segments, model: "claude-opus-5", client: genericRouted });
    expect(genericAnalysis.units!.every((u) => u.overlay === undefined)).toBe(true);
  });

  it("V3-D D1/D2: two runs over the same input produce byte-identical overlay/threshold output (no randomness)", async () => {
    const segments: TranscriptSegment[] = [segment(0, 480, "posture control passing the guard")];
    const a = await runAnalysisJobV3({ segments, model: "claude-opus-5", client: new FakeAnalysisClient() });
    const b = await runAnalysisJobV3({ segments, model: "claude-opus-5", client: new FakeAnalysisClient() });
    expect(a.units!.map((u) => ({ overlay: u.overlay, threshold: u.threshold }))).toEqual(
      b.units!.map((u) => ({ overlay: u.overlay, threshold: u.threshold }))
    );
  });

  it("reports progress up to 100", async () => {
    const segments = [segment(0, 10)];
    const progressValues: number[] = [];
    await runAnalysisJobV3({
      segments,
      model: "claude-opus-5",
      client: new FakeAnalysisClient(),
      onProgress: (pct) => progressValues.push(pct),
    });
    expect(progressValues[progressValues.length - 1]).toBe(100);
  });

  it("throws for a transcript with no content", async () => {
    await expect(runAnalysisJobV3({ segments: [], model: "claude-opus-5", client: new FakeAnalysisClient() })).rejects.toThrow();
  });

  it("throws when the merge pass itself fails", async () => {
    const segments = [segment(0, 10)];
    const mergeFails: AnalysisLLMClientV3 = {
      runRouter: async () => ({ kind: "ok", data: { domain: "generic" } }),
      runChunkV3: (chunk, domain) => new FakeAnalysisClient().runChunkV3(chunk, domain, "claude-opus-5"),
      runMergeV3: async () => ({ kind: "skipped", reason: "refusal", detail: "merge declined" }),
    };
    await expect(runAnalysisJobV3({ segments, model: "claude-opus-5", client: mergeFails })).rejects.toThrow(/Merge pass failed/);
  });

  it("throws (never silently returns an empty analysis) when every chunk is skipped", async () => {
    const segments = [segment(0, 10)];
    const allSkip: AnalysisLLMClientV3 = {
      runRouter: async () => ({ kind: "ok", data: { domain: "generic" } }),
      runChunkV3: async () => ({ kind: "skipped", reason: "refusal", detail: "declined" }),
      runMergeV3: async () => ({ kind: "ok", data: { pearls: [], themes: [] } }),
    };
    await expect(runAnalysisJobV3({ segments, model: "claude-opus-5", client: allSkip })).rejects.toThrow(/skipped/);
  });

  it("stamps source through to the result", async () => {
    const segments = [segment(0, 10)];
    const analysis = await runAnalysisJobV3({
      segments,
      model: "claude-opus-5",
      client: new FakeAnalysisClient(),
      source: "stub",
    });
    expect(analysis.source).toBe("stub");
  });
});
