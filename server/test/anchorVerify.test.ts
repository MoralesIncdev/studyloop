import { describe, expect, it } from "vitest";
import {
  buildCaptionIndex,
  DEFAULT_TOLERANCE_SEC,
  parseAnalysisInput,
  parseCaptionsFile,
  verifyAnchors,
  type AnchorVerifyReport,
} from "../src/lib/anchorVerify.js";
import type { Analysis, AnalysisEdge, AnalysisUnit, Pearl, UnitAnchor } from "../src/lib/analysis.js";
import type { TranscriptSegmentInput } from "../src/lib/models.js";

// --- Factory helpers (TESTING.md convention: small factories at top of file) -

function segment(start: number, end: number, text: string): TranscriptSegmentInput {
  return { start, end, text };
}

function unitAnchor(t: number, quote: string): UnitAnchor {
  return { t, quote };
}

function unit(overrides: Partial<AnalysisUnit> = {}): AnalysisUnit {
  return {
    id: "u1",
    type: "CLAIM",
    label: "Test unit",
    summary: "summary",
    body: "body",
    anchors: [],
    confidence: 0.8,
    threshold: false,
    ...overrides,
  };
}

function edge(overrides: Partial<AnalysisEdge> = {}): AnalysisEdge {
  return {
    source: "u1",
    target: "u2",
    type: "REQUIRES",
    quote: "quote text",
    confidence: 0.8,
    ...overrides,
  };
}

function pearl(overrides: Partial<Pearl> = {}): Pearl {
  return {
    t: 0,
    label: "pearl label",
    insight: "insight text",
    importance: 2,
    ...overrides,
  };
}

function analysis(overrides: Partial<Analysis> = {}): Analysis {
  return {
    generatedAt: "2026-01-01T00:00:00.000Z",
    model: "test-model",
    version: 3,
    source: "model",
    pearls: [],
    concepts: [],
    themes: [],
    units: [],
    edges: [],
    ...overrides,
  };
}

// --- Unit anchor classification ---------------------------------------------

describe("verifyAnchors — unit anchors", () => {
  it("classifies an anchor as exact when the quote is a character-for-character substring at a segment starting within tolerance", () => {
    const segments = [segment(0, 5, "Hello world"), segment(5, 10, "this is a test")];
    const index = buildCaptionIndex(segments);
    const a = analysis({ units: [unit({ anchors: [unitAnchor(1, "Hello world")] })] });

    const report = verifyAnchors(a, index);

    expect(report.violations).toEqual([]);
    expect(report.results.exact).toBe(1);
    expect(report.results.normalized).toBe(0);
  });

  it("classifies an anchor as normalized (not exact) when the quote matches only after collapsing whitespace and case", () => {
    const segments = [segment(0, 5, "Hello    World")];
    const index = buildCaptionIndex(segments);
    const a = analysis({ units: [unit({ anchors: [unitAnchor(0, "hello world")] })] });

    const report = verifyAnchors(a, index);

    expect(report.violations).toEqual([]);
    expect(report.results.exact).toBe(0);
    expect(report.results.normalized).toBe(1);
  });

  it("flags a quote that appears nowhere in the caption stream as a violation with reason quote-not-found, carrying unit id, t, and quote", () => {
    const segments = [segment(0, 5, "Hello world")];
    const index = buildCaptionIndex(segments);
    const a = analysis({ units: [unit({ id: "u-missing", anchors: [unitAnchor(2, "nonexistent phrase")] })] });

    const report = verifyAnchors(a, index);

    expect(report.violations).toEqual([
      { kind: "unit", id: "u-missing", t: 2, quote: "nonexistent phrase", reason: "quote-not-found" },
    ]);
  });

  it("flags a matched quote whose owning segment starts more than tolerance away as time-drift, carrying anchor t and matched segment start", () => {
    const segments = [segment(0, 5, "Hello world")];
    const index = buildCaptionIndex(segments);
    const a = analysis({ units: [unit({ id: "u-drift", anchors: [unitAnchor(100, "Hello world")] })] });

    const report = verifyAnchors(a, index);

    expect(report.violations).toEqual([
      { kind: "unit", id: "u-drift", t: 100, quote: "Hello world", reason: "time-drift", matchedSegmentStart: 0 },
    ]);
  });

  it("picks an occurrence within tolerance over a closer-in-text but out-of-tolerance occurrence when the quote repeats", () => {
    const segments = [segment(0, 5, "repeat phrase"), segment(1000, 1005, "repeat phrase")];
    const index = buildCaptionIndex(segments);
    // anchor t=1002 is within tolerance of the SECOND occurrence (start 1000), not the first (start 0)
    const a = analysis({ units: [unit({ anchors: [unitAnchor(1002, "repeat phrase")] })] });

    const report = verifyAnchors(a, index);

    expect(report.violations).toEqual([]);
    expect(report.results.exact).toBe(1);
  });
});

