// Console slice 8 (design/mockups/video-console/BUILD-BRIEF.md): which concept
// is "being taught right now" — the one whose nearest anchor covers the
// playhead. Extracted from ConceptPane so the selection rule is testable and
// shared by any future pane that keys off the active concept (drill, echo).
import type { ConceptCard } from "./types";

/** How far past a concept's anchor it stays "active" — matches the concept-loop
 *  span cap (lib/conceptLoop.ts DEFAULT_SPAN_S), referenced not imported so the
 *  pane's activity window doesn't silently track unrelated loop-cap changes. */
export const ACTIVE_WINDOW_S = 60;

export interface ActiveConcept {
  card: ConceptCard;
  t: number;
}

/** The latest anchor satisfying t <= currentTime <= t + ACTIVE_WINDOW_S across
 *  every card, or null when nothing covers the playhead. */
export function activeConceptAt(cards: ConceptCard[], currentTime: number): ActiveConcept | null {
  let best: ActiveConcept | null = null;
  for (const card of cards) {
    for (const anchor of card.anchors) {
      if (anchor.t == null) continue;
      if (currentTime >= anchor.t && currentTime <= anchor.t + ACTIVE_WINDOW_S) {
        if (!best || anchor.t > best.t) best = { card, t: anchor.t };
      }
    }
  }
  return best;
}
