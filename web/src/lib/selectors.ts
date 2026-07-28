// Pure derived-state selectors shared by every pane that needs to know "where are
// we in the timeline right now". Kept framework-free so they're trivially testable
// and so the zustand store can call them without extra indirection.
import { findActiveIndex } from "./time";
import type { ConceptCard, TranscriptSegment } from "./types";

/** Index of the transcript segment currently playing, or -1 before the first segment. */
export function activeSegmentIndex(segments: readonly TranscriptSegment[], t: number): number {
  return findActiveIndex(segments, t, (s) => s.start);
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
