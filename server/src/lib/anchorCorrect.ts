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
// Pure module: no filesystem, network, or console I/O. 04.1-03's Task 2
// widens this module to also correct pearl timestamps (narrowly — a pearl
// carries no quote, so the only defensible move is bringing an out-of-range
// timestamp back inside the transcript, and only when the pearl's own
// linked unit supplies a corrected position); per-run correction telemetry
// (the console.warn summary) is wired at the runAnalysisJobV3 call site in
// analysis.ts, not here — this module stays pure.
import { DEFAULT_TOLERANCE_SEC, buildCaptionIndex, findQuoteOccurrences, type CaptionIndex } from "./anchorVerify.js";
import type { AnalysisUnit, Pearl, UnitAnchor, UnitType } from "./analysis.js";
import type { TranscriptSegmentInput } from "./models.js";

// --- Clinical safety-tier accounting -----------------------------------------
//
// server/lenses/clinical.json's own `safetyTier` array (DOSAGE/
// CONTRAINDICATION/LAB_VALUE/PRIORITIZATION) is per-lens DATA, threaded
// through at evaluation time via conceptRegistry.ts's `EvaluateUnitParams.
// safetyUnitTypes` — it is not a fixed set this (deliberately pure, no
// filesystem I/O) module could read directly, and no server-side shipped
// equivalent of web/src/lib/safetyTier.ts's `SAFETY_TIER_UNIT_TYPES` exists
// yet (checked: grep across server/src/lib turned up only the per-lens
// EvaluateUnitParams threading and clinical.json's own data — this is the
// first server-side copy). Duplicated here as a plain constant, mirroring
// web/src/lib/safetyTier.ts's set exactly, rather than invented fresh.
export const SAFETY_TIER_UNIT_TYPES: ReadonlySet<UnitType> = new Set<UnitType>([
  "DOSAGE",
  "CONTRAINDICATION",
  "LAB_VALUE",
  "PRIORITIZATION",
]);

export function isSafetyTierUnitType(type: UnitType): boolean {
  return SAFETY_TIER_UNIT_TYPES.has(type);
}

// --- Correction/unresolved record shapes -------------------------------------

export type AnchorLocatedBy = "exact" | "normalized" | "ellipsis-first-span";

export interface AnchorCorrection {
  unitId: string;
  unitType: UnitType;
  before: number;
  after: number;
  /** How the corrected position was located — lets a caller separate an ordinary exact/normalized relocation from the ellipsis-first-span fallback without re-deriving anything. */
  locatedBy: AnchorLocatedBy;
}

export interface UnresolvedAnchor {
  unitId: string;
  unitType: UnitType;
  t: number;
  quote: string;
}

export interface PearlCorrection {
  pearlLabel: string;
  unitId: string;
  before: number;
  after: number;
}

export interface UnresolvedPearl {
  pearlLabel: string;
  t: number;
  unitId?: string;
}

