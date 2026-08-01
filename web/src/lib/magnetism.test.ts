import { describe, expect, it } from "vitest";
import { GRID_ORIGIN_PX, magnetize, snapTargetsFor, type Rect } from "./magnetism";

describe("snapTargetsFor", () => {
  it("always offers the grid origin on both axes", () => {
    expect(snapTargetsFor(300, [])).toEqual({ xs: [GRID_ORIGIN_PX], ys: [GRID_ORIGIN_PX] });
  });

  it("adds each other pane's left edge, own-width-adjusted right edge, and top edge", () => {
    const other: Rect = { x: 100, y: 50, w: 200, h: 80 };
    const { xs, ys } = snapTargetsFor(300, [other]);
    expect(xs).toContain(100); // other's left edge
    expect(xs).toContain(100 + 200 - 300); // other's right edge minus dragged width
    expect(ys).toContain(50);
  });
});

describe("magnetize", () => {
  it("snaps to the grid origin when within threshold", () => {
    const result = magnetize(27, 20, 300, []);
    expect(result).toEqual({ x: GRID_ORIGIN_PX, y: GRID_ORIGIN_PX, snappedX: true, snappedY: true });
  });

  it("passes through unchanged when nothing is within threshold", () => {
    const result = magnetize(500, 400, 300, []);
    expect(result).toEqual({ x: 500, y: 400, snappedX: false, snappedY: false });
  });

  it("snaps to another pane's left edge", () => {
    const other: Rect = { x: 400, y: 200, w: 200, h: 80 };
    const result = magnetize(403, 205, 300, [other]);
    expect(result.x).toBe(400);
    expect(result.y).toBe(200);
    expect(result.snappedX).toBe(true);
    expect(result.snappedY).toBe(true);
  });

  it("snaps to another pane's right edge (dragged pane's own width offset)", () => {
    const other: Rect = { x: 100, y: 50, w: 200, h: 80 };
    // other's right edge is 300; a 250-wide dragged pane lining its own right
    // edge up with 300 sits at x = 300 - 250 = 50.
    const result = magnetize(53, 999, 250, [other]);
    expect(result.x).toBe(50);
    expect(result.snappedX).toBe(true);
  });

  it("first candidate within threshold wins when multiple qualify", () => {
    const a: Rect = { x: 24, y: 24, w: 100, h: 50 };
    // Grid origin (24) and pane a's left edge (24) coincide — still a single
    // unambiguous snap.
    const result = magnetize(26, 26, 300, [a]);
    expect(result.x).toBe(24);
  });

  it("ignores panes explicitly excluded by the caller (hidden/parked panes)", () => {
    // Caller is responsible for filtering `others` — verify a pane NOT passed
    // in has no effect, i.e. an empty list behaves like "everyone hidden".
    const result = magnetize(403, 205, 300, []);
    expect(result.snappedX).toBe(false);
    expect(result.snappedY).toBe(false);
  });
});
