// Phase 5 "Lens registry + clinical as first data-driven lens"
// (design/EXECUTION-PLAN-post-review-v1.md, AMENDED spec), item 5 "Safety
// tier (CODE, not data)": a lens's `safetyTier` field only ever REFERENCES
// this fixed set of unit types — it cannot redefine what the tier DOES
// (unconditional verbatim-quote display here; excluded from concept-registry
// auto-merge server-side, see server/src/lib/conceptRegistry.ts). Mirrors
// server/lenses/clinical.json's `safetyTier` list — same "plain interface
// mirror, not a cross-workspace import" convention lib/types.ts's header
// comment documents for every other server-shape mirror in this file.
import type { UnitType } from "./types";

export const SAFETY_TIER_UNIT_TYPES: ReadonlySet<UnitType> = new Set<UnitType>(["DOSAGE", "CONTRAINDICATION", "LAB_VALUE"]);

export function isSafetyTierUnitType(type: UnitType): boolean {
  return SAFETY_TIER_UNIT_TYPES.has(type);
}
