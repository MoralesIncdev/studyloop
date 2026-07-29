// V3-A A4 "Concept ticker demotion": the concept chip strip's pure
// selection logic, split out of ConceptChipStrip.tsx for testability (same
// pattern as lib/compileFlow.ts's getUncaptionedBubbles). Deliberately built
// on top of the existing `activeConcepts` window selector (lib/selectors.ts)
// rather than a new one — "chip-strip active-window selector reuse" per
// SPEC's acceptance criteria.
import type { ActiveConcept } from "./selectors";

export interface ConceptChipSelection {
  /** Up to `maxVisible` active concepts, de-duped by card id. */
  visible: ActiveConcept[];
  /** How many additional active concepts didn't fit — renders as the "+N" chip. */
  overflowCount: number;
}

/**
 * A concept can be "active" via more than one anchor inside the same
 * [anchor, anchor+90s] window (e.g. two anchors close together) — de-dupe by
 * card id first so the strip never shows the same title twice, then split
 * into the visible slice + overflow count (SPEC: "max 2 + '+N'").
 */
export function selectConceptChips(active: readonly ActiveConcept[], maxVisible: number): ConceptChipSelection {
  const seen = new Set<string>();
  const unique: ActiveConcept[] = [];
  for (const entry of active) {
    if (seen.has(entry.card.id)) continue;
    seen.add(entry.card.id);
    unique.push(entry);
  }
  return {
    visible: unique.slice(0, maxVisible),
    overflowCount: Math.max(0, unique.length - maxVisible),
  };
}
