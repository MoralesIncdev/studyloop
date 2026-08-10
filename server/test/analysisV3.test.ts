// V3-B B1 "Analysis v3 (typed extraction)" — the typed-spine pipeline layered
// on top of analysis.ts's existing chunk/merge machinery. Mirrors
// test/analysis.test.ts's structure (fake-client end-to-end, no live API
// calls) but exercises the new router gate, deterministic unit/edge merge,
// and the resulting version:3 analysis shape.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  dedupeNearDuplicateUnits,
  mergeUnitsByFingerprint,
  remapEdgeAliases,
  scrubOverlayToLens,
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
import { FakeLensGenerationClient, __resetLensRegistryCacheForTests, type LensGenerationLLMClient } from "../src/lib/lenses.js";
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

  // ANLZ-03 (02-04): empty-string and empty-overlay edge cases through
  // mergeOverlayFields' only exported caller — no edit to analysis.ts
  // accompanies this block (git-diff-gated in the plan's <verify>).
  it("ANLZ-03: a group whose only value for an array overlay key is a single empty string yields that key absent, not a lone empty-string array", () => {
    const merged = mergeUnitsByFingerprint([{ ...base, overlay: { entities: [""] } }]);
    expect(merged[0].overlay?.entities).toBeUndefined();
    expect(merged[0].overlay).toBeUndefined();
  });

  it("ANLZ-03: a group with a mix of empty and non-empty array entries keeps only the non-empty entries, in order, with no empty placeholder", () => {
    const merged = mergeUnitsByFingerprint([
      { ...base, overlay: { entities: ["", "mitochondria", "", "ribosome"] } },
    ]);
    expect(merged[0].overlay?.entities).toEqual(["mitochondria", "ribosome"]);
  });

  it("ANLZ-03: a whitespace-only scalar overlay value is dropped rather than persisted as blank", () => {
    const merged = mergeUnitsByFingerprint([{ ...base, overlay: { mechanismType: "   " } }]);
    expect(merged[0].overlay?.mechanismType).toBeUndefined();
    expect(merged[0].overlay).toBeUndefined();
  });

  it("ANLZ-03: a group whose every overlay value is empty (blank scalars and empty-string-only arrays) yields overlay === undefined, never an empty object", () => {
    const merged = mergeUnitsByFingerprint([
      { ...base, overlay: { mechanismType: "", sourceType: "  ", entities: [""], triggers: ["", ""] } },
      { ...base, overlay: { levelOfOrganization: "\t" } },
    ]);
    expect(merged[0].overlay).toBeUndefined();
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

describe("mergeUnitsByFingerprint — ANLZ-02 enrichment merging", () => {
  const base = { type: "CLAIM" as const, label: "Same Concept", summary: "s", body: "b", anchors: [], confidence: 0.5 };

  it("leaves enrichment undefined (not false) when no unit in the group set it", () => {
    const merged = mergeUnitsByFingerprint([{ ...base }]);
    expect(merged[0].enrichment).toBeUndefined();
  });

  it("is true if ANY unit in the fingerprint group was flagged enrichment — never averaged away", () => {
    const merged = mergeUnitsByFingerprint([{ ...base, enrichment: false }, { ...base, enrichment: true }]);
    expect(merged[0].enrichment).toBe(true);
  });

  it("stays undefined when every raw unit explicitly says false", () => {
    const merged = mergeUnitsByFingerprint([{ ...base, enrichment: false }, { ...base, enrichment: false }]);
    expect(merged[0].enrichment).toBeUndefined();
  });
});

describe("FakeAnalysisClient.runMergeV3 — ANLZ-02 pearl enrichment merge-dedupe", () => {
  const client = new FakeAnalysisClient();
  const base = { t: 10, label: "Same Pearl", insight: "insight text", importance: 2 as const, unitLabel: "Unit A" };

  it("keeps enrichment when the surviving (earlier-timestamp) pearl was flagged", async () => {
    const outcome = await client.runMergeV3([
      { ...base, t: 5, enrichment: true },
      { ...base, t: 20, enrichment: undefined },
    ]);
    expect(outcome.kind).toBe("ok");
    if (outcome.kind !== "ok") throw new Error("unreachable");
    expect(outcome.data.pearls).toHaveLength(1);
    expect(outcome.data.pearls[0].t).toBe(5);
    expect(outcome.data.pearls[0].enrichment).toBe(true);
  });

  it("ORs the flag onto the survivor when the dedupe drops a flagged duplicate in favor of an earlier unflagged one — the signal is never lost to timestamp ordering", async () => {
    const outcome = await client.runMergeV3([
      { ...base, t: 5, enrichment: undefined },
      { ...base, t: 20, enrichment: true },
    ]);
    expect(outcome.kind).toBe("ok");
    if (outcome.kind !== "ok") throw new Error("unreachable");
    expect(outcome.data.pearls).toHaveLength(1);
    expect(outcome.data.pearls[0].t).toBe(5);
    expect(outcome.data.pearls[0].enrichment).toBe(true);
  });

  it("leaves enrichment undefined (not false) when no duplicate in the group was flagged", async () => {
    const outcome = await client.runMergeV3([
      { ...base, t: 5, enrichment: undefined },
      { ...base, t: 20, enrichment: undefined },
    ]);
    expect(outcome.kind).toBe("ok");
    if (outcome.kind !== "ok") throw new Error("unreachable");
    expect(outcome.data.pearls[0].enrichment).toBeUndefined();
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

// --- Phase 04.1-03 Task 2: pearl timestamp correction + per-run telemetry ----
// GitNexus impact (upstream, run before this call-site edit — repo CLAUDE.md
// MUST rule): runAnalysisJobV3 has 2 direct callers (routes/analyze.ts's
// analyzeRoutes; analysisV3.test.ts itself) plus 04.1-01's own
// anchorFidelity.test.ts (added this same phase) — LOW risk, unchanged from
// 04.1-01-SUMMARY.md's original reading except for that one new test-file
// caller 04.1-01 itself introduced (expected, not a surprise). resolvePearlUnitId
// is consumed as-is (not modified) by this task, so no separate impact check
// applied to it.

describe("runAnalysisJobV3 — Phase 04.1-03 Task 2: pearl correction + anchor-correction telemetry", () => {
  function driftedClient(pearlT: number, unitLabel = "Neuron signal transmission"): AnalysisLLMClientV3 {
    return {
      runRouter: async () => ({ kind: "ok", data: { domain: "generic" } }),
      runChunkV3: async () => ({
        kind: "ok",
        data: {
          pearls: [],
          units: [
            {
              type: "CLAIM",
              label: unitLabel,
              summary: "Neurons transmit signals across synapses.",
              body: "Neurons transmit electrical signals across synapses.",
              // Deliberately drifted (far outside the 5s-long single segment
              // below) — the corrector should snap this to 0.
              anchors: [{ t: 999, quote: "Neurons transmit signals." }],
              confidence: 0.9,
            },
          ],
          edges: [],
        },
      }),
      runMergeV3: async () => ({
        kind: "ok",
        data: {
          pearls: [{ t: pearlT, label: "Key pearl", insight: "A pearl insight.", importance: 2, unitLabel }],
          themes: [],
        },
      }),
    };
  }

  function singleSegment(): TranscriptSegment[] {
    return [segment(0, 5, "Neurons transmit signals.")];
  }

  function warnMessages(spy: { mock: { calls: unknown[][] } }): string[] {
    return spy.mock.calls.map((args) => String(args[0])).filter((msg) => msg.startsWith("[analysis] anchor-correction"));
  }

  it("moves an out-of-range pearl to its linked unit's earliest CORRECTED anchor time", async () => {
    const analysis = await runAnalysisJobV3({ segments: singleSegment(), model: "claude-opus-5", client: driftedClient(5000) });

    const unit = analysis.units!.find((u) => u.label === "Neuron signal transmission")!;
    expect(unit.anchors[0].t).toBe(0); // corrected first

    const pearl = analysis.pearls.find((p) => p.label === "Key pearl")!;
    expect(pearl.t).toBe(0); // moved to the unit's CORRECTED anchor, not its stale claimed one
    expect(pearl.unitId).toBe(unit.id);
  });

  it("leaves an out-of-range pearl with no usable unit link untouched — never invents or clamps a position", async () => {
    // unitLabel "" resolves to no unit at all (resolvePearlUnitId's own
    // empty-string sentinel).
    const analysis = await runAnalysisJobV3({ segments: singleSegment(), model: "claude-opus-5", client: driftedClient(5000, "") });

    const pearl = analysis.pearls.find((p) => p.label === "Key pearl")!;
    expect(pearl.t).toBe(5000); // untouched, not clamped to the transcript end
    expect(pearl.unitId).toBeUndefined();
  });

  it("emits a single greppable summary line plus one detail line per unit correction, with all four counts", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      await runAnalysisJobV3({ segments: singleSegment(), model: "claude-opus-5", client: driftedClient(5000) });

      const messages = warnMessages(warnSpy);
      expect(messages).toHaveLength(2);
      expect(messages[0]).toBe("[analysis] anchor-correction: units=1 safetyTier=0 pearls=1 unresolved=0");
      expect(messages[1]).toContain("unit=neuron-signal-transmission");
      expect(messages[1]).toContain("type=CLAIM");
      expect(messages[1]).toContain("before=999");
      expect(messages[1]).toContain("after=0");
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("emits no correction log output when a run corrects nothing", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const cleanClient: AnalysisLLMClientV3 = {
        runRouter: async () => ({ kind: "ok", data: { domain: "generic" } }),
        runChunkV3: async () => ({
          kind: "ok",
          data: {
            pearls: [],
            units: [
              {
                type: "CLAIM",
                label: "Already correct unit",
                summary: "s",
                body: "b",
                anchors: [{ t: 0, quote: "Neurons transmit signals." }],
                confidence: 0.9,
              },
            ],
            edges: [],
          },
        }),
        runMergeV3: async () => ({ kind: "ok", data: { pearls: [{ t: 2, label: "In-range pearl", insight: "i", importance: 1, unitLabel: "" }], themes: [] } }),
      };
      await runAnalysisJobV3({ segments: singleSegment(), model: "claude-opus-5", client: cleanClient });

      expect(warnMessages(warnSpy)).toEqual([]);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("counts a safety-tier (DOSAGE) unit correction separately from an ordinary one in the summary line", async () => {
    const dosageClient: AnalysisLLMClientV3 = {
      runRouter: async () => ({ kind: "ok", data: { domain: "generic" } }),
      runChunkV3: async () => ({
        kind: "ok",
        data: {
          pearls: [],
          units: [
            {
              type: "DOSAGE",
              label: "Dosage unit",
              summary: "s",
              body: "b",
              anchors: [{ t: 999, quote: "Neurons transmit signals." }],
              confidence: 0.9,
            },
          ],
          edges: [],
        },
      }),
      runMergeV3: async () => ({ kind: "ok", data: { pearls: [], themes: [] } }),
    };
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      await runAnalysisJobV3({ segments: singleSegment(), model: "claude-opus-5", client: dosageClient });
      const messages = warnMessages(warnSpy);
      expect(messages[0]).toBe("[analysis] anchor-correction: units=1 safetyTier=1 pearls=0 unresolved=0");
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("AnalysisSchema is unchanged by pearl correction — no new field, existing round-trip tests untouched", async () => {
    const analysis = await runAnalysisJobV3({ segments: singleSegment(), model: "claude-opus-5", client: driftedClient(5000) });
    const parsed = AnalysisSchema.parse(analysis);
    expect(parsed.pearls.find((p) => p.label === "Key pearl")!.t).toBe(0);
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

  it("ANLZ-02: a fake-mode-flagged unit's enrichment flag reaches the returned analysis and round-trips through AnalysisSchema", async () => {
    const segments: TranscriptSegment[] = [];
    for (let t = 0; t < 1000; t += 5) segments.push(segment(t, t + 5, `text at ${t}`));

    const analysis = await runAnalysisJobV3({ segments, model: "claude-opus-5", client: new FakeAnalysisClient() });

    // Fake mode deterministically flags every 4th chunk's primary unit (see runChunkV3).
    expect(analysis.units!.some((u) => u.enrichment === true)).toBe(true);
    expect(analysis.units!.some((u) => u.enrichment === undefined)).toBe(true);

    const parsed = AnalysisSchema.parse(analysis);
    expect(parsed.units!.some((u) => u.enrichment === true)).toBe(true);
  });

  it("ANLZ-02: a fake-mode-flagged pearl's enrichment flag reaches the returned analysis and round-trips through AnalysisSchema, with unitId resolution unaffected", async () => {
    const segments: TranscriptSegment[] = [];
    for (let t = 0; t < 1000; t += 5) segments.push(segment(t, t + 5, `text at ${t}`));

    const analysis = await runAnalysisJobV3({ segments, model: "claude-opus-5", client: new FakeAnalysisClient() });

    // Fake mode deterministically flags every 4th chunk's primary pearl (same cadence as the primary unit).
    expect(analysis.pearls.some((p) => p.enrichment === true)).toBe(true);
    expect(analysis.pearls.some((p) => p.enrichment === undefined)).toBe(true);
    // resolvePearlUnitId / the unitId alias remap is unchanged by the addition.
    expect(analysis.pearls.some((p) => p.unitId)).toBe(true);

    const parsed = AnalysisSchema.parse(analysis);
    expect(parsed.pearls.some((p) => p.enrichment === true)).toBe(true);
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

// --- Phase 9 "Lens autogeneration for unknown subjects" ---------------------
// (design/EXECUTION-PLAN-post-review-v1.md).

describe("FakeAnalysisClient.runRouter — Phase 9 none-fits trigger", () => {
  it("a recognizable fake-subject marker in the sample text triggers noneFit + the parsed subject label, without a real LLM", async () => {
    const client = new FakeAnalysisClient();
    const outcome = await client.runRouter(`some lecture text ${FakeAnalysisClient.FAKE_UNKNOWN_SUBJECT_TRIGGER}astrology`, "claude-opus-5");
    expect(outcome.kind).toBe("ok");
    if (outcome.kind === "ok") {
      expect(outcome.data.noneFit).toBe(true);
      expect(outcome.data.subject).toBe("astrology");
    }
  });

  it("ordinary sample text (no trigger) never sets noneFit", async () => {
    const client = new FakeAnalysisClient();
    const outcome = await client.runRouter("posture control passing the guard", "claude-opus-5");
    expect(outcome.kind).toBe("ok");
    if (outcome.kind === "ok") expect(outcome.data.noneFit).toBeFalsy();
  });
});

describe("runAnalysisJobV3 — Phase 9 lens autogeneration wiring", () => {
  let dataDir: string;

  beforeEach(async () => {
    __resetLensRegistryCacheForTests();
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-analysis-lens-gen-"));
  });

  afterEach(async () => {
    __resetLensRegistryCacheForTests();
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  /** A router double that always reports noneFit — reuses FakeAnalysisClient for the chunk/merge calls (same "flaky"-style delegation pattern as the router-skip test above). */
  function routerNoneFits(subject: string, fallbackDomain: string = "generic"): AnalysisLLMClientV3 {
    const fake = new FakeAnalysisClient();
    return {
      runRouter: async () => ({ kind: "ok", data: { domain: fallbackDomain, noneFit: true, subject } }),
      runChunkV3: (chunk, domain) => fake.runChunkV3(chunk, domain, "claude-opus-5"),
      runMergeV3: (pearls) => fake.runMergeV3(pearls, "claude-opus-5"),
    };
  }

  it("round-trip with the fake: router none-fits + a generation client produces a new lens and routes THIS run to it, calling generation exactly once", async () => {
    const segments = [segment(0, 10, "some lecture text")];
    let calls = 0;
    const countingClient: LensGenerationLLMClient = {
      generateLensMeta: async (subject, model) => {
        calls++;
        return new FakeLensGenerationClient().generateLensMeta(subject, model);
      },
    };
    const analysis = await runAnalysisJobV3({
      segments,
      model: "claude-opus-5",
      client: routerNoneFits("astrology"),
      dataDir,
      lensGenerationClient: countingClient,
    });
    expect(analysis.domain).toBe("astrology");
    expect(calls).toBe(1);
    const onDisk = JSON.parse(await fs.readFile(path.join(dataDir, "lenses", "astrology.json"), "utf8"));
    expect(onDisk.origin).toBe("generated");
  });

  it("no lens-generation client available: falls back to 'generic', NOT the router's own best-guess domain", async () => {
    const segments = [segment(0, 10, "some lecture text")];
    const analysis = await runAnalysisJobV3({
      segments,
      model: "claude-opus-5",
      client: routerNoneFits("astrology", "biology"),
      dataDir,
      // lensGenerationClient intentionally omitted — must not fall back to "biology".
    });
    expect(analysis.domain).toBe("generic");
  });

  it("generation call fails (LLM refusal): falls back to 'generic' and the analyze run still succeeds (never fails because generation failed)", async () => {
    const segments = [segment(0, 10, "some lecture text")];
    const flaky: LensGenerationLLMClient = {
      generateLensMeta: async () => ({ kind: "skipped", reason: "refusal", detail: "declined" }),
    };
    const analysis = await runAnalysisJobV3({
      segments,
      model: "claude-opus-5",
      client: routerNoneFits("astrology"),
      dataDir,
      lensGenerationClient: flaky,
    });
    expect(analysis.domain).toBe("generic");
    expect(analysis.version).toBe(3);
  });

  it("noneFit true but an empty subject label never even calls the generation client", async () => {
    const segments = [segment(0, 10, "some lecture text")];
    let calls = 0;
    const counting: LensGenerationLLMClient = {
      generateLensMeta: async (subject, model) => {
        calls++;
        return new FakeLensGenerationClient().generateLensMeta(subject, model);
      },
    };
    const analysis = await runAnalysisJobV3({
      segments,
      model: "claude-opus-5",
      client: routerNoneFits(""),
      dataDir,
      lensGenerationClient: counting,
    });
    expect(analysis.domain).toBe("generic");
    expect(calls).toBe(0);
  });

  it("noneFit false (an ordinary router result) never touches lens generation at all — at most one attempt per run means zero when none is needed", async () => {
    const segments = [segment(0, 10, "some lecture text")];
    let calls = 0;
    const counting: LensGenerationLLMClient = {
      generateLensMeta: async (subject, model) => {
        calls++;
        return new FakeLensGenerationClient().generateLensMeta(subject, model);
      },
    };
    const analysis = await runAnalysisJobV3({
      segments,
      model: "claude-opus-5",
      client: new FakeAnalysisClient(),
      dataDir,
      lensGenerationClient: counting,
    });
    expect(calls).toBe(0);
    expect(["biology", "history", "music", "physical_skill", "generic"]).toContain(analysis.domain);
  });
});

// --- 2026-08-08 real-lecture-proof fixes: near-duplicate collapse + overlay scrub ---

function finalUnit(id: string, overrides: Partial<AnalysisUnit> = {}): AnalysisUnit {
  return {
    id,
    type: "DOSAGE",
    label: id,
    summary: "summary",
    body: "body",
    anchors: [{ t: 449, quote: "q" }],
    confidence: 0.8,
    threshold: false,
    ...overrides,
  };
}

describe("dedupeNearDuplicateUnits", () => {
  it("collapses same-type units sharing an anchor when one label token set is a proper subset of the other", () => {
    // The observed real-lecture pair: same DOSAGE fact, two label variants, same anchor t=449.
    const { units, aliases } = dedupeNearDuplicateUnits([
      finalUnit("tidal-volume-setting-in-ac-mode", { summary: "longer summary text", body: "the longer body wins" }),
      finalUnit("tidal-volume-in-ac-mode", { anchors: [{ t: 449, quote: "q" }, { t: 461, quote: "q2" }], threshold: true }),
    ]);
    expect(units).toHaveLength(1);
    expect(units[0].id).toBe("tidal-volume-setting-in-ac-mode");
    expect(aliases.get("tidal-volume-in-ac-mode")).toBe("tidal-volume-setting-in-ac-mode");
    // Absorbed unit contributes its anchors and threshold flag.
    expect(units[0].anchors.map((a) => a.t)).toEqual([449, 461]);
    expect(units[0].threshold).toBe(true);
    expect(units[0].body).toBe("the longer body wins");
  });

  it("keeps units apart when neither label token set contains the other, even with a shared anchor", () => {
    // The observed MECHANISM neighbors that must NOT merge.
    const { units, aliases } = dedupeNearDuplicateUnits([
      finalUnit("patient-triggering-via-negative-pressure", { type: "MECHANISM", anchors: [{ t: 432, quote: "q" }] }),
      finalUnit("ac-mode-trigger-and-volume-delivery", { type: "MECHANISM", anchors: [{ t: 432, quote: "q" }] }),
    ]);
    expect(units).toHaveLength(2);
    expect(aliases.size).toBe(0);
  });

  it("keeps units apart across different types or disjoint anchors", () => {
    const differentType = dedupeNearDuplicateUnits([
      finalUnit("tidal-volume-in-ac-mode", { type: "CLAIM" }),
      finalUnit("tidal-volume-setting-in-ac-mode"),
    ]);
    expect(differentType.units).toHaveLength(2);

    const disjointAnchors = dedupeNearDuplicateUnits([
      finalUnit("tidal-volume-in-ac-mode", { anchors: [{ t: 100, quote: "a" }] }),
      finalUnit("tidal-volume-setting-in-ac-mode", { anchors: [{ t: 200, quote: "b" }] }),
    ]);
    expect(disjointAnchors.units).toHaveLength(2);
  });

  // ANLZ-02: enrichment propagates through the collapse the same way threshold does (D-01 — the match predicate itself never changes).
  it("carries enrichment true onto the survivor when only the ABSORBED unit was flagged", () => {
    const { units } = dedupeNearDuplicateUnits([
      finalUnit("tidal-volume-setting-in-ac-mode"),
      finalUnit("tidal-volume-in-ac-mode", { enrichment: true }),
    ]);
    expect(units).toHaveLength(1);
    expect(units[0].enrichment).toBe(true);
  });

  it("carries enrichment true onto the survivor when only the SURVIVOR unit was flagged", () => {
    const { units } = dedupeNearDuplicateUnits([
      finalUnit("tidal-volume-setting-in-ac-mode", { enrichment: true }),
      finalUnit("tidal-volume-in-ac-mode"),
    ]);
    expect(units).toHaveLength(1);
    expect(units[0].enrichment).toBe(true);
  });

  it("leaves enrichment undefined when neither unit in the collapsed pair was flagged", () => {
    const { units } = dedupeNearDuplicateUnits([
      finalUnit("tidal-volume-setting-in-ac-mode"),
      finalUnit("tidal-volume-in-ac-mode"),
    ]);
    expect(units).toHaveLength(1);
    expect(units[0].enrichment).toBeUndefined();
  });

  it("the collapse decision itself is unaffected by enrichment — two units differing ONLY in enrichment still collapse (D-01: enrichment is passenger data)", () => {
    const flagged = dedupeNearDuplicateUnits([
      finalUnit("tidal-volume-setting-in-ac-mode", { enrichment: true }),
      finalUnit("tidal-volume-in-ac-mode", { enrichment: false }),
    ]);
    expect(flagged.units).toHaveLength(1);

    const distinctNeighbors = dedupeNearDuplicateUnits([
      finalUnit("patient-triggering-via-negative-pressure", { type: "MECHANISM", anchors: [{ t: 432, quote: "q" }], enrichment: true }),
      finalUnit("ac-mode-trigger-and-volume-delivery", { type: "MECHANISM", anchors: [{ t: 432, quote: "q" }], enrichment: true }),
    ]);
    expect(distinctNeighbors.units).toHaveLength(2);
  });

  // D-01 (LOCKED, 02-CONTEXT.md): these cases pin the ALREADY-SHIPPED collapse
  // semantics as regression tests — they document why the behavior is
  // correct, not a new implementation. No edit to analysis.ts accompanies
  // this block (git-diff-gated in the plan's <verify>).
  describe("D-01: value-preservation on collapse — the merge is a union, never an average or truncation", () => {
    it("preserves both distinct anchor timestamps and both quotes verbatim, sorted with no duplicates", () => {
      // Units must share at least one anchor t to trigger the collapse at
      // all — the shared t=449 is the trigger; t=461 and t=700 are each
      // unique to one side and must both survive the union untouched.
      const { units } = dedupeNearDuplicateUnits([
        finalUnit("tidal-volume-setting-in-ac-mode", {
          anchors: [
            { t: 449, quote: "tidal volume is 500 mL in AC mode" },
            { t: 700, quote: "reassessed at 700s, still 500 mL" },
          ],
        }),
        finalUnit("tidal-volume-in-ac-mode", { anchors: [{ t: 449, quote: "q" }, { t: 461, quote: "set tidal volume to 500 mL" }] }),
      ]);
      expect(units).toHaveLength(1);
      expect(units[0].anchors).toEqual([
        { t: 449, quote: "tidal volume is 500 mL in AC mode" },
        { t: 461, quote: "set tidal volume to 500 mL" },
        { t: 700, quote: "reassessed at 700s, still 500 mL" },
      ]);
    });

    it("confidence on the survivor is the MAXIMUM of the pair, never the mean", () => {
      const { units } = dedupeNearDuplicateUnits([
        finalUnit("tidal-volume-setting-in-ac-mode", { confidence: 0.4 }),
        finalUnit("tidal-volume-in-ac-mode", { confidence: 0.95 }),
      ]);
      expect(units[0].confidence).toBe(0.95);
      // Explicitly not the mean (0.675) — a high-confidence safety fact must
      // never be dragged down by a low-confidence re-emission.
      expect(units[0].confidence).not.toBeCloseTo(0.675);
    });

    it("the longer summary and the longer body win INDEPENDENTLY, even split across different units in the pair", () => {
      const { units } = dedupeNearDuplicateUnits([
        finalUnit("tidal-volume-setting-in-ac-mode", {
          summary: "short summary",
          body: "a much longer body with the full clinical reasoning attached",
        }),
        finalUnit("tidal-volume-in-ac-mode", {
          summary: "a much longer, more complete summary of the same fact",
          body: "short body",
        }),
      ]);
      expect(units[0].summary).toBe("a much longer, more complete summary of the same fact");
      expect(units[0].body).toBe("a much longer body with the full clinical reasoning attached");
    });

    it("when both units carry a quote at the SAME timestamp, the first-seen (survivor's) quote is kept — pinning shipped behavior, not changing it", () => {
      const { units } = dedupeNearDuplicateUnits([
        finalUnit("tidal-volume-setting-in-ac-mode", { anchors: [{ t: 449, quote: "survivor's quote" }] }),
        finalUnit("tidal-volume-in-ac-mode", { anchors: [{ t: 449, quote: "absorbed unit's different quote" }] }),
      ]);
      expect(units).toHaveLength(1);
      expect(units[0].anchors).toEqual([{ t: 449, quote: "survivor's quote" }]);
    });
  });

  // D-01/D-02 (LOCKED, 02-CONTEXT.md): the four-type sweep proving the same
  // collapse guard holds for every safety-tier type, data-driven so a fifth
  // type is a one-line addition rather than four copied blocks.
  describe("D-01/D-02: the four safety-tier types collapse identical twins and never merge distinct facts", () => {
    const SAFETY_TIER_TYPES = ["DOSAGE", "CONTRAINDICATION", "LAB_VALUE", "PRIORITIZATION"] as const;

    it.each(SAFETY_TIER_TYPES)("%s: two DISTINCT facts sharing an anchor timestamp, whose labels are not in a subset relation, stay as two units with an empty alias map", (type) => {
      // Realistic clinical pairs that share an anchor only because the
      // lecturer said them in the same breath — a different drug, or a
      // dosage versus a lab range, must never fold into one card.
      const pair: Record<(typeof SAFETY_TIER_TYPES)[number], [string, string]> = {
        DOSAGE: ["metoprolol-25mg-po-bid", "furosemide-40mg-iv-daily"],
        CONTRAINDICATION: ["hold-metoprolol-if-hr-below-60", "hold-warfarin-if-inr-above-4"],
        LAB_VALUE: ["potassium-normal-range-3-5-to-5", "sodium-normal-range-135-to-145"],
        PRIORITIZATION: ["assess-airway-before-breathing", "reassess-vitals-before-medicating"],
      };
      const [labelA, labelB] = pair[type];
      const { units, aliases } = dedupeNearDuplicateUnits([
        finalUnit(labelA, { type, anchors: [{ t: 449, quote: "distinct fact a" }] }),
        finalUnit(labelB, { type, anchors: [{ t: 449, quote: "distinct fact b" }] }),
      ]);
      expect(units).toHaveLength(2);
      expect(aliases.size).toBe(0);
    });

    it.each(SAFETY_TIER_TYPES)("%s: an identical twin pair (shared anchor, proper-subset labels) still collapses to one — the tier does not exempt itself from same-fact collapse", (type) => {
      const { units, aliases } = dedupeNearDuplicateUnits([
        finalUnit("tidal-volume-setting-in-ac-mode", { type, anchors: [{ t: 449, quote: "q" }] }),
        finalUnit("tidal-volume-in-ac-mode", { type, anchors: [{ t: 449, quote: "q" }] }),
      ]);
      expect(units).toHaveLength(1);
      expect(aliases.get("tidal-volume-in-ac-mode")).toBe("tidal-volume-setting-in-ac-mode");
    });
  });
});

describe("remapEdgeAliases", () => {
  const edge = (source: string, target: string) => ({
    source,
    target,
    type: "PART_OF" as const,
    quote: "q",
    confidence: 0.9,
  });

  it("rewrites endpoints through the alias map, dropping self-loops and duplicates the collapse creates", () => {
    const aliases = new Map([["tidal-volume-in-ac-mode", "tidal-volume-setting-in-ac-mode"]]);
    const remapped = remapEdgeAliases(
      [
        edge("tidal-volume-in-ac-mode", "ac-mode"),
        edge("tidal-volume-setting-in-ac-mode", "ac-mode"), // duplicate after remap
        edge("tidal-volume-in-ac-mode", "tidal-volume-setting-in-ac-mode"), // self-loop after remap
      ],
      aliases
    );
    expect(remapped).toEqual([edge("tidal-volume-setting-in-ac-mode", "ac-mode")]);
  });

  it("returns edges unchanged when there are no aliases", () => {
    const edges = [edge("a", "b")];
    expect(remapEdgeAliases(edges, new Map())).toEqual(edges);
  });
});

describe("scrubOverlayToLens", () => {
  it("keeps only the lens's declared overlay keys and collapses an emptied overlay to undefined", () => {
    const clinicalKeys = new Set(["drugClass", "genericName", "brandName", "route", "normalRange", "nclexCategory"]);
    const scrubbed = scrubOverlayToLens(
      [
        finalUnit("with-stray-fields", { overlay: { drugClass: "beta blocker", triggers: ["stray"], keyContext: "stray" } }),
        finalUnit("only-stray-fields", { overlay: { entities: ["stray"] } }),
        finalUnit("no-overlay"),
      ],
      clinicalKeys
    );
    expect(scrubbed[0].overlay).toEqual({ drugClass: "beta blocker" });
    expect(scrubbed[1].overlay).toBeUndefined();
    expect(scrubbed[2].overlay).toBeUndefined();
  });

  // ANLZ-03 (02-04): edge coverage for the zero-declared-keys lens case and
  // the no-overlay-at-all passthrough — no edit to analysis.ts accompanies
  // this block (git-diff-gated in the plan's <verify>).
  it("ANLZ-03: an EMPTY declared-key set collapses every unit's overlay to undefined (the zero-overlayFields lens case)", () => {
    const scrubbed = scrubOverlayToLens(
      [finalUnit("a", { overlay: { drugClass: "beta blocker", entities: ["x"] } })],
      new Set()
    );
    expect(scrubbed[0].overlay).toBeUndefined();
  });

  it("ANLZ-03: a unit with no overlay at all is left untouched — no overlay key is introduced", () => {
    const input = finalUnit("no-overlay");
    expect(input.overlay).toBeUndefined();
    expect("overlay" in input).toBe(false); // finalUnit() never sets the key when no override supplies it
    const scrubbed = scrubOverlayToLens([input], new Set(["drugClass"]));
    expect(scrubbed[0]).toBe(input); // early-return path: same reference, nothing spread in
    expect("overlay" in scrubbed[0]).toBe(false);
  });

  it("ANLZ-03: the merge-then-scrub composition mirrors runAnalysisJobV3's production path — no empty-string entry and no undeclared key survives to a serialized unit", () => {
    const clinicalKeys = new Set(["drugClass", "genericName", "brandName", "route", "normalRange", "nclexCategory"]);
    const fingerprintUnits = mergeUnitsByFingerprint([
      {
        type: "DOSAGE",
        label: "metoprolol dosing",
        summary: "s",
        body: "b",
        anchors: [{ t: 100, quote: "q" }],
        confidence: 0.9,
        overlay: {
          drugClass: "beta blocker",
          entities: ["", "off-lens-value"], // off-lens key AND an in-array empty string
          keyContext: "stray, undeclared for this lens",
          route: "   ", // whitespace-only — must not survive as blank
        },
      },
    ]);
    const scrubbed = scrubOverlayToLens(fingerprintUnits, clinicalKeys);

    const serialized = JSON.stringify(scrubbed);
    expect(serialized).not.toContain('""'); // no empty-string entry anywhere, array or scalar
    expect(scrubbed[0].overlay).toEqual({ drugClass: "beta blocker" });
    for (const key of Object.keys(scrubbed[0].overlay ?? {})) {
      expect(clinicalKeys.has(key)).toBe(true);
    }
  });
});
