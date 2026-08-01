import { describe, expect, it } from "vitest";
import { conceptLoopSpan, DEFAULT_SPAN_S, MIN_SPAN_S } from "./conceptLoop";

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