// --- Edge quotes (no timestamp) ----------------------------------------------

describe("verifyAnchors — edge quotes", () => {
  it("checks an edge quote with no time component — an exact match anywhere in the caption stream passes regardless of edge position", () => {
    const segments = [segment(1000, 1005, "Hello world")];
    const index = buildCaptionIndex(segments);
    const a = analysis({ edges: [edge({ quote: "Hello world" })] });

    const report = verifyAnchors(a, index);

    expect(report.violations).toEqual([]);
    expect(report.results.exact).toBe(1);
  });

  it("flags a missing edge quote as a violation identified by the edge's source and target", () => {
    const segments = [segment(0, 5, "Hello world")];
    const index = buildCaptionIndex(segments);
    const a = analysis({ edges: [edge({ source: "a", target: "b", quote: "nothing here" })] });

    const report = verifyAnchors(a, index);

    expect(report.violations).toEqual([{ kind: "edge", id: "a->b", quote: "nothing here", reason: "quote-not-found" }]);
  });

  it("classifies an edge quote as normalized when it matches only after whitespace/case normalization", () => {
    const segments = [segment(0, 5, "Hello    World")];
    const index = buildCaptionIndex(segments);
    const a = analysis({ edges: [edge({ quote: "hello world" })] });

    const report = verifyAnchors(a, index);

    expect(report.violations).toEqual([]);
    expect(report.results.normalized).toBe(1);
  });
});

// --- Pearl timestamps (no quote) ---------------------------------------------

describe("verifyAnchors — pearl timestamps", () => {
  it("flags a pearl timestamp beyond the last caption segment's end as timestamp-out-of-range", () => {
    const segments = [segment(0, 5, "Hello world")];
    const index = buildCaptionIndex(segments);
    const a = analysis({ pearls: [pearl({ t: 100, label: "late pearl" })] });

    const report = verifyAnchors(a, index);

    expect(report.violations).toEqual([{ kind: "pearl", id: "late pearl", t: 100, reason: "timestamp-out-of-range" }]);
  });

  it("passes a pearl timestamp within the caption range", () => {
    const segments = [segment(0, 5, "Hello world")];
    const index = buildCaptionIndex(segments);
    const a = analysis({ pearls: [pearl({ t: 3, label: "early pearl" })] });

    const report = verifyAnchors(a, index);

    expect(report.violations).toEqual([]);
  });

  it("passes a pearl timestamp exactly at the last segment's end (not beyond it)", () => {
    const segments = [segment(0, 5, "Hello world")];
    const index = buildCaptionIndex(segments);
    const a = analysis({ pearls: [pearl({ t: 5, label: "boundary pearl" })] });

    const report = verifyAnchors(a, index);

    expect(report.violations).toEqual([]);
  });
});

// --- Tolerance parameter ------------------------------------------------------

describe("verifyAnchors — tolerance parameter", () => {
  it("defaults to a fifteen-second tolerance when none is provided", () => {
    expect(DEFAULT_TOLERANCE_SEC).toBe(15);
    const report = verifyAnchors(analysis(), buildCaptionIndex([]));
    expect(report.toleranceSec).toBe(15);
  });

  it("respects a tighter custom tolerance, turning a previously-passing drift into a violation", () => {
    const segments = [segment(0, 5, "Hello world")];
    const index = buildCaptionIndex(segments);
    const a = analysis({ units: [unit({ anchors: [unitAnchor(10, "Hello world")] })] });

    const withDefault = verifyAnchors(a, index);
    expect(withDefault.violations).toEqual([]);

    const withTightTolerance = verifyAnchors(a, index, { toleranceSec: 5 });
    expect(withTightTolerance.violations).toHaveLength(1);
    expect(withTightTolerance.violations[0].reason).toBe("time-drift");
    expect(withTightTolerance.toleranceSec).toBe(5);
  });
});

