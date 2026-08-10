// Phase 4 Plan 2 "Verbatim-anchor verifier" (D-03, PROOF-01): a pure, typed
// module that classifies every anchor quote in an analysis.json against that
// project's caption stream — exact substring, whitespace/case-normalized
// substring, or a violation — plus anchor-time drift for unit anchors and a
// range check for pearl timestamps.
//
// D-03's placement note (04-02-PLAN.md <placement_note>): the module lives at
// server/src/lib/anchorVerify.ts rather than server/scripts/ or scripts/ (D-03's
// suggested location) because both sit outside server/tsconfig.json's include
// list (["src", "test"]) and would be neither typechecked nor importable from a
// Vitest test without config changes. This location keeps D-03's substance — a
// small, committed, rerunnable script — inside the existing typecheck/test
// surfaces with zero config changes.
//
// This module owns NO filesystem, network, or console I/O — see
// server/src/scripts/verifyAnchors.ts for the CLI that reads project files,
// calls verifyAnchors(), and writes the report. Input parsing reuses the
// shipped Zod schemas (AnalysisSchema from ./analysis.js,
// TranscriptSegmentSchema from ./models.js) rather than redeclaring shapes, so
// a future schema change surfaces here as a type error instead of a silent
// miss.
import { z } from "zod";
import { AnalysisSchema, type Analysis } from "./analysis.js";
import { TranscriptSegmentSchema, type TranscriptSegmentInput } from "./models.js";

// --- Input parsing (reuses shipped schemas) ----------------------------------

/** Wire shape of `<project>/captions.json` (see lib/store.ts writeCaptions: `{ segments }`). */
export const CaptionsFileSchema = z.object({ segments: z.array(TranscriptSegmentSchema) });
export type CaptionsFile = z.infer<typeof CaptionsFileSchema>;

/** Parses raw analysis.json content through the shipped AnalysisSchema. */
export function parseAnalysisInput(raw: unknown): Analysis {
  return AnalysisSchema.parse(raw);
}

/** Parses raw captions.json content through the shipped TranscriptSegmentSchema. */
export function parseCaptionsFile(raw: unknown): CaptionsFile {
  return CaptionsFileSchema.parse(raw);
}

// --- Report shape --------------------------------------------------------------

/** SPEC/D-03: fifteen seconds — the same window the 2026-08-08 proof's manual check used (docs/REAL-LECTURE-PROOF-2026-08-08.md line 58). */
export const DEFAULT_TOLERANCE_SEC = 15;

export type ViolationKind = "unit" | "edge" | "pearl";
export type ViolationReason = "quote-not-found" | "time-drift" | "timestamp-out-of-range";

export interface AnchorViolation {
  kind: ViolationKind;
  /** Unit id, `"<source>->{target}"` for an edge, or the pearl's label. */
  id: string;
  t?: number;
  quote?: string;
  reason: ViolationReason;
  /** Present only for reason: "time-drift" — the owning segment's actual start second. */
  matchedSegmentStart?: number;
}

export interface AnchorVerifyReport {
  checkedAt: string;
  toleranceSec: number;
  totals: {
    /** units anchors + edge quotes + pearl timestamps checked */
    checked: number;
    units: number;
    edges: number;
    pearls: number;
  };
  results: {
    exact: number;
    normalized: number;
  };
  violations: AnchorViolation[];
}

export interface AnchorVerifyOptions {
  /** Seconds of allowed drift between an anchor's `t` and its matched caption segment's `start`. Defaults to DEFAULT_TOLERANCE_SEC. */
  toleranceSec?: number;
  /** Injectable clock for deterministic tests — defaults to `() => new Date().toISOString()`. */
  now?: () => string;
}

// --- Caption index -------------------------------------------------------------

interface CaptionIndexEntry {
  start: number;
  end: number;
  segment: TranscriptSegmentInput;
}

export interface CaptionIndex {
  exactText: string;
  exactEntries: readonly CaptionIndexEntry[];
  normalizedText: string;
  normalizedEntries: readonly CaptionIndexEntry[];
  segments: readonly TranscriptSegmentInput[];
}

