// V3-B B2 "Attestation + reveal-gating" — pure gating logic.
import { describe, expect, it } from "vitest";
import {
  attestedCount,
  AttestationPatchBodySchema,
  canAddAttestationEntry,
  emptyAttestations,
  feedableUnitIds,
  isUnitFeedable,
  MAX_ATTESTATIONS_PER_PROJECT,
  MAX_USER_BODY_CHARS,
  MAX_USER_TAKE_CHARS,
  restatedCount,
} from "../src/lib/attestation.js";

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

describe("restatedCount", () => {
  it("counts an attested unit with a non-empty userTake as restated", () => {
    const attestations = {
      u1: { status: "attested" as const, userTake: "my own explanation", at: "t" },
    };
    expect(restatedCount(["u1"], attestations)).toBe(1);
  });

  it("does not count an attested unit with an empty-string userTake", () => {
    const attestations = {
      u1: { status: "attested" as const, userTake: "", at: "t" },
    };
    expect(restatedCount(["u1"], attestations)).toBe(0);
  });

  it("does not count an attested unit whose userTake is whitespace-only", () => {
    const attestations = {
      u1: { status: "attested" as const, userTake: "   ", at: "t" },
    };
    expect(restatedCount(["u1"], attestations)).toBe(0);
  });

  it("does not count an attested unit with no userTake at all (bare Attest click — 'claimed')", () => {
    const attestations = {
      u1: { status: "attested" as const, at: "t" },
    };
    expect(restatedCount(["u1"], attestations)).toBe(0);
  });

  it("does not count a dismissed unit, even with a non-empty userTake", () => {
    const attestations = {
      u1: { status: "dismissed" as const, userTake: "my own explanation", at: "t" },
    };
    expect(restatedCount(["u1"], attestations)).toBe(0);
  });

  it("does not count a unit with a userTake but no explicit 'attested' status (feedable, but not attested/restated)", () => {
    const attestations = {
      u1: { userTake: "my own explanation", at: "t" },
    };
    expect(restatedCount(["u1"], attestations)).toBe(0);
  });

  it("is never greater than attestedCount across a mixed set", () => {
    const attestations = {
      u1: { status: "attested" as const, userTake: "restated", at: "t" },
      u2: { status: "attested" as const, at: "t" },
      u3: { status: "attested" as const, userTake: "   ", at: "t" },
      u4: { status: "dismissed" as const, userTake: "restated", at: "t" },
      u5: { userTake: "restated, no status", at: "t" },
    };
    const ids = ["u1", "u2", "u3", "u4", "u5", "u6"];
    expect(attestedCount(ids, attestations)).toBe(3);
    expect(restatedCount(ids, attestations)).toBe(1);
  });
});

// --- V3-B review finding #9: attestation mutation input bounds -------------

describe("AttestationPatchBodySchema", () => {
  it("accepts a userTake at exactly the max length", () => {
    expect(AttestationPatchBodySchema.safeParse({ userTake: "x".repeat(MAX_USER_TAKE_CHARS) }).success).toBe(true);
  });

  it("rejects a userTake one character over the max length", () => {
    expect(AttestationPatchBodySchema.safeParse({ userTake: "x".repeat(MAX_USER_TAKE_CHARS + 1) }).success).toBe(false);
  });

  it("accepts a userBody at exactly the max length", () => {
    expect(AttestationPatchBodySchema.safeParse({ userBody: "x".repeat(MAX_USER_BODY_CHARS) }).success).toBe(true);
  });

  it("rejects a userBody one character over the max length", () => {
    expect(AttestationPatchBodySchema.safeParse({ userBody: "x".repeat(MAX_USER_BODY_CHARS + 1) }).success).toBe(false);
  });

  it("still accepts a bare status-only body (no userTake/userBody)", () => {
    expect(AttestationPatchBodySchema.safeParse({ status: "attested" }).success).toBe(true);
  });
});

describe("canAddAttestationEntry", () => {
  it("always allows updating an existing entry, even at/over the cap", () => {
    expect(canAddAttestationEntry(MAX_ATTESTATIONS_PER_PROJECT, false)).toBe(true);
    expect(canAddAttestationEntry(MAX_ATTESTATIONS_PER_PROJECT + 5, false)).toBe(true);
  });

  it("allows a new entry while under the cap", () => {
    expect(canAddAttestationEntry(MAX_ATTESTATIONS_PER_PROJECT - 1, true)).toBe(true);
  });

  it("rejects a new entry once the map is already at the cap", () => {
    expect(canAddAttestationEntry(MAX_ATTESTATIONS_PER_PROJECT, true)).toBe(false);
  });
});
