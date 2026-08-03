// V3-B B1 "Analysis v3 (typed extraction)" — the typed-spine pipeline layered
// on top of analysis.ts's existing chunk/merge machinery. Mirrors
// test/analysis.test.ts's structure (fake-client end-to-end, no live API
// calls) but exercises the new router gate, deterministic unit/edge merge,
// and the resulting version:3 analysis shape.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  __setAnalysisClientV3ForTests,
  AnalysisSchema,
  AnalysisUnitSchema,
  buildSlideContextBlock,
  CLUSTER_MAX_MEMBERS,
  effectiveEvidence,
  FakeAnalysisClient,
  isFakeAnalysisMode,
  LLMAnalysisClient,
  mapChunkToSlidePages,
  mergeEdgesByFingerprint,
  mergeUnitsByFingerprint,
  resolveAnalysisClientV3,
  resolvePearlUnitId,
  runAnalysisJobV3,
  SLIDE_CONTEXT_MAX_CHARS,
  unitsToConceptsMirror,
  type AnalysisLLMClientV3,
  type AnalysisOutcome,
  type AnalysisUnit,
  type ChunkV3Result,
  type MergeV3Result,
} from "../src/lib/analysis.js";
import { __resetLensRegistryCacheForTests } from "../src/lib/lenses.js";
import type { StructuredLLMCaller, StructuredLLMRequest, StructuredCallResult } from "../src/lib/providers.js";
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

// --- Phase 4 "Cluster unit type" (design/EXECUTION-PLAN-post-review-v1.md):
// attest-once, fan-out-to-N-cards — see AnalysisUnitSchema's members bound
// and review.ts's per-member card derivation. ---------------------------