function normalizeText(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Builds a searchable index from a caption segment array: the joined text
 * (segments separated by a single space, in order) plus a mapping from
 * character offset back to the owning segment, so a match position resolves
 * to a real segment start. Also builds a whitespace/case-normalized parallel
 * index for the "normalized" classification.
 */
export function buildCaptionIndex(segments: readonly TranscriptSegmentInput[]): CaptionIndex {
  let exactText = "";
  const exactEntries: CaptionIndexEntry[] = [];
  let normalizedText = "";
  const normalizedEntries: CaptionIndexEntry[] = [];

  for (const segment of segments) {
    if (exactText.length > 0) exactText += " ";
    const exactStart = exactText.length;
    exactText += segment.text;
    exactEntries.push({ start: exactStart, end: exactText.length, segment });

    if (normalizedText.length > 0) normalizedText += " ";
    const normStart = normalizedText.length;
    normalizedText += normalizeText(segment.text);
    normalizedEntries.push({ start: normStart, end: normalizedText.length, segment });
  }

  return { exactText, exactEntries, normalizedText, normalizedEntries, segments };
}

/** Finds the segment whose offset range contains `pos` (a match's start position). */
function findOwningSegment(entries: readonly CaptionIndexEntry[], pos: number): TranscriptSegmentInput | undefined {
  for (const entry of entries) {
    if (pos >= entry.start && pos < entry.end) return entry.segment;
  }
  // Fallback for a match landing exactly on a separator/boundary: the last
  // entry starting at or before pos.
  let fallback: TranscriptSegmentInput | undefined;
  for (const entry of entries) {
    if (entry.start <= pos) fallback = entry.segment;
    else break;
  }
  return fallback;
}

/** All (non-overlapping, left-to-right) occurrences of `needle` in `haystack`. */
function findAllOccurrences(haystack: string, needle: string): number[] {
  if (needle.length === 0) return [];
  const positions: number[] = [];
  let from = 0;
  for (;;) {
    const pos = haystack.indexOf(needle, from);
    if (pos === -1) break;
    positions.push(pos);
    from = pos + 1;
  }
  return positions;
}

// --- Quote matching --------------------------------------------------------------

export type QuoteOccurrenceKind = "exact" | "normalized" | "not-found";

export interface QuoteOccurrences {
  kind: QuoteOccurrenceKind;
  /** Owning-segment start seconds for every occurrence found, in the order found (left-to-right through the joined caption stream). Empty when kind is "not-found". */
  starts: readonly number[];
}

/**
 * Phase 04.1 "Anchor Fidelity Repair" (D-03): the ONE occurrence-search
 * implementation both `matchQuote` (this file, read-time verification) and
 * `correctAnalysisAnchors` (anchorCorrect.ts, write-time correction) use —
 * a corrected anchor can never disagree with the oracle that judges it
 * because they share this exact search, not two independently-tuned ones.
 *
 * Finds every exact-substring occurrence of `quote` in `index`, falling
 * back to a whitespace/case-normalized substring search if none is found.
 * Returns the ordered (left-to-right) list of owning-segment start seconds
 * for whichever bucket matched, or a "not-found" result with an empty list
 * when no occurrence exists at all under either search.
 */
export function findQuoteOccurrences(index: CaptionIndex, quote: string): QuoteOccurrences {
  if (quote.trim().length === 0) return { kind: "not-found", starts: [] };

  const exactStarts = findAllOccurrences(index.exactText, quote)
    .map((pos) => findOwningSegment(index.exactEntries, pos))
    .filter((s): s is TranscriptSegmentInput => s !== undefined)
    .map((s) => s.start);
  if (exactStarts.length > 0) {
    return { kind: "exact", starts: exactStarts };
  }

  const normalizedQuote = normalizeText(quote);
  if (normalizedQuote.length > 0) {
    const normalizedStarts = findAllOccurrences(index.normalizedText, normalizedQuote)
      .map((pos) => findOwningSegment(index.normalizedEntries, pos))
      .filter((s): s is TranscriptSegmentInput => s !== undefined)
      .map((s) => s.start);
    if (normalizedStarts.length > 0) {
      return { kind: "normalized", starts: normalizedStarts };
    }
  }

  return { kind: "not-found", starts: [] };
}

type QuoteMatch =
  | { kind: "exact" | "normalized"; segmentStart: number; withinTolerance: boolean }
  | { kind: "not-found" };

/**
 * Finds every occurrence of `quote` (via `findQuoteOccurrences`) and — when
 * `anchorT`/`toleranceSec` are given — prefers whichever occurrence starts
 * within tolerance of `anchorT` over the first occurrence found, so a
 * repeated quote doesn't misreport time-drift against the wrong instance.
 * When no occurrence exists at all, returns "not-found". Pure extraction:
 * this applies `findQuoteOccurrences`'s result with the same tolerance
 * preference the pre-extraction implementation used — `verifyAnchors`
 * classifies every input exactly as it did before.
 */
function matchQuote(index: CaptionIndex, quote: string, anchorT?: number, toleranceSec = DEFAULT_TOLERANCE_SEC): QuoteMatch {
  const occurrences = findQuoteOccurrences(index, quote);
  if (occurrences.kind === "not-found") return { kind: "not-found" };
  return pickCandidate(occurrences.kind, occurrences.starts, anchorT, toleranceSec);
}

function pickCandidate(
  kind: "exact" | "normalized",
  starts: readonly number[],
  anchorT: number | undefined,
  toleranceSec: number
): QuoteMatch {
  if (anchorT !== undefined) {
    const within = starts.find((s) => Math.abs(s - anchorT) <= toleranceSec);
    if (within !== undefined) return { kind, segmentStart: within, withinTolerance: true };
  }
  return { kind, segmentStart: starts[0], withinTolerance: false };
}

function lastSegmentEnd(segments: readonly TranscriptSegmentInput[]): number | undefined {
  if (segments.length === 0) return undefined;
  return Math.max(...segments.map((s) => s.end));
}

// --- Classification --------------------------------------------------------------

/**
 * Classifies every anchor quote in `analysis` (unit anchors, edge quotes) and
 * every pearl timestamp against `index`, returning a structured report. Never
 * throws on empty input — an analysis with no units/edges/pearls, or captions
 * with an empty segment array, both produce a well-formed report (the latter
 * with a violation for every quote/timestamp checked, never a false pass).
 */
export function verifyAnchors(analysis: Analysis, index: CaptionIndex, options: AnchorVerifyOptions = {}): AnchorVerifyReport {
  const toleranceSec = options.toleranceSec ?? DEFAULT_TOLERANCE_SEC;
  const now = options.now ?? (() => new Date().toISOString());

  const violations: AnchorViolation[] = [];
  let exact = 0;
  let normalized = 0;
  let unitsChecked = 0;
  let edgesChecked = 0;
  let pearlsChecked = 0;

  for (const unit of analysis.units ?? []) {
    for (const anchor of unit.anchors) {
      unitsChecked++;
      const match = matchQuote(index, anchor.quote, anchor.t, toleranceSec);
      if (match.kind === "not-found") {
        violations.push({ kind: "unit", id: unit.id, t: anchor.t, quote: anchor.quote, reason: "quote-not-found" });
        continue;
      }
      if (!match.withinTolerance) {
        violations.push({
          kind: "unit",
          id: unit.id,
          t: anchor.t,
          quote: anchor.quote,
          reason: "time-drift",
          matchedSegmentStart: match.segmentStart,
        });
        continue;
      }
      if (match.kind === "exact") exact++;
      else normalized++;
    }
  }

  for (const edge of analysis.edges ?? []) {
    edgesChecked++;
    // Edge quotes carry no timestamp — quote-checked only (no drift check).
    const match = matchQuote(index, edge.quote);
    if (match.kind === "not-found") {
      violations.push({ kind: "edge", id: `${edge.source}->${edge.target}`, quote: edge.quote, reason: "quote-not-found" });
      continue;
    }
    if (match.kind === "exact") exact++;
    else normalized++;
  }

  const lastEnd = lastSegmentEnd(index.segments);
  for (const pearl of analysis.pearls) {
    pearlsChecked++;
    // Pearls carry a timestamp and no quote — range-checked only. `lastEnd
    // === undefined` (empty caption stream) means there's no valid range at
    // all, so every pearl violates rather than false-passing.
    if (lastEnd === undefined || pearl.t > lastEnd) {
      violations.push({ kind: "pearl", id: pearl.label, t: pearl.t, reason: "timestamp-out-of-range" });
      continue;
    }
    exact++;
  }

  return {
    checkedAt: now(),
    toleranceSec,
    totals: {
      checked: unitsChecked + edgesChecked + pearlsChecked,
      units: unitsChecked,
      edges: edgesChecked,
      pearls: pearlsChecked,
    },
    results: { exact, normalized },
    violations,
  };
}
