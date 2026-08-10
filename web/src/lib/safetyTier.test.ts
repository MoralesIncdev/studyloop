// Phase 5 "Lens registry + clinical as first data-driven lens", item 5
// "Safety tier (CODE, not data)" — mirrors server/lenses/clinical.json's
// safetyTier list as a fixed, code-level set (see safetyTier.ts's header
// comment for why this is a hardcoded mirror, not a fetched value).
import { describe, expect, it } from "vitest";
import { isSafetyTierUnitType, SAFETY_TIER_UNIT_TYPES } from "./safetyTier";
import type { UnitType } from "./types";

describe("isSafetyTierUnitType", () => {
  it("is true for exactly DOSAGE, CONTRAINDICATION, LAB_VALUE, and PRIORITIZATION (D-02)", () => {
    expect(isSafetyTierUnitType("DOSAGE")).toBe(true);
    expect(isSafetyTierUnitType("CONTRAINDICATION")).toBe(true);
    expect(isSafetyTierUnitType("LAB_VALUE")).toBe(true);
    expect(isSafetyTierUnitType("PRIORITIZATION")).toBe(true);
  });

  it("is false for every other unit type", () => {
    const nonSafetyTypes: UnitType[] = ["CLAIM", "MECHANISM", "PROCEDURE", "EXAMPLE", "BOUNDARY", "CLUSTER"];
    for (const type of nonSafetyTypes) expect(isSafetyTierUnitType(type)).toBe(false);
  });

  it("SAFETY_TIER_UNIT_TYPES has exactly four members and no more/fewer than the expected set (D-02)", () => {
    expect(SAFETY_TIER_UNIT_TYPES.size).toBe(4);
    expect([...SAFETY_TIER_UNIT_TYPES].sort()).toEqual(["CONTRAINDICATION", "DOSAGE", "LAB_VALUE", "PRIORITIZATION"].sort());
  });

  it("returns true for all four safety-tier types — the exact predicate UnitProposalCard's verbatim-quote block reads, so PRIORITIZATION units start rendering their quote unconditionally with zero component changes (D-02)", () => {
    const safetyTierTypes: UnitType[] = ["DOSAGE", "CONTRAINDICATION", "LAB_VALUE", "PRIORITIZATION"];
    for (const type of safetyTierTypes) expect(isSafetyTierUnitType(type)).toBe(true);
  });
});
