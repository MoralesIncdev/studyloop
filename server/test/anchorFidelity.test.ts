// Phase 04.1 "Anchor Fidelity Repair" Plan 1 — the tracer: proves the whole
// phase architecture end-to-end on one thin path before building any of it
// out. A rolling-caption VTT transcript goes in — caption dedup (D-01 item
// 1, F-09) collapses YouTube's rolling reset/grow cue pairs, `runAnalysisJobV3`
// runs a post-merge anchor-correction pass (D-01 item 2, F-10) against an
// injected `AnalysisLLMClientV3` double that deliberately emits one correct
// and one drifted anchor, and the committed anchor verifier (D-03,
// anchorVerify.ts) reports zero violations on the result. No network call,
// fully deterministic.
import { describe, expect, it } from "vitest";
import { dedupeRollingCaptions } from "../src/lib/rollingCaptions.js";
import { parseVttCaptions, type CaptionSegment } from "../src/lib/captionParse.js";
import { correctAnalysisAnchors } from "../src/lib/anchorCorrect.js";
import { buildCaptionIndex, verifyAnchors } from "../src/lib/anchorVerify.js";
import { runAnalysisJobV3, type AnalysisLLMClientV3, type AnalysisUnit, type UnitAnchor } from "../src/lib/analysis.js";
import type { TranscriptSegment } from "../src/lib/transcripts.js";

// --- Fixtures ----------------------------------------------------------------

function segment(start: number, end: number, text: string): CaptionSegment {
  return { start, end, text };
}

/**
 * A handful of short, distinct sentences spoken at known times — the same
 * content the rolling-VTT fixture below carries, used directly (bypassing
 * VTT parsing) for the correctAnalysisAnchors-focused tests.
 */
