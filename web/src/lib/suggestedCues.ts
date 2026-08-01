// Console slice D "suggested-cue" pane (BUILD-BRIEF item 6, mock's #p-suggest
// — "F8 study_cues arriving as bare suggestions"). There is no study_cues/
// cues/suggestions field anywhere in this codebase (checked server/src/lib's
// Analysis types and web/src/lib/types.ts — see AnalysisUnit/AnalysisConcept)
// — F8 was never built. The nearest real signal is a not-yet-resolved
// proposal's own anchor quote (AnalysisUnit.anchors[].quote, the exact
// transcript line the unit was extracted from): that quote stands in as the
// "lesson cue" the mock's static markup shows, keyed the same way DrillPane/
// TestPane pick "the unit being taught right now" (activeUnitAt's window).
import type { AnalysisUnit, AttestationsFile } from "./types";

/** Same activity window as activeUnitAt/activeConceptAt (lib/activeUnit.ts). */
export const SUGGESTED_CUE_WINDOW_S = 60;

export interface SuggestedCue {
  unitId: string;
  quote: string;
  t: number;
}

/**
 * The latest still-pending (not attested, not dismissed) unit's quoted
 * anchor covering `currentTime`, or null. Units already resolved one way or
 * the other don't need a "keep or ignore" suggestion anymore.
 */
export function suggestedCueAt(
  units: readonly AnalysisUnit[],
  attestations: AttestationsFile,
  currentTime: number,
  windowS: number = SUGGESTED_CUE_WINDOW_S
): SuggestedCue | null {
  let best: SuggestedCue | null = null;
  for (const unit of units) {
    const status = attestations[unit.id]?.status;
    if (status === "attested" || status === "dismissed") continue;
    for (const anchor of unit.anchors) {
      const quote = anchor.quote.trim();
      if (!quote) continue;
      if (currentTime < anchor.t || currentTime > anchor.t + windowS) continue;
      if (!best || anchor.t > best.t) best = { unitId: unit.id, quote, t: anchor.t };
    }
  }
  return best;
}
