// V3-B B2 "Attestation + reveal-gating" — pure gating logic.
import { describe, expect, it } from "vitest";
import { attestedCount, emptyAttestations, feedableUnitIds, isUnitFeedable } from "../src/lib/attestation.js";

describe("isUnitFeedable", () => {
  it("is false for a unit with no attestation entry at all", () => {
    expect(isUnitFeedable(undefined)).toBe(false);
  });

  it("is true for an explicitly attested unit", () => {
    expect(isUnitFeedable({ status: "attested", at: "2026-01-01T00:00:00Z" })).toBe(true);
  });

  it("is false for a dismissed unit, even if it somehow also carries a userTake", () => {
    expect(isUnitFeedable({ status: "dismissed", userTake: "my take", at: "2026-01-01T00:00:00Z" })).toBe(false);
  });

  it("is true for a unit with a non-empty userTake but no formal status yet (generation-attempt-only)", () => {
    expect(isUnitFeedable({ userTake: "my own explanation", at: "2026-01-01T00:00:00Z" })).toBe(true);
  });

  it("is false for a unit with only whitespace as its userTake", () => {
    expect(isUnitFeedable({ userTake: "   ", at: "2026-01-01T00:00:00Z" })).toBe(false);
  });

  it("is false for an entry with neither a status nor a userTake (e.g. only userBody edited)", () => {
    expect(isUnitFeedable({ userBody: "edited body", at: "2026-01-01T00:00:00Z" })).toBe(false);
  });
});

describe("feedableUnitIds", () => {
  it("returns only the subset of ids that are feedable", () => {
    const attestations = {
      u1: { status: "attested" as const, at: "t" },
      u2: { status: "dismissed" as const, at: "t" },
      u3: { userTake: "take", at: "t" },
    };
    expect(feedableUnitIds(["u1", "u2", "u3", "u4"], attestations)).toEqual(new Set(["u1", "u3"]));
  });

  it("returns an empty set for an empty attestations file", () => {
    expect(feedableUnitIds(["u1", "u2"], emptyAttestations())).toEqual(new Set());
  });
});

describe("attestedCount", () => {
  it("counts only units with the explicit 'attested' status, not bare userTake-only entries", () => {
    const attestations = {
      u1: { status: "attested" as const, at: "t" },
      u2: { userTake: "take, but never clicked attest", at: "t" },
      u3: { status: "dismissed" as const, at: "t" },
    };
    expect(attestedCount(["u1", "u2", "u3", "u4"], attestations)).toBe(1);
  });
});