// --- Empty-input edge cases ----------------------------------------------------

describe("verifyAnchors — empty inputs", () => {
  it("returns zero checked and zero violations for an analysis with no units, edges, or pearls, rather than throwing", () => {
    const segments = [segment(0, 5, "Hello world")];
    const index = buildCaptionIndex(segments);

    const report = verifyAnchors(analysis({ units: [], edges: [], pearls: [] }), index);

    expect(report.totals.checked).toBe(0);
    expect(report.violations).toEqual([]);
  });

  it("tolerates units/edges being entirely absent (v2-style analysis) rather than throwing", () => {
    const segments = [segment(0, 5, "Hello world")];
    const index = buildCaptionIndex(segments);
    const { units, edges, ...v2Shape } = analysis();

    const report = verifyAnchors(v2Shape as Analysis, index);

    expect(report.totals.checked).toBe(0);
    expect(report.violations).toEqual([]);
  });

  it("produces a violation for every quote when captions have an empty segment array, rather than a false pass", () => {
    const index = buildCaptionIndex([]);
    const a = analysis({
      units: [unit({ anchors: [unitAnchor(0, "anything")] })],
      edges: [edge({ quote: "anything else" })],
    });

    const report = verifyAnchors(a, index);

    expect(report.violations).toHaveLength(2);
    expect(report.violations.every((v) => v.reason === "quote-not-found")).toBe(true);
  });

  it("flags every pearl as timestamp-out-of-range when captions have an empty segment array", () => {
    const index = buildCaptionIndex([]);
    const a = analysis({ pearls: [pearl({ t: 0, label: "orphan pearl" })] });

    const report = verifyAnchors(a, index);

    expect(report.violations).toEqual([{ kind: "pearl", id: "orphan pearl", t: 0, reason: "timestamp-out-of-range" }]);
  });
});

// --- Totals consistency --------------------------------------------------------

describe("verifyAnchors — report totals", () => {
  it("keeps exact + normalized + violations equal to the number of checks performed, across units/edges/pearls", () => {
    const segments = [segment(0, 5, "Hello world"), segment(5, 10, "this is a test")];
    const index = buildCaptionIndex(segments);
    const a = analysis({
      units: [unit({ anchors: [unitAnchor(1, "Hello world"), unitAnchor(999, "missing quote")] })],
      edges: [edge({ quote: "this is a test" })],
      pearls: [pearl({ t: 3 }), pearl({ t: 999 })],
    });

    const report: AnchorVerifyReport = verifyAnchors(a, index);

    expect(report.results.exact + report.results.normalized + report.violations.length).toBe(report.totals.checked);
    expect(report.totals.checked).toBe(5);
    expect(report.totals.units).toBe(2);
    expect(report.totals.edges).toBe(1);
    expect(report.totals.pearls).toBe(2);
  });
});

// --- Schema reuse (input parsing goes through the shipped Zod schemas) --------

describe("parseAnalysisInput / parseCaptionsFile — schema reuse", () => {
  it("parses analysis input through the shipped AnalysisSchema, rejecting invalid shapes", () => {
    expect(() => parseAnalysisInput({ not: "valid" })).toThrow();
    const parsed = parseAnalysisInput(analysis());
    expect(parsed.pearls).toEqual([]);
  });

  it("parses captions input through the shipped TranscriptSegmentSchema, rejecting invalid segment shapes", () => {
    expect(() => parseCaptionsFile({ segments: [{ start: -1, end: 5, text: "x" }] })).toThrow();
    const parsed = parseCaptionsFile({ segments: [segment(0, 5, "hi")] });
    expect(parsed.segments).toHaveLength(1);
  });
});
