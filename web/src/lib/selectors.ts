// Pure derived-state selectors shared by every pane that needs to know "where are
// we in the timeline right now". Kept framework-free so they're trivially testable
// and so the zustand store can call them without extra indirection.
import { findActiveIndex } from "./time";
import type { ConceptCard, TranscriptSegment } from "./types";

/** Tolerance past a segment's `end` before we consider playback to have left it. */
const SEGMENT_END_GRACE_SECONDS = 0.5;

/**
 * Index of the transcript segment currently playing, or -1 if `t` is before
 * the first segment, in a gap between two segments, or past the end of the
 * last one. A small grace period past `end` absorbs normalization slop
 * between segment boundaries and the sync engine's ~4Hz sampling.
 */
export function activeSegmentIndex(segments: readonly TranscriptSegment[], t: number): number {
  const idx = findActiveIndex(segments, t, (s) => s.start);
  if (idx < 0) return -1;
  const segment = segments[idx];
  if (t > segment.end + SEGMENT_END_GRACE_SECONDS) return -1;
  return idx;
}

const CONCEPT_WINDOW_SECONDS = 90;

export interface ActiveConcept {
  card: ConceptCard;
  anchorT: number;
}

/** Concepts with an anchor inside the "just covered" window [anchor, anchor+90s]. */
export function activeConcepts(concepts: readonly ConceptCard[], t: number): ActiveConcept[] {
  const result: ActiveConcept[] = [];
  for (const card of concepts) {
    for (const anchor of card.anchors) {
      if (anchor.t == null) continue;
      if (t >= anchor.t && t <= anchor.t + CONCEPT_WINDOW_SECONDS) {
        result.push({ card, anchorT: anchor.t });
        break;
      }
    }
  }
  return result;
}

/** Concepts with at least one anchor at or before t — i.e. playback has passed them. */
export function passedConcepts(concepts: readonly ConceptCard[], t: number): ConceptCard[] {
  return concepts.filter((card) => card.anchors.some((a) => a.t != null && a.t <= t));
}

/**
 * V3-A A1 "state-aware surface purge": whether the right-rail Transcript
 * card is *actually* visible right now — the user's persisted
 * `railOpenSection` choice, minus whatever the playback-focus purge is
 * currently forcing collapsed on top of it. `focusOverride` ("the user
 * always wins") suspends the purge, so an override during playback counts
 * as visually open too, same as being paused.
 *
 * This is the single source of truth for "is the transcript expanded" —
 * RightRail.tsx uses it to render the card's own expand/collapse state, and
 * CCOverlay.tsx uses it for the CC/transcript redundancy rule (never two
 * full text streams at once, PEDAGOGY §4 — see V3-A review finding #2,
 * where CCOverlay previously reimplemented this with a formula that missed
 * the focusOverride case).
 */
export function isTranscriptVisuallyOpen(
  railOpenSection: "transcript" | "concepts" | "path" | null,
  playbackFocus: boolean,
  focusOverride: boolean
): boolean {
  const purged = playbackFocus && !focusOverride;
  return railOpenSection === "transcript" && !purged;
}
