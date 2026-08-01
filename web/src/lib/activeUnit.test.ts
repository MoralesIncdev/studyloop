import { describe, expect, it } from "vitest";
import { activeUnitAt, drillFor, ACTIVE_UNIT_WINDOW_S } from "./activeUnit";
import type { AnalysisUnit, UnitOverlay } from "./types";

const unit = (id: string, ts: number[], overlay?: UnitOverlay): AnalysisUnit => ({
  id,
  type: "PROCEDURE",
  label: id,
  summary: "",
  body: "",
  anchors: ts.map((t) => ({ t, quote: "" })),
  confidence: 0.9,
  overlay,
  threshold: false,
});

describe("activeUnitAt", () => {
  it("returns null when nothing covers the playhead", () => {
    expect(activeUnitAt([unit("a", [100])], 100 + ACTIVE_UNIT_WINDOW_S + 1)).toBeNull();
  });

  it("picks the latest qualifying anchor across units", () => {
    const early = unit("early", [100]);
    const late = unit("late", [140]);
    expect(activeUnitAt([early, late], 150)?.unit.id).toBe("late");
  });

  it("is inclusive at the window edges", () => {
    expect(activeUnitAt([unit("a", [100])], 100)?.t).toBe(100);
    expect(activeUnitAt([unit("a", [100])], 100 + ACTIVE_UNIT_WINDOW_S)?.t).toBe(100);
  });
});

describe("drillFor", () => {
  it("returns null without an overlay", () => {
    expect(drillFor(unit("a", [100]))).toBeNull();
  });

  it("returns null when the overlay has no drill fields", () => {
    expect(drillFor(unit("a", [100], { entities: ["x"] }))).toBeNull();
    expect(drillFor(unit("a", [100], { triggers: [], failureModes: [], drillPairing: "  " }))).toBeNull();
  });

  it("returns content when any drill field is populated", () => {
    expect(drillFor(unit("a", [100], { triggers: ["collar reach"] }))).toEqual({
      triggers: ["collar reach"],
      failureModes: [],
      drillPairing: null,
    });
    expect(drillFor(unit("a", [100], { drillPairing: "3x frame-then-grip" }))?.drillPairing).toBe(
      "3x frame-then-grip"
    );
  });
});
