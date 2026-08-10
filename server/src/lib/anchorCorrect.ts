// Phase 04.1 "Anchor Fidelity Repair" (D-01 item 2, F-10): a deterministic,
// write-time correction pass that cross-checks every unit anchor's claimed
// `t` against the real position of its own verbatim `quote` in the caption
// stream, and snaps `t` to the earliest ("teaching-pass") occurrence when
// the claimed `t` isn't already defensible.
//
// 04.1-RESEARCH.md's empirical finding: the model's returned quote text is
// usually right, but its `t` sometimes points at a topically-similar SECOND
// occurrence later in the transcript (a recap) rather than the first
// ("teaching") occurrence — a bounds-check alone (t within its own chunk's
// [start,end]) caught only 2 of that run's 10 real drifted units, because
// most of them were "in-bounds but wrong". This pass catches all of them by
// checking the quote's real position instead of just its window.
//
// This module shares its quote-location logic with the committed anchor
// verifier (anchorVerify.ts's buildCaptionIndex/findQuoteOccurrences) — a
// second, parallel matching implementation does not exist here (D-03: the
// verifier that judges a corrected anchor must be the same machinery that
// located it, or the oracle and the corrector could disagree).
//
// Pure module: no filesystem, network, or console I/O. Unit anchors are the
// whole scope of this tracer — pearls, edges, and safety-tier reporting
// belong to 04.1-03.
import { DEFAULT_TOLERANCE_SEC, buildCaptionIndex, findQuoteOccurrences, type CaptionIndex } from "./anchorVerify.js";
import type { AnalysisUnit, UnitAnchor, UnitType } from "./analysis.js";
import type { TranscriptSegmentInput } from "./models.js";

export interface AnchorCorrection {
  unitId: string;
  unitType: UnitType;
  before: number;
  after: number;
}

export interface UnresolvedAnchor {
  unitId: string;
  unitType: UnitType;
  t: number;
  quote: string;
}

export interface AnchorCorrectResult<T> {
  analysis: T;
  corrections: AnchorCorrection[];
  unresolved: UnresolvedAnchor[];
}

export interface AnchorCorrectOptions {
  /**
   * Seconds of allowed drift before a claimed `t` is considered defensible.
   * Must match `verifyAnchors`'s own tolerance so the corrector never
   * "fixes" an anchor the verifier would already accept, and never leaves
   * alone one the verifier would reject. Defaults to `DEFAULT_TOLERANCE_SEC`
   * (anchorVerify.ts's own default).
   */
  toleranceSec?: number;
}

/** The minimal shape this module needs — accepts either a full `Analysis` or the intermediate `{ units }` snapshot `runAnalysisJobV3` has in hand post-merge, pre-return. */
export interface AnchorCorrectInput {
  units?: readonly AnalysisUnit[];
}

/**
 * Corrects every unit anchor's `t` in `analysis.units` against `segments`
 * (the same caption stream the chunk prompts were built from). Every other
 * field of `analysis` — and every field of each unit other than `anchors`
 * — passes through unchanged; every anchor's `quote` string is always the
 * original reference, whether or not its `t` moved.
 *
 * For each unit anchor:
 * - quote not found anywhere in the caption stream → left untouched,
 *   recorded as unresolved (a timestamp is never invented for a quote that
 *   cannot be located).
 * - some occurrence starts within tolerance of the claimed `t` → left
 *   untouched (the pass never "improves" an anchor the verifier would
 *   already accept).
 * - otherwise → `t` is set to the EARLIEST occurrence's start (D-01 item
 *   2's earliest-teaching-pass rule), recorded as a correction.
 *
 * Never throws: an analysis with no units, or a caption stream with no
 * segments, both return with nothing corrected.
 */
export function correctAnalysisAnchors<T extends AnchorCorrectInput>(
  analysis: T,
  segments: readonly TranscriptSegmentInput[],
  options: AnchorCorrectOptions = {}
): AnchorCorrectResult<T> {
  if (!analysis.units || analysis.units.length === 0) {
    return { analysis, corrections: [], unresolved: [] };
  }

  const toleranceSec = options.toleranceSec ?? DEFAULT_TOLERANCE_SEC;
  const index = buildCaptionIndex(segments);
  const corrections: AnchorCorrection[] = [];
  const unresolved: UnresolvedAnchor[] = [];

  const correctedUnits = analysis.units.map((unit) => ({
    ...unit,
    anchors: unit.anchors.map((anchor) => correctOneAnchor(unit, anchor, index, toleranceSec, corrections, unresolved)),
  }));

  return {
    analysis: { ...analysis, units: correctedUnits },
    corrections,
    unresolved,
  };
}

function correctOneAnchor(
  unit: Pick<AnalysisUnit, "id" | "type">,
  anchor: UnitAnchor,
  index: CaptionIndex,
  toleranceSec: number,
  corrections: AnchorCorrection[],
  unresolved: UnresolvedAnchor[]
): UnitAnchor {
  const occurrences = findQuoteOccurrences(index, anchor.quote);

  if (occurrences.kind === "not-found") {
    unresolved.push({ unitId: unit.id, unitType: unit.type, t: anchor.t, quote: anchor.quote });
    return anchor;
  }

  const withinTolerance = occurrences.starts.some((s) => Math.abs(s - anchor.t) <= toleranceSec);
  if (withinTolerance) {
    return anchor;
  }

  const earliest = Math.min(...occurrences.starts);
  corrections.push({ unitId: unit.id, unitType: unit.type, before: anchor.t, after: earliest });
  return { t: earliest, quote: anchor.quote };
}