describe("mergeUnitsByFingerprint — Phase 4 CLUSTER merging", () => {
  const member = (label: string, body: string) => ({ label, body });
  const clusterRaw = (overrides: Partial<{ label: string; summary: string; body: string; confidence: number; members: { label: string; body: string }[] }> = {}) => ({
    type: "CLUSTER" as const,
    label: "Side effects of metoprolol",
    summary: "s",
    body: "b",
    anchors: [],
    confidence: 0.8,
    members: [member("Bradycardia", "Slow heart rate."), member("Hypotension", "Low blood pressure.")],
    ...overrides,
  });

  it("keeps a CLUSTER unit's members when it's the sole occurrence in its fingerprint group", () => {
    const merged = mergeUnitsByFingerprint([clusterRaw()]);
    expect(merged).toHaveLength(1);
    expect(merged[0].type).toBe("CLUSTER");
    expect(merged[0].members).toEqual([
      { label: "Bradycardia", body: "Slow heart rate." },
      { label: "Hypotension", body: "Low blood pressure." },
    ]);
  });

  it("unions members across duplicate/overlapping chunks of the same cluster, deduping by (case-insensitive) label", () => {
    const merged = mergeUnitsByFingerprint([
      clusterRaw({ confidence: 0.7 }),
      clusterRaw({
        label: "side effects of metoprolol",
        confidence: 0.9,
        members: [member("bradycardia", "duplicate — should be dropped"), member("Fatigue", "Tiredness.")],
      }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].members?.map((m) => m.label)).toEqual(["Bradycardia", "Hypotension", "Fatigue"]);
  });

  it("caps merged members at CLUSTER_MAX_MEMBERS", () => {
    const members = Array.from({ length: CLUSTER_MAX_MEMBERS + 5 }, (_, i) => member(`Effect ${i}`, `Body ${i}`));
    const merged = mergeUnitsByFingerprint([clusterRaw({ members })]);
    expect(merged[0].members).toHaveLength(CLUSTER_MAX_MEMBERS);
  });

  it("demotes to the group's most-common non-CLUSTER type when the merged member set collapses below the minimum", () => {
    const merged = mergeUnitsByFingerprint([
      clusterRaw({ label: "Weird cluster", members: [member("Only one", "b")] }),
      { type: "CLAIM" as const, label: "weird cluster", summary: "s2", body: "b2", anchors: [], confidence: 0.6 },
      { type: "CLAIM" as const, label: "Weird Cluster", summary: "s3", body: "b3", anchors: [], confidence: 0.5 },
    ]);
    expect(merged[0].type).toBe("CLAIM");
    expect(merged[0].members).toBeUndefined();
  });

  it("demotes to CLAIM as the ultimate fallback when the group has no non-CLUSTER type to demote to", () => {
    const merged = mergeUnitsByFingerprint([clusterRaw({ label: "Weird cluster", members: [member("Only one", "b")] })]);
    expect(merged[0].type).toBe("CLAIM");
    expect(merged[0].members).toBeUndefined();
  });

  it("drops members entirely when CLUSTER loses the majority-type vote within its fingerprint group", () => {
    const merged = mergeUnitsByFingerprint([
      { type: "CLAIM" as const, label: "Mixed group", summary: "s", body: "b", anchors: [], confidence: 0.6 },
      { type: "CLAIM" as const, label: "mixed group", summary: "s2", body: "b2", anchors: [], confidence: 0.7 },
      clusterRaw({ label: "Mixed Group", confidence: 0.5 }),
    ]);
    expect(merged[0].type).toBe("CLAIM");
    expect(merged[0].members).toBeUndefined();
  });
});

// --- Phase 6 "Slide-text channel, smallest slice (PDF)"
// (design/EXECUTION-PLAN-post-review-v1.md) -----------------------------

describe("mapChunkToSlidePages (Phase 6: naive proportional chunk->page mapping)", () => {
  it("maps a single chunk to the whole deck", () => {
    expect(mapChunkToSlidePages(0, 1, 10)).toEqual({ startPage: 1, endPage: 10 });
  });

  it("distributes pages evenly across chunks when they divide cleanly", () => {
    // 10 pages / 5 chunks = 2 pages each.
    expect(mapChunkToSlidePages(0, 5, 10)).toEqual({ startPage: 1, endPage: 2 });
    expect(mapChunkToSlidePages(1, 5, 10)).toEqual({ startPage: 3, endPage: 4 });
    expect(mapChunkToSlidePages(4, 5, 10)).toEqual({ startPage: 9, endPage: 10 });
  });

  it("the first chunk always starts at page 1 and the last chunk always ends at the last page, even when it doesn't divide cleanly", () => {
    // 7 pages / 3 chunks.
    const first = mapChunkToSlidePages(0, 3, 7);
    const last = mapChunkToSlidePages(2, 3, 7);
    expect(first?.startPage).toBe(1);
    expect(last?.endPage).toBe(7);
  });

  it("every chunk's range stays within [1, totalPages] and start <= end", () => {
    for (let totalChunks = 1; totalChunks <= 12; totalChunks++) {
      for (let i = 0; i < totalChunks; i++) {
        const range = mapChunkToSlidePages(i, totalChunks, 7);
        expect(range).not.toBeNull();
        expect(range!.startPage).toBeGreaterThanOrEqual(1);
        expect(range!.endPage).toBeLessThanOrEqual(7);
        expect(range!.startPage).toBeLessThanOrEqual(range!.endPage);
      }
    }
  });

  it("more chunks than pages: every chunk still gets a valid (possibly repeating) 1-page-or-more range", () => {
    // 3 pages / 10 chunks — several chunks map to the same page(s), none map to nothing.
    for (let i = 0; i < 10; i++) {
      const range = mapChunkToSlidePages(i, 10, 3);
      expect(range).not.toBeNull();
      expect(range!.startPage).toBeGreaterThanOrEqual(1);
      expect(range!.endPage).toBeLessThanOrEqual(3);
    }
  });

  it("returns null for zero pages or a non-positive chunk count", () => {
    expect(mapChunkToSlidePages(0, 5, 0)).toBeNull();
    expect(mapChunkToSlidePages(0, 0, 10)).toBeNull();
  });
});

describe("buildSlideContextBlock (Phase 6: per-chunk slide context assembly)", () => {
  const pages = [
    { page: 1, text: "Intro slide text" },
    { page: 2, text: "Middle slide text" },
    { page: 3, text: "Conclusion slide text" },
  ];

  it("returns undefined when there are no pages at all (no deck attached)", () => {
    expect(buildSlideContextBlock([], 0, 3)).toBeUndefined();
  });

  it("includes the mapped page range's text, labeled by slide number", () => {
    const block = buildSlideContextBlock(pages, 0, 3);
    expect(block).toContain("Slide deck text (pages 1–1");
    expect(block).toContain("[Slide 1]");
    expect(block).toContain("Intro slide text");
    expect(block).not.toContain("Middle slide text");
  });

  it("names this as naive/proportional, not synced to transcript timing (honest-comment requirement)", () => {
    const block = buildSlideContextBlock(pages, 1, 3);
    expect(block).toMatch(/naive proportional mapping|NOT synced/i);
  });

  it("skips blank pages within the mapped range and returns undefined if all of them are blank", () => {
    const blankPages = [
      { page: 1, text: "   " },
      { page: 2, text: "" },
    ];
    expect(buildSlideContextBlock(blankPages, 0, 1)).toBeUndefined();
  });

  it("caps the assembled text at SLIDE_CONTEXT_MAX_CHARS", () => {
    const hugePages = [{ page: 1, text: "x".repeat(SLIDE_CONTEXT_MAX_CHARS * 3) }];
    const block = buildSlideContextBlock(hugePages, 0, 1)!;
    // Allow the fixed "[Slide 1]\n" prefix + "Slide deck text (...)" wrapper
    // text around the capped body — only the BODY itself is bounded.
    expect(block.length).toBeLessThan(SLIDE_CONTEXT_MAX_CHARS + 400);
    expect(block).toContain("(truncated)");
  });

  it("returns undefined when the mapped range lands entirely outside every page's actual page number (more chunks than pages, last chunk overshoots)", () => {
    // 1 page split across 5 chunks — later chunks all clamp back onto page 1, never undefined; sanity-check the invariant that *some* chunk still resolves it.
    const results = [0, 1, 2, 3, 4].map((i) => buildSlideContextBlock(pages.slice(0, 1), i, 5));
    expect(results.some((r) => r !== undefined)).toBe(true);
  });
});

describe("mergeUnitsByFingerprint — Phase 6 evidence merging", () => {
  const base = {
    type: "CLAIM" as const,
    label: "Same Concept",
    summary: "s",
    body: "b",
    anchors: [],
    confidence: 0.5,
  };

  it("leaves evidence undefined (collapses to 'transcript' via effectiveEvidence) when nothing in the group ever set it", () => {
    const merged = mergeUnitsByFingerprint([{ ...base }]);
    expect(merged[0].evidence).toBeUndefined();
    expect(effectiveEvidence(merged[0])).toBe("transcript");
  });

  it("keeps a single unit's explicit evidence", () => {
    const merged = mergeUnitsByFingerprint([{ ...base, evidence: "slides" }]);
    expect(merged[0].evidence).toBe("slides");
  });

  it("'both' wins when the group has support for transcript AND slides across separate raw units", () => {
    const merged = mergeUnitsByFingerprint([
      { ...base, evidence: "transcript" },
      { ...base, evidence: "slides" },
    ]);
    expect(merged[0].evidence).toBe("both");
  });

  it("a single raw unit already marked 'both' stays 'both'", () => {
    const merged = mergeUnitsByFingerprint([{ ...base, evidence: "both" }]);
    expect(merged[0].evidence).toBe("both");
  });

  it("stays 'transcript' when every raw unit in the group says 'transcript'", () => {
    const merged = mergeUnitsByFingerprint([{ ...base, evidence: "transcript" }, { ...base, evidence: "transcript" }]);
    expect(merged[0].evidence).toBe("transcript");
  });
});

describe("AnalysisSchema — Phase 6 staleReason 'slides-changed'", () => {
  it("accepts 'slides-changed' alongside the existing 'terms-changed'", () => {
    const base = {
      generatedAt: "2026-01-01T00:00:00Z",
      model: "claude-test",
      pearls: [],
      concepts: [],
      themes: [],
    };
    expect(AnalysisSchema.safeParse({ ...base, staleReason: "slides-changed" }).success).toBe(true);
    expect(AnalysisSchema.safeParse({ ...base, staleReason: "terms-changed" }).success).toBe(true);
    expect(AnalysisSchema.safeParse({ ...base, staleReason: null }).success).toBe(true);
    expect(AnalysisSchema.safeParse({ ...base }).success).toBe(true);
    expect(AnalysisSchema.safeParse({ ...base, staleReason: "bogus" }).success).toBe(false);
  });
});

describe("runAnalysisJobV3 — Phase 6 slide context threading", () => {
  it("passes no slideContext when the project has no slidePages", async () => {
    const seenSlideContexts: (string | undefined)[] = [];
    const spy: AnalysisLLMClientV3 = {
      runRouter: async () => ({ kind: "ok", data: { domain: "generic" } }),
      runChunkV3: async (chunk, domain, model, slideContext) => {
        seenSlideContexts.push(slideContext);
        return new FakeAnalysisClient().runChunkV3(chunk, domain, model, slideContext);
      },
      runMergeV3: (pearls) => new FakeAnalysisClient().runMergeV3(pearls, "claude-opus-5"),
    };
    const segments: TranscriptSegment[] = [];
    for (let t = 0; t < 1000; t += 5) segments.push(segment(t, t + 5, `text at ${t}`));
    await runAnalysisJobV3({ segments, model: "claude-opus-5", client: spy });
    expect(seenSlideContexts.every((c) => c === undefined)).toBe(true);
  });

  it("passes a distinct, mapped slideContext per chunk when slidePages are provided", async () => {
    const seenSlideContexts: (string | undefined)[] = [];
    const spy: AnalysisLLMClientV3 = {
      runRouter: async () => ({ kind: "ok", data: { domain: "generic" } }),
      runChunkV3: async (chunk, domain, model, slideContext) => {
        seenSlideContexts.push(slideContext);
        return new FakeAnalysisClient().runChunkV3(chunk, domain, model, slideContext);
      },
      runMergeV3: (pearls) => new FakeAnalysisClient().runMergeV3(pearls, "claude-opus-5"),
    };
    const segments: TranscriptSegment[] = [];
    for (let t = 0; t < 2000; t += 5) segments.push(segment(t, t + 5, `text at ${t}`));
    const slidePages = [
      { page: 1, text: "Alpha slide content" },
      { page: 2, text: "Beta slide content" },
      { page: 3, text: "Gamma slide content" },
      { page: 4, text: "Delta slide content" },
    ];
    const analysis = await runAnalysisJobV3({ segments, model: "claude-opus-5", client: spy, slidePages });

    expect(seenSlideContexts.length).toBeGreaterThan(1);
    expect(seenSlideContexts.every((c) => c !== undefined)).toBe(true);
    // Different chunks (first vs. last) mapped to different page ranges.
    expect(seenSlideContexts[0]).not.toBe(seenSlideContexts[seenSlideContexts.length - 1]);
    expect(seenSlideContexts[0]).toContain("Alpha slide content");

    // Fake client sets evidence deterministically whenever it saw slide context.
    expect(analysis.units!.some((u) => u.evidence === "slides" || u.evidence === "both")).toBe(true);
  });
});

describe("AnalysisUnitSchema — Phase 4 CLUSTER members bound", () => {
  const base = {
    id: "u1",
    type: "CLUSTER" as const,
    label: "Side effects of metoprolol",
    summary: "Common adverse effects to watch for.",
    body: "Longer body.",
    anchors: [{ t: 10, quote: "side effects include" }],
    confidence: 0.8,
    threshold: false,
  };

  it("accepts a CLUSTER unit at the minimum bound (2 members)", () => {
    const result = AnalysisUnitSchema.safeParse({ ...base, members: [{ label: "A", body: "a" }, { label: "B", body: "b" }] });
    expect(result.success).toBe(true);
  });

  it("accepts a CLUSTER unit at the maximum bound (12 members)", () => {
    const members = Array.from({ length: 12 }, (_, i) => ({ label: `Effect ${i}`, body: `Body ${i}` }));
    expect(AnalysisUnitSchema.safeParse({ ...base, members }).success).toBe(true);
  });

  it("rejects a CLUSTER unit with fewer than 2 members", () => {
    expect(AnalysisUnitSchema.safeParse({ ...base, members: [{ label: "Only one", body: "b" }] }).success).toBe(false);
  });

  it("rejects a CLUSTER unit with more than 12 members", () => {
    const members = Array.from({ length: 13 }, (_, i) => ({ label: `Effect ${i}`, body: `Body ${i}` }));
    expect(AnalysisUnitSchema.safeParse({ ...base, members }).success).toBe(false);
  });

  it("rejects a CLUSTER unit with members entirely absent", () => {
    expect(AnalysisUnitSchema.safeParse(base).success).toBe(false);
  });

  it("rejects a non-CLUSTER unit that carries members", () => {
    const claim = { ...base, type: "CLAIM" as const, members: [{ label: "a", body: "b" }, { label: "c", body: "d" }] };
    expect(AnalysisUnitSchema.safeParse(claim).success).toBe(false);
  });

  it("accepts a non-CLUSTER unit with no members field at all", () => {
    expect(AnalysisUnitSchema.safeParse({ ...base, type: "CLAIM" as const }).success).toBe(true);
  });

  it("member anchorSec is optional — present on some members, absent on others", () => {
    const result = AnalysisUnitSchema.safeParse({
      ...base,
      members: [{ label: "a", body: "b" }, { label: "c", body: "d", anchorSec: 42 }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.members?.[0].anchorSec).toBeUndefined();
      expect(result.data.members?.[1].anchorSec).toBe(42);
    }
  });
});

describe("AnalysisSchema — Phase 4 CLUSTER round-trip through a full analysis document", () => {
  it("round-trips a version:3 analysis containing a feedable CLUSTER unit", () => {
    const parsed = AnalysisSchema.parse({
      generatedAt: "2026-01-01T00:00:00Z",
      model: "claude-opus-5",
      version: 3,
      source: "model",
      domain: "generic",
      pearls: [],
      concepts: [],
      themes: [],
      units: [
        {
          id: "cluster1",
          type: "CLUSTER",
          label: "Side effects of metoprolol",
          summary: "Common adverse effects.",
          body: "Bradycardia, hypotension, fatigue.",
          anchors: [{ t: 100, quote: "side effects include" }],
          confidence: 0.85,
          members: [
            { label: "Bradycardia", body: "Slow heart rate." },
            { label: "Hypotension", body: "Low blood pressure." },
            { label: "Fatigue", body: "Tiredness.", anchorSec: 120 },
          ],
        },
      ],
      edges: [],
    });
    expect(parsed.units![0].type).toBe("CLUSTER");
    expect(parsed.units![0].members).toHaveLength(3);
    expect(parsed.units![0].members?.[2].anchorSec).toBe(120);
  });

  it("rejects a whole analysis document if one of its CLUSTER units breaks the members bound (one bad unit invalidates the file)", () => {
    const result = AnalysisSchema.safeParse({
      generatedAt: "2026-01-01T00:00:00Z",
      model: "claude-opus-5",
      version: 3,
      pearls: [],
      concepts: [],
      themes: [],
      units: [
        {
          id: "cluster1",
          type: "CLUSTER",
          label: "Broken cluster",
          summary: "s",
          body: "b",
          anchors: [],
          confidence: 0.5,
          members: [{ label: "Only one", body: "b" }],
        },
      ],
      edges: [],
    });
    expect(result.success).toBe(false);
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

// --- Phase 5 "Lens registry + clinical as first data-driven lens" ----------
// (design/EXECUTION-PLAN-post-review-v1.md, AMENDED spec).

describe("AnalysisSchema/DomainSchema — Phase 5 legacy five-id compat", () => {
  it("still parses a version:3 analysis stored under an original five-lens id (identical strings, no enum check anymore)", () => {
    for (const domain of ["biology", "history", "music", "physical_skill", "generic"]) {
      const parsed = AnalysisSchema.parse({
        generatedAt: "2026-01-01T00:00:00Z",
        model: "claude-opus-5",
        version: 3,
        source: "model",
        domain,
        pearls: [],
        concepts: [],
        themes: [],
        units: [],
        edges: [],
      });
      expect(parsed.domain).toBe(domain);
    }
  });

  it("also parses the new 'clinical' lens id", () => {
    const parsed = AnalysisSchema.parse({
      generatedAt: "2026-01-01T00:00:00Z",
      model: "claude-opus-5",
      version: 3,
      source: "model",
      domain: "clinical",
      pearls: [],
      concepts: [],
      themes: [],
      units: [],
      edges: [],
    });
    expect(parsed.domain).toBe("clinical");
  });

  it("DomainSchema is a validated string, not a closed enum — an arbitrary/future lens id parses at the schema level too (boundary validation lives in routes, not here)", () => {
    const parsed = AnalysisSchema.parse({
      generatedAt: "2026-01-01T00:00:00Z",
      model: "claude-opus-5",
      version: 3,
      source: "model",
      domain: "some-future-generated-lens",
      pearls: [],
      concepts: [],
      themes: [],
      units: [],
      edges: [],
    });
    expect(parsed.domain).toBe("some-future-generated-lens");
  });
});

describe("LLMAnalysisClient — Phase 5 prompt assembly from the lens registry", () => {
  function spyCaller(responseText: string): { caller: StructuredLLMCaller; requests: StructuredLLMRequest[] } {
    const requests: StructuredLLMRequest[] = [];
    const caller: StructuredLLMCaller = {
      call: async (request: StructuredLLMRequest): Promise<StructuredCallResult> => {
        requests.push(request);
        return { kind: "ok", text: responseText };
      },
    };
    return { caller, requests };
  }

  beforeEach(() => {
    __resetLensRegistryCacheForTests();
  });

  it("runRouter's system prompt names every loaded lens, including clinical, by its routerDescription", async () => {
    const { caller, requests } = spyCaller(JSON.stringify({ domain: "clinical" }));
    const client = new LLMAnalysisClient(caller, "");
    const outcome = await client.runRouter("some transcript sample", "claude-opus-5");
    expect(outcome.kind).toBe("ok");
    if (outcome.kind === "ok") expect(outcome.data.domain).toBe("clinical");
    expect(requests).toHaveLength(1);
    expect(requests[0].system).toContain('"clinical"');
    expect(requests[0].system).toContain("pharmacology");
    expect(requests[0].jsonSchema).toEqual(
      expect.objectContaining({
        properties: expect.objectContaining({
          domain: expect.objectContaining({ enum: expect.arrayContaining(["biology", "clinical", "generic", "history", "music", "physical_skill"]) }),
        }),
      })
    );
  });

  it("runChunkV3's system prompt embeds the resolved lens's unitTypeEmphasis verbatim, for the clinical lens", async () => {
    const { caller, requests } = spyCaller(JSON.stringify({ pearls: [], units: [], edges: [] }));
    const client = new LLMAnalysisClient(caller, "");
    const chunk = { index: 0, startSec: 0, endSec: 10, text: "[0:00] give metoprolol 25mg PO" };
    const outcome = await client.runChunkV3(chunk, "clinical", "claude-opus-5");
    expect(outcome.kind).toBe("ok");
    expect(requests).toHaveLength(1);
    expect(requests[0].system).toContain("DOSAGE units for medication amounts/frequencies");
    expect(requests[0].system).toContain("safety-critical");
  });

  it("runChunkV3 falls back to the generic lens's unitTypeEmphasis for an unknown domain id", async () => {
    const { caller, requests } = spyCaller(JSON.stringify({ pearls: [], units: [], edges: [] }));
    const client = new LLMAnalysisClient(caller, "");
    const chunk = { index: 0, startSec: 0, endSec: 10, text: "[0:00] hello" };
    await client.runChunkV3(chunk, "totally-unknown-domain", "claude-opus-5");
    expect(requests[0].system).toContain("No specific domain lens applies");
  });

  it("a user-authored lens override changes the assembled prompt (registry precedence flows through to the real client)", async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-analysis-lens-override-"));
    try {
      await fs.mkdir(path.join(dataDir, "lenses"), { recursive: true });
      await fs.writeFile(
        path.join(dataDir, "lenses", "biology.json"),
        JSON.stringify({
          id: "biology",
          label: "Biology (user override)",
          routerDescription: "a completely user-authored router description",
          unitTypeEmphasis: "a completely user-authored unit-type emphasis paragraph",
          overlayFields: [],
          questionStyle: "default",
        })
      );
      const { caller, requests } = spyCaller(JSON.stringify({ pearls: [], units: [], edges: [] }));
      const client = new LLMAnalysisClient(caller, dataDir);
      const chunk = { index: 0, startSec: 0, endSec: 10, text: "[0:00] hello" };
      await client.runChunkV3(chunk, "biology", "claude-opus-5");
      expect(requests[0].system).toContain("a completely user-authored unit-type emphasis paragraph");
    } finally {
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  });

  // --- Phase 6 "Slide-text channel, smallest slice (PDF)" ------------------

  it("runChunkV3's system prompt folds in the slideContext block and the evidence instruction when a deck is attached", async () => {
    const { caller, requests } = spyCaller(JSON.stringify({ pearls: [], units: [], edges: [] }));
    const client = new LLMAnalysisClient(caller, "");
    const chunk = { index: 0, startSec: 0, endSec: 10, text: "[0:00] hello" };
    await client.runChunkV3(chunk, "generic", "claude-opus-5", "Slide deck text (pages 1–2): [Slide 1]\nHypertension overview");
    expect(requests).toHaveLength(1);
    expect(requests[0].system).toContain("Slide deck text (pages 1–2)");
    expect(requests[0].system).toContain("Hypertension overview");
    expect(requests[0].system).toContain('"evidence"');
    expect(requests[0].system).toContain('"slides"');
  });

  it("runChunkV3's system prompt still names 'evidence' as a required field even with no slide deck attached (default stays 'transcript')", async () => {
    const { caller, requests } = spyCaller(JSON.stringify({ pearls: [], units: [], edges: [] }));
    const client = new LLMAnalysisClient(caller, "");
    const chunk = { index: 0, startSec: 0, endSec: 10, text: "[0:00] hello" };
    await client.runChunkV3(chunk, "generic", "claude-opus-5");
    expect(requests[0].system).toContain('"evidence"');
    expect(requests[0].system).not.toContain("The learner also attached a slide deck");
    expect(requests[0].jsonSchema).toEqual(
      expect.objectContaining({
        properties: expect.objectContaining({
          units: expect.objectContaining({
            items: expect.objectContaining({
              required: expect.arrayContaining(["evidence"]),
            }),
          }),
        }),
      })
    );
  });
});
