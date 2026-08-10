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
// Phase 04.1 Plan 2 (D-01 item 1's wider ruleset, F-09): the tracer (Plan 1)
// deliberately left two thresholds unset — accepting ANY nonzero overlap and
// requiring exact time equality. Both are now named module constants (see
// MIN_OVERLAP_WORDS and TIME_TOUCH_TOLERANCE_SEC below), pinned against the
// real 2026-08-10 proof data (server/test/fixtures/rolling-research-*.vtt,
// rolling-cpap-*.vtt) so the values are justified against genuine rolling
// pairs, not guessed.
//
// Comparison is normalized (case-folded, whitespace-collapsed); output text
// preserves each emitted word's original casing and punctuation exactly.
import type { CaptionSegment } from "./captionParse.js";

/** Word-count window at the tail of the accumulated stream the overlap search considers — generous for YouTube's rolling pattern (a few words per growing cue) without risking a match against unrelated earlier content. Also bounds the search cost on a long transcript (T-04.1-07). */
const OVERLAP_WINDOW_WORDS = 40;

/**
 * Minimum overlap length (in words) required to strip a PARTIAL match — one
 * that doesn't consume the entire available comparison window (see
 * `longestSuffixPrefixOverlap`'s "complete match" escape hatch below).
 * Chosen at 3: the real 2026-08-10 proof data's rolling pairs share overlaps
 * from 1 word (the transcript's very first cue, "Med.", RESEARCH's ten-cue
 * excerpt) up to 12+ words — but every one of those is a COMPLETE match
 * (the whole trailing tail-window or the whole incoming cue's own text is
 * consumed), never a partial one; complete matches are accepted regardless
 * of word count via the escape hatch, so this constant never has to be
 * lowered to accommodate them. A PARTIAL match below 3 words — where more
 * tail/cue content was available for comparison and simply didn't match —
 * is far more likely to be an accidental word-boundary coincidence (two
 * unrelated sentences sharing "the"/"a"/"is" at the seam) than genuine
 * YouTube rolling duplication (T-04.1-05).
 */
const MIN_OVERLAP_WORDS = 3;

/**
 * Seconds of slack allowed when deciding whether two cues' time ranges
 * "touch or overlap". Every genuine rolling pair in the real 2026-08-10 data
 * has an EXACT touch (one cue's end equals the next cue's start, to the
 * millisecond) — this tolerance exists only to absorb floating-point noise
 * from the ms-to-seconds conversion (`ms / 1000`) used when parsing VTT/SRT
 * timestamps and Innertube's `start_ms`/`end_ms` fields, not to bridge a
 * genuine pause between unrelated cues. 50ms is far smaller than the
 * shortest real gap between disjoint sentences (hundreds of ms to seconds)
 * and comfortably larger than any float-rounding error this codebase's
 * second-granularity timestamps could produce.
 */
const TIME_TOUCH_TOLERANCE_SEC = 0.05;

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

/**
 * True when two cues' time ranges touch or overlap, within
 * TIME_TOUCH_TOLERANCE_SEC. A genuine rolling pair always satisfies this
 * (near-identical/overlapping start times, exact touch in the real data);
 * disjoint cues in a clean transcript rarely do, and even when they touch at
 * a single boundary point, `longestSuffixPrefixOverlap`'s content check
 * (guard 2) finds nothing worth stripping.
 */
function timeRangesTouch(a: CaptionSegment, b: CaptionSegment): boolean {
  return a.start - TIME_TOUCH_TOLERANCE_SEC <= b.end && b.start - TIME_TOUCH_TOLERANCE_SEC <= a.end;
}

/**
 * Length of the longest suffix of `tailTokens` that is also a prefix of
 * `cueTokens`, comparing on `.normalized`. A match that consumes the ENTIRE
 * available comparison window — either the whole trailing tail-window or
 * the whole incoming cue, whichever is shorter — is always accepted, however
 * short: this is what every genuine reset/grow pair in the real proof data
 * looks like, including the transcript's very first, single-word reset cue
 * ("Med.", 04.1-RESEARCH.md's excerpt), where there simply isn't more
 * context available to require a longer match. A match SHORTER than the
 * full available window is accepted only when it reaches MIN_OVERLAP_WORDS
 * — there was room for a longer match and none was found, which is much
 * more likely to be an accidental word-boundary coincidence than a rolling
 * continuation. Returns 0 when no match exists at all (including when
 * either side is empty).
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
    if (matches) {
      return len === maxLen || len >= MIN_OVERLAP_WORDS ? len : 0;
    }
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
 * starts, same ends, same text. Running this function on its own output
 * changes nothing (idempotent): a deduped stream has no remaining overlaps
 * left to strip.
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