function cleanTranscriptSegments(): TranscriptSegment[] {
  return [
    segment(0, 4, "Neurons transmit signals across synapses."),
    segment(4.01, 9, "Synapses release neurotransmitters into the gap."),
    segment(9.01, 14, "Receptors on the far side detect the signal."),
    segment(14.01, 19, "The signal continues down the next neuron."),
  ];
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

/**
 * Hand-built rolling WebVTT text: each spoken sentence arrives as a
 * near-zero-duration "reset" cue (the previous cumulative tail) immediately
 * followed by a "growing" cue (that tail plus the sentence's own words) —
 * the exact alternation 04.1-RESEARCH.md documents from this project's own
 * captions.json (Root Cause F-09). Four distinct sentences, in order:
 * "Neurons transmit signals across synapses." / "Synapses release
 * neurotransmitters into the gap." / "Receptors on the far side detect the
 * signal." / "The signal continues down the next neuron."
 */
function rollingVtt(): string {
  const cues = [
    ["00:00:00.000", "00:00:04.000", "Neurons transmit signals across synapses."],
    ["00:00:04.000", "00:00:04.010", "Neurons transmit signals across synapses."],
    [
      "00:00:04.010",
      "00:00:09.000",
      "Neurons transmit signals across synapses. Synapses release neurotransmitters into the gap.",
    ],
    [
      "00:00:09.000",
      "00:00:09.010",
      "Neurons transmit signals across synapses. Synapses release neurotransmitters into the gap.",
    ],
    [
      "00:00:09.010",
      "00:00:14.000",
      "Neurons transmit signals across synapses. Synapses release neurotransmitters into the gap. Receptors on the far side detect the signal.",
    ],
    [
      "00:00:14.000",
      "00:00:14.010",
      "Neurons transmit signals across synapses. Synapses release neurotransmitters into the gap. Receptors on the far side detect the signal.",
    ],
    [
      "00:00:14.010",
      "00:00:19.000",
      "Neurons transmit signals across synapses. Synapses release neurotransmitters into the gap. Receptors on the far side detect the signal. The signal continues down the next neuron.",
    ],
  ];
  const blocks = cues.map(([start, end, text]) => `${start} --> ${end}\n${text}`);
  return ["WEBVTT", "", ...blocks].join("\n\n");
}

/** A clean, non-rolling VTT: consecutive cues cover disjoint content, no join overlap. */
function nonRollingVtt(): string {
  const cues = [
    ["00:00:00.000", "00:00:03.000", "Photosynthesis converts light into chemical energy."],
    ["00:00:03.000", "00:00:06.000", "Chlorophyll absorbs light in the blue and red wavelengths."],
    ["00:00:06.000", "00:00:09.000", "Oxygen is released as a byproduct of the reaction."],
  ];
  const blocks = cues.map(([start, end, text]) => `${start} --> ${end}\n${text}`);
  return ["WEBVTT", "", ...blocks].join("\n\n");
}

// --- Behavior 1: rolling reset/grow cues collapse ------------------------------

describe("dedupeRollingCaptions — rolling reset/grow cue pairs", () => {
  it("collapses a rolling VTT into one segment per new sentence, timed at the cue that introduced it, with no phrase repeated in the joined stream", () => {
    const { segments } = parseVttCaptions(rollingVtt());

    expect(segments).toEqual([
      { start: 0, end: 4, text: "Neurons transmit signals across synapses." },
      { start: 4.01, end: 9, text: "Synapses release neurotransmitters into the gap." },
      { start: 9.01, end: 14, text: "Receptors on the far side detect the signal." },
      { start: 14.01, end: 19, text: "The signal continues down the next neuron." },
    ]);

    const joined = segments.map((s) => s.text).join(" ");
    expect(joined.match(/Neurons transmit signals across synapses\./g)).toHaveLength(1);
    expect(joined.match(/Synapses release neurotransmitters into the gap\./g)).toHaveLength(1);
  });
});

// --- Behavior 2: non-rolling transcript is unaffected --------------------------

describe("dedupeRollingCaptions — non-rolling transcript safety guard", () => {
  it("passes a clean, non-rolling VTT through with the same count, starts, ends, and text as today", () => {
    const raw = nonRollingVtt();
    const direct = [
      segment(0, 3, "Photosynthesis converts light into chemical energy."),
      segment(3, 6, "Chlorophyll absorbs light in the blue and red wavelengths."),
      segment(6, 9, "Oxygen is released as a byproduct of the reaction."),
    ];
    // Consecutive cues here touch at a single boundary point (one cue's end
    // equals the next cue's start) but share no suffix/prefix WORD overlap
    // at all — genuinely disjoint spoken content, unlike a rolling pair. The
    // overlap search still runs (guard 1 doesn't exclude a boundary touch)
    // but finds nothing to strip, so every segment passes through with its
    // original start/end/text unchanged: a byte-for-byte no-op.
    expect(dedupeRollingCaptions(direct)).toEqual(direct);

    const { segments } = parseVttCaptions(raw);
    expect(segments).toHaveLength(3);
    expect(segments).toEqual(direct);
  });
});

// --- Behaviors 3-6: correctAnalysisAnchors ------------------------------------

describe("correctAnalysisAnchors", () => {
  const segments = cleanTranscriptSegments();

  it("moves a claimed t far from its quote's real position to the start of the segment that owns the quote's earliest occurrence", () => {
    const drifted: UnitAnchor = { t: 45, quote: "Neurons transmit signals across synapses." };
    const analysis = { units: [unit({ id: "u-drifted", anchors: [drifted] })] };

    const { analysis: corrected, corrections, unresolved } = correctAnalysisAnchors(analysis, segments);

    expect(corrected.units![0].anchors[0].t).toBe(0);
    expect(corrections).toEqual([{ unitId: "u-drifted", unitType: "CLAIM", before: 45, after: 0 }]);
    expect(unresolved).toEqual([]);
  });

  it("leaves an anchor whose claimed t is already within tolerance byte-identical — never 'improves' an anchor the verifier would already accept", () => {
    const goodEnough: UnitAnchor = { t: 5, quote: "Synapses release neurotransmitters into the gap." };
    const analysis = { units: [unit({ id: "u-good", anchors: [goodEnough] })] };

    const { analysis: corrected, corrections } = correctAnalysisAnchors(analysis, segments);

    expect(corrected.units![0].anchors[0]).toBe(goodEnough); // same reference — untouched
    expect(corrections).toEqual([]);
  });

  it("leaves an anchor whose quote occurs nowhere in the caption stream byte-identical and reports it unresolved — never invents a timestamp", () => {
    const ungroundable: UnitAnchor = { t: 7, quote: "This sentence was never spoken in the transcript." };
    const analysis = { units: [unit({ id: "u-ungrounded", type: "MECHANISM", anchors: [ungroundable] })] };

    const { analysis: corrected, corrections, unresolved } = correctAnalysisAnchors(analysis, segments);

    expect(corrected.units![0].anchors[0]).toBe(ungroundable); // same reference — untouched
    expect(corrections).toEqual([]);
    expect(unresolved).toEqual([
      { unitId: "u-ungrounded", unitType: "MECHANISM", t: 7, quote: "This sentence was never spoken in the transcript." },
    ]);
  });

  it("never rewrites a quote string — byte-identical before and after, whether or not t moved", () => {
    const corrected1: UnitAnchor = { t: 45, quote: "Neurons transmit signals across synapses." };
    const untouched1: UnitAnchor = { t: 5, quote: "Synapses release neurotransmitters into the gap." };
    const ungrounded1: UnitAnchor = { t: 7, quote: "This sentence was never spoken in the transcript." };
    const analysis = {
      units: [unit({ id: "u-mixed", anchors: [corrected1, untouched1, ungrounded1] })],
    };

    const { analysis: result } = correctAnalysisAnchors(analysis, segments);
    const resultAnchors = result.units![0].anchors;

    expect(resultAnchors[0].quote).toBe(corrected1.quote);
    expect(resultAnchors[1].quote).toBe(untouched1.quote);
    expect(resultAnchors[2].quote).toBe(ungrounded1.quote);
  });
});

// --- Behaviors 7-8: full end-to-end chain -------------------------------------

/** Deterministic no-network test double: two units per the tracer's fixture — one correctly anchored, one whose quote is early in the transcript while its claimed t points at a later, in-bounds (single-chunk) position — mirroring RESEARCH's majority "in-bounds-but-wrong" drift shape, not just an out-of-window case. */
function makeClient(): AnalysisLLMClientV3 {
  return {
    runRouter: async () => ({ kind: "ok", data: { domain: "generic" } }),
    runChunkV3: async () => ({
      kind: "ok",
      data: {
        pearls: [],
        units: [
          {
            type: "CLAIM",
            label: "Neuron signal transmission",
            summary: "Neurons transmit signals across synapses.",
            body: "Neurons transmit electrical signals across synapses to communicate with each other.",
            anchors: [{ t: 0, quote: "Neurons transmit signals across synapses." }],
            confidence: 0.9,
          },
          {
            type: "MECHANISM",
            label: "Synaptic neurotransmitter release",
            summary: "Synapses release neurotransmitters into the gap.",
            body: "The synapse releases neurotransmitter molecules into the synaptic gap between neurons.",
            // Deliberately drifted: the quote is early (true position 4.01s)
            // but the claimed t (45s) points at a later position that is
            // still well inside this single chunk's [0, 480] window — the
            // "in-bounds but wrong" majority failure shape, not the easy
            // out-of-window case. A bounds-check-only implementation would
            // accept t:45 as fine; the quote-position corrector must not.
            anchors: [{ t: 45, quote: "Synapses release neurotransmitters into the gap." }],
            confidence: 0.9,
          },
        ],
        edges: [],
      },
    }),
    runMergeV3: async () => ({ kind: "ok", data: { pearls: [], themes: [] } }),
  };
}

describe("runAnalysisJobV3 — end-to-end tracer", () => {
  it("a rolling-caption transcript carrying a deliberately drifted anchor comes out verifier-clean", async () => {
    const { segments } = parseVttCaptions(rollingVtt());
    expect(segments).toHaveLength(4); // sanity: dedup already proven above

    const analysis = await runAnalysisJobV3({ segments, model: "test-model", client: makeClient() });

    // The corrector actually moved the drifted anchor (not a no-op fixture).
    const synapticUnit = analysis.units!.find((u) => u.label === "Synaptic neurotransmitter release")!;
    expect(synapticUnit.anchors[0].t).toBe(4.01);
    expect(synapticUnit.anchors[0].quote).toBe("Synapses release neurotransmitters into the gap.");

    const index = buildCaptionIndex(segments);
    const report = verifyAnchors(analysis, index);

    expect(report.violations).toEqual([]);
    expect(report.totals.units).toBe(2);
  });

  it("is deterministic — the same chain run twice produces identical anchor t values", async () => {
    const { segments } = parseVttCaptions(rollingVtt());

    const first = await runAnalysisJobV3({ segments, model: "test-model", client: makeClient() });
    const second = await runAnalysisJobV3({ segments, model: "test-model", client: makeClient() });

    const firstAnchors = first.units!.map((u) => u.anchors.map((a) => a.t));
    const secondAnchors = second.units!.map((u) => u.anchors.map((a) => a.t));
    expect(secondAnchors).toEqual(firstAnchors);
  });
});
