import { describe, expect, it } from "vitest";
import { adjacentConceptTick, conceptLoopSpan, DEFAULT_SPAN_S, MIN_SPAN_S } from "./conceptLoop";

describe("conceptLoopSpan", () => {
  it("spans from the tick to the next concept tick", () => {
    expect(conceptLoopSpan(100, [100, 140, 300], 1800)).toEqual({ start: 100, end: 140 });
  });

  it("caps at DEFAULT_SPAN_S when the next tick is far away", () => {
    expect(conceptLoopSpan(100, [100, 500], 1800)).toEqual({ start: 100, end: 100 + DEFAULT_SPAN_S });
  });

  it("caps at DEFAULT_SPAN_S when there is no next tick", () => {
    expect(conceptLoopSpan(100, [100], 1800)).toEqual({ start: 100, end: 100 + DEFAULT_SPAN_S });
  });

  it("ignores ticks within MIN_SPAN_S so a cluster does not collapse the span", () => {
    const { end } = conceptLoopSpan(100, [100, 100 + MIN_SPAN_S - 1, 130], 1800);
    expect(end).toBe(130);
  });

  it("clamps to duration", () => {
    expect(conceptLoopSpan(1790, [1790], 1800)).toEqual({ start: 1790, end: 1800 });
  });

  it("never returns a span below MIN_SPAN_S even at the video tail", () => {
    const { start, end } = conceptLoopSpan(1795, [1795], 1800);
    expect(end - start).toBeGreaterThanOrEqual(MIN_SPAN_S);
  });

  it("clamps a negative tick time to zero", () => {
    expect(conceptLoopSpan(-5, [], 1800).start).toBe(0);
  });
});

describe("adjacentConceptTick", () => {
  const times = [135, 522, 724, 1170, 1495];

  it("finds the next tick after t", () => {
    expect(adjacentConceptTick(times, 600, "next")).toBe(724);
  });

  it("finds the previous tick before t", () => {
    expect(adjacentConceptTick(times, 600, "prev")).toBe(522);
  });

  it("returns null past the last tick going next", () => {
    expect(adjacentConceptTick(times, 1495, "next")).toBeNull();
  });

  it("returns null before the first tick going prev", () => {
    expect(adjacentConceptTick(times, 135, "prev")).toBeNull();
  });

  it("skips a tick within the 1s dead zone of t itself", () => {
    expect(adjacentConceptTick(times, 724, "next")).toBe(1170);
    expect(adjacentConceptTick(times, 724, "prev")).toBe(522);
  });

  it("returns null with no ticks at all", () => {
    expect(adjacentConceptTick([], 100, "next")).toBeNull();
    expect(adjacentConceptTick([], 100, "prev")).toBeNull();
  });
});
