// Phase 5 "Lens registry + clinical as first data-driven lens", item 5
// "Safety tier (CODE, not data)" — mirrors server/lenses/clinical.json's
// safetyTier list as a fixed, code-level set (see safetyTier.ts's header
// comment for why this is a hardcoded mirror, not a fetched value).
import { describe, expect, it } from "vitest";
import { isSafetyTierUnitType, SAFETY_TIER_UNIT_TYPES } from "./safetyTier";
import type { UnitType } from "./types";

describe("isSafetyTierUnitType", () => {
  it("is true for exactly DOSAGE, CONTRAINDICATION, and LAB_VALUE", () => {
    expect(isSafetyTierUnitType("DOSAGE")).toBe(true);
    expect(isSafetyTierUnitType("CONTRAINDICATION")).toBe(true);
    expect(isSafetyTierUnitType("LAB_VALUE")).toBe(true);
  });

  it("is false for every other unit type, including the spine-level PRIORITIZATION addition", () => {
    const nonSafetyTypes: UnitType[] = ["CLAIM", "MECHANISM", "PROCEDURE", "EXAMPLE", "BOUNDARY", "CLUSTER", "PRIORITIZATION"];
    for (const type of nonSafetyTypes) expect(isSafetyTierUnitType(type)).toBe(false);
  });

  it("SAFETY_TIER_UNIT_TYPES has exactly three members", () => {
    expect(SAFETY_TIER_UNIT_TYPES.size).toBe(3);
  });
});