export interface AnchorCorrectResult<T> {
  analysis: T;
  corrections: AnchorCorrection[];
  unresolved: UnresolvedAnchor[];
  pearlCorrections: PearlCorrection[];
  unresolvedPearls: UnresolvedPearl[];
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

/**
 * The minimal shape this module needs — accepts either a full `Analysis` or
 * the intermediate `{ units, pearls }` snapshot `runAnalysisJobV3` has in
 * hand post-merge. `pearls` is corrected only when the key is present at
 * all (04.1-01's original tracer scope — units only, no `pearls` key —
 * still works exactly as before: a `pearls` key that is `undefined` is
 * never added to the output).
 */
export interface AnchorCorrectInput {
  units?: readonly AnalysisUnit[];
  pearls?: readonly Pearl[];
}

// --- Ellipsis-joined quote handling -------------------------------------------

/**
 * RESEARCH and 04.1-02's own cross-validation both found the model sometimes
 * emits a quote that joins two non-contiguous transcript spans with an
 * ellipsis (e.g. three dots or the unicode `…`) — those are unfindable as a
 * contiguous substring by construction, no matter how good the caption
 * stream is. Returns the trimmed text before the first ellipsis marker, or
 * `null` when the quote carries no ellipsis (or the span before it is
 * empty, e.g. a quote that OPENS with an ellipsis).
 */
const ELLIPSIS_MARKER = /\.{3,}|…/;

function firstEllipsisSpan(quote: string): string | null {
  const match = quote.match(ELLIPSIS_MARKER);
  if (!match || match.index === undefined) return null;
  const span = quote.slice(0, match.index).trim();
  return span.length > 0 ? span : null;
}

/**
 * Corrects every unit anchor's `t` in `analysis.units` against `segments`
 * (the same caption stream the chunk prompts were built from). Every other
 * field of `analysis` — and every field of each unit other than `anchors`
 * — passes through unchanged; every anchor's `quote` string is always the
 * original reference, whether or not its `t` moved.
 *
 * For each unit anchor:
 * - the full quote is found (exact, then whitespace/case-normalized
 *   substring) somewhere in the caption stream → the claimed `t` is left
 *   untouched if any occurrence starts within tolerance of it (the pass
 *   never "improves" an anchor the verifier would already accept);
 *   otherwise `t` is snapped to the EARLIEST occurrence's start (D-01 item
 *   2's earliest-teaching-pass rule), recorded as a correction.
 * - the full quote is not found, but it is two spans joined by an ellipsis
 *   → the FIRST span is located the same way (exact, then normalized) and
 *   its occurrence's start is used in its place; the quote text itself is
 *   never rewritten to the matched span.
 * - neither the full quote nor its first ellipsis span can be located →
 *   left untouched, recorded as unresolved (a timestamp is never invented
 *   for a quote that cannot be located).
 *
 * When `analysis.pearls` is present, every pearl timestamp is also
 * corrected (narrowly — see `correctOnePearl`):
 * - a timestamp within the caption stream's range is left untouched,
 *   whether or not it links to a unit — a pearl carries no quote, so an
 *   in-range timestamp is never second-guessed.
 * - an out-of-range timestamp whose `unitId` names a unit with at least one
 *   (corrected) anchor is moved to that unit's own earliest anchor time —
 *   the only position this pass can defend, since a pearl has nothing of
 *   its own to locate by.
 * - an out-of-range timestamp with no usable unit link (no `unitId`, or a
 *   `unitId` naming a unit with zero anchors) is left untouched and
 *   recorded as unresolved — a timestamp is never invented.
 *
 * Never throws: an analysis with no units/pearls, or a caption stream with
 * no segments, both return with nothing corrected (every anchor becomes
 * unresolved rather than a false pass).
 */
export function correctAnalysisAnchors<T extends AnchorCorrectInput>(
  analysis: T,
  segments: readonly TranscriptSegmentInput[],
  options: AnchorCorrectOptions = {}
): AnchorCorrectResult<T> {
  const toleranceSec = options.toleranceSec ?? DEFAULT_TOLERANCE_SEC;
  const index = buildCaptionIndex(segments);
  const corrections: AnchorCorrection[] = [];
  const unresolved: UnresolvedAnchor[] = [];
  const pearlCorrections: PearlCorrection[] = [];
  const unresolvedPearls: UnresolvedPearl[] = [];

  let correctedUnits: readonly AnalysisUnit[] | undefined = analysis.units;
  if (analysis.units && analysis.units.length > 0) {
    correctedUnits = analysis.units.map((unit) => ({
      ...unit,
      anchors: unit.anchors.map((anchor) => correctOneAnchor(unit, anchor, index, toleranceSec, corrections, unresolved)),
    }));
  }

  let correctedPearls: readonly Pearl[] | undefined = analysis.pearls;
  if (analysis.pearls && analysis.pearls.length > 0) {
    const lastEnd = lastSegmentEnd(segments);
    const earliestAnchorByUnitId = buildEarliestAnchorMap(correctedUnits ?? []);
    correctedPearls = analysis.pearls.map((pearl) => correctOnePearl(pearl, lastEnd, earliestAnchorByUnitId, pearlCorrections, unresolvedPearls));
  }

  const result: AnchorCorrectInput = { ...analysis };
  if (analysis.units !== undefined) result.units = correctedUnits;
  if (analysis.pearls !== undefined) result.pearls = correctedPearls;

  return { analysis: result as T, corrections, unresolved, pearlCorrections, unresolvedPearls };
}

function correctOneAnchor(
  unit: Pick<AnalysisUnit, "id" | "type">,
  anchor: UnitAnchor,
  index: CaptionIndex,
  toleranceSec: number,
  corrections: AnchorCorrection[],
  unresolved: UnresolvedAnchor[]
): UnitAnchor {
  const full = findQuoteOccurrences(index, anchor.quote);
  if (full.kind !== "not-found") {
    return applyOccurrences(unit, anchor, full.starts, full.kind, toleranceSec, corrections);
  }

  const firstSpan = firstEllipsisSpan(anchor.quote);
  if (firstSpan) {
    const spanOccurrences = findQuoteOccurrences(index, firstSpan);
    if (spanOccurrences.kind !== "not-found") {
      return applyOccurrences(unit, anchor, spanOccurrences.starts, "ellipsis-first-span", toleranceSec, corrections);
    }
  }

  unresolved.push({ unitId: unit.id, unitType: unit.type, t: anchor.t, quote: anchor.quote });
  return anchor;
}

function applyOccurrences(
  unit: Pick<AnalysisUnit, "id" | "type">,
  anchor: UnitAnchor,
  starts: readonly number[],
  locatedBy: AnchorLocatedBy,
  toleranceSec: number,
  corrections: AnchorCorrection[]
): UnitAnchor {
  const withinTolerance = starts.some((s) => Math.abs(s - anchor.t) <= toleranceSec);
  if (withinTolerance) {
    return anchor;
  }

  const earliest = Math.min(...starts);
  corrections.push({ unitId: unit.id, unitType: unit.type, before: anchor.t, after: earliest, locatedBy });
  // The quote string is always the original reference — even the
  // ellipsis-first-span path corrects only the position, never rewrites the
  // quote to the span it matched against.
  return { t: earliest, quote: anchor.quote };
}

// --- Pearl timestamp correction (04.1-03 Task 2) -----------------------------

/** The last caption segment's own `end` — the same range boundary `verifyAnchors`'s pearl range check judges against (anchorVerify.ts:243-246's private `lastSegmentEnd`, duplicated here as a trivial one-liner rather than exported/imported, since it isn't the quote-search primitive D-03 requires this module to share). `undefined` for an empty caption stream, meaning no valid range exists at all. */
function lastSegmentEnd(segments: readonly TranscriptSegmentInput[]): number | undefined {
  if (segments.length === 0) return undefined;
  return Math.max(...segments.map((s) => s.end));
}

/** Earliest anchor `t` per unit id, computed over the (already-corrected) units — a pearl is only ever moved to a position one of these units can actually defend. Units with zero anchors are omitted (nothing to move a pearl to). */
function buildEarliestAnchorMap(units: readonly AnalysisUnit[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const unit of units) {
    if (unit.anchors.length === 0) continue;
    map.set(unit.id, Math.min(...unit.anchors.map((a) => a.t)));
  }
  return map;
}

function correctOnePearl(
  pearl: Pearl,
  lastEnd: number | undefined,
  earliestAnchorByUnitId: Map<string, number>,
  pearlCorrections: PearlCorrection[],
  unresolvedPearls: UnresolvedPearl[]
): Pearl {
  const inRange = lastEnd !== undefined && pearl.t <= lastEnd;
  if (inRange) {
    return pearl;
  }

  if (pearl.unitId) {
    const earliest = earliestAnchorByUnitId.get(pearl.unitId);
    if (earliest !== undefined) {
      pearlCorrections.push({ pearlLabel: pearl.label, unitId: pearl.unitId, before: pearl.t, after: earliest });
      return { ...pearl, t: earliest };
    }
  }

  unresolvedPearls.push({ pearlLabel: pearl.label, t: pearl.t, unitId: pearl.unitId });
  return pearl;
}
