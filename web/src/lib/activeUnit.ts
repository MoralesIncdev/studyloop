// Console slice 8 (design/mockups/video-console/BUILD-BRIEF.md): unit-level
// selectors for the drill and echo panes — which typed unit is "being taught
// right now", and whether it carries drillable overlay fields (V3-D D1
// physical_skill overlay: triggers / failureModes / drillPairing).
import type { AnalysisUnit } from "./types";

/** Same activity window as the concept pane (lib/activeConcept.ts). */
export const ACTIVE_UNIT_WINDOW_S = 60;

export interface ActiveUnit {
  unit: AnalysisUnit;
  t: number;
}

/** The latest unit anchor satisfying t <= currentTime <= t + window, or null. */
export function activeUnitAt(units: AnalysisUnit[], currentTime: number): ActiveUnit | null {
  let best: ActiveUnit | null = null;
  for (const unit of units) {
    for (const anchor of unit.anchors) {
      if (currentTime >= anchor.t && currentTime <= anchor.t + ACTIVE_UNIT_WINDOW_S) {
        if (!best || anchor.t > best.t) best = { unit, t: anchor.t };
      }
    }
  }
  return best;
}

export interface DrillContent {
  triggers: string[];
  failureModes: string[];
  drillPairing: string | null;
}

/** The unit's drillable overlay content, or null when there's nothing to
 *  drill — the pane renders only for units the analysis actually equipped. */
export function drillFor(unit: AnalysisUnit): DrillContent | null {
  const overlay = unit.overlay;
  if (!overlay) return null;
  const triggers = overlay.triggers ?? [];
  const failureModes = overlay.failureModes ?? [];
  const drillPairing = overlay.drillPairing?.trim() || null;
  if (triggers.length === 0 && failureModes.length === 0 && !drillPairing) return null;
  return { triggers, failureModes, drillPairing };
}
