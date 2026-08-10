// Phase 04.1 "Anchor Fidelity Repair" (D-01 item 1, F-09): YouTube's
// auto-caption VTT/SRT tracks emit a "rolling" cue pattern — a near-zero-
// duration "reset" cue carrying the tail of the previous line, immediately
// followed by a "growing" cue repeating that tail plus a few new words —
// over and over across the whole transcript (04.1-RESEARCH.md Root Cause
// F-09, corroborated by yt-dlp#1734/#2956/#6274). `parseCueBlocks`
// (captionParse.ts) parses every cue independently with no cross-cue
// awareness, so this raw duplication passes straight through into every
// downstream consumer.
//
// This module is a pure second pass over an already-parsed, time-sorted
// segment array: it walks cues in order, tracks an accumulated tail of
// already-emitted words, and for each new cue strips off whatever prefix
// overlaps that tail — emitting only the NEW words a cue actually adds,
// timed at the cue's own start/end. A cue that adds nothing new (a pure
// "reset" cue) is dropped entirely.
//
// Two guards (both required, not optional — T-04.1-04) keep this safe for a
// non-rolling (SRT-style, one-sentence-per-cue) transcript, where
// consecutive cues cover disjoint spoken content and this shape should
// never fire:
//   1. Only consider an overlap when the cue's time range touches or
//      overlaps the previous cue's — a genuine rolling pair always does
//      (near-identical or overlapping start times); disjoint cues never do.
//   2. Bound the suffix search to a small trailing window of the
//      accumulated text, not the whole transcript, so a long transcript
//      can't accidentally match a rolling-looking overlap against
//      unrelated content spoken minutes earlier (also caps the cost of the
//      search).
//
// Comparison is normalized (case-folded, whitespace-collapsed); output text
// preserves each emitted word's original casing and punctuation exactly.
import type { CaptionSegment } from "./captionParse.js";

/** Word-count window at the tail of the accumulated stream the overlap search considers — generous for YouTube's rolling pattern (a few words per growing cue) without risking a match against unrelated earlier content. */
const OVERLAP_WINDOW_WORDS = 40;

interface Token {
  /** Case-folded form used for comparison only. */
  normalized: string;
  /** Original text exactly as it appeared in the cue, for output. */
  original: string;
}

function tokenize(text: string): Token[] {
  return text
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map((original) => ({ original, normalized: original.toLowerCase() }));
}

/** True when two cues' time ranges touch or overlap (a genuine rolling pair always does; disjoint cues in a clean transcript never do). */
function timeRangesTouch(a: CaptionSegment, b: CaptionSegment): boolean {
  return a.start <= b.end && b.start <= a.end;
}

/**
 * Length of the longest suffix of `tailTokens` that is also a prefix of
 * `cueTokens`, comparing on `.normalized`. Returns 0 when no such overlap
 * exists (including when either side is empty).
 */
function longestSuffixPrefixOverlap(tailTokens: readonly Token[], cueTokens: readonly Token[]): number {
  const maxLen = Math.min(tailTokens.length, cueTokens.length);
  for (let len = maxLen; len > 0; len--) {
    const tailSuffix = tailTokens.slice(tailTokens.length - len);
    let matches = true;
    for (let i = 0; i < len; i++) {
      if (tailSuffix[i].normalized !== cueTokens[i].normalized) {
        matches = false;
        break;
      }
    }
    if (matches) return len;
  }
  return 0;
}

/**
 * Collapses YouTube's rolling-caption duplication: walks `segments` (already
 * time-sorted) in order, and for each segment whose time range touches the
 * previous one, strips off whatever leading words are already covered by
 * the tail of the accumulated stream — emitting only the new words, timed
 * at the segment's own start/end. A segment that adds nothing new is
 * dropped. A segment whose time range does NOT touch the previous one (the
 * normal, non-rolling case) passes through with its original text
 * unchanged, and resets the accumulated tail to its own words — so a real
 * transcript with no rolling structure comes out the same count, same
 * starts, same ends, same text.
 */
export function dedupeRollingCaptions(segments: readonly CaptionSegment[]): CaptionSegment[] {
  const result: CaptionSegment[] = [];
  let tailTokens: Token[] = [];
  let previous: CaptionSegment | undefined;

  for (const segment of segments) {
    const cueTokens = tokenize(segment.text);

    if (previous && timeRangesTouch(previous, segment)) {
      const windowStart = Math.max(0, tailTokens.length - OVERLAP_WINDOW_WORDS);
      const window = tailTokens.slice(windowStart);
      const overlapLen = longestSuffixPrefixOverlap(window, cueTokens);
      const newTokens = cueTokens.slice(overlapLen);

      if (newTokens.length > 0) {
        result.push({
          start: segment.start,
          end: segment.end,
          text: newTokens.map((t) => t.original).join(" "),
        });
      }
      // A cue that adds nothing new (newTokens.length === 0) is dropped
      // entirely — it's a pure "reset" cue. Either way the accumulated tail
      // becomes this cue's own (cumulative) content for the next comparison.
      tailTokens = cueTokens;
      previous = segment;
      continue;
    }

    // No touching overlap with the previous cue — pass through unchanged.
    result.push(segment);
    tailTokens = cueTokens;
    previous = segment;
  }

  return result;
}
