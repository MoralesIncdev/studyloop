import { describe, expect, it } from "vitest";
import { suggestedCueAt, SUGGESTED_CUE_WINDOW_S } from "./suggestedCues";
import type { AnalysisUnit, AttestationsFile } from "./types";

const unit = (id: string, anchors: { t: number; quote: string }[]): AnalysisUnit => ({
  id,
  type: "CLAIM",
  label: id,
  summary: "",
  body: "",
  anchors,
  confidence: 0.9,
  threshold: false,
});

describe("suggestedCueAt", () => {
  it("returns null with nothing covering the playhead", () => {
    expect(suggestedCueAt([unit("a", [{ t: 100, quote: "hello" }])], {}, 100 + SUGGESTED_CUE_WINDOW_S + 1)).toBeNull();
  });

  it("returns null for a quote-less anchor", () => {
    expect(suggestedCueAt([unit("a", [{ t: 100, quote: "   " }])], {}, 100)).toBeNull();
  });

  it("skips attested and dismissed units", () => {
    const units = [unit("a", [{ t: 100, quote: "attested one" }])];
    const attested: AttestationsFile = { a: { status: "attested", at: "" } };
    const dismissed: AttestationsFile = { a: { status: "dismissed", at: "" } };
    expect(suggestedCueAt(units, attested, 100)).toBeNull();
    expect(suggestedCueAt(units, dismissed, 100)).toBeNull();
  });

  it("returns the quote for a pending unit covering the playhead", () => {
    const units = [unit("a", [{ t: 100, quote: "elbow glued, knee follows" }])];
    expect(suggestedCueAt(units, {}, 110)).toEqual({ unitId: "a", quote: "elbow glued, knee follows", t: 100 });
  });

  it("picks the latest qualifying anchor across units", () => {
    const units = [unit("early", [{ t: 100, quote: "first" }]), unit("late", [{ t: 140, quote: "second" }])];
    expect(suggestedCueAt(units, {}, 150)?.unitId).toBe("late");
  });

  it("trims quote whitespace", () => {
    const units = [unit("a", [{ t: 100, quote: "  spaced out  " }])];
    expect(suggestedCueAt(units, {}, 100)?.quote).toBe("spaced out");
  });
});
