import { describe, expect, it } from "vitest";
import { bucketize, bubbleHeatmap } from "./heatmap";

describe("bucketize", () => {
  it("returns an all-zero array for zero duration", () => {
    const result = bucketize([{ t: 5, weight: 1 }], 0, 10);
    expect(result).toHaveLength(10);
    expect(result.every((v) => v === 0)).toBe(true);
  });

  it("places points into the correct bucket and normalizes to [0,1]", () => {
    const result = bucketize([{ t: 0, weight: 1 }], 100, 10);
    expect(result).toHaveLength(10);
    expect(Math.max(...result)).toBe(1);
    expect(result.every((v) => v >= 0 && v <= 1)).toBe(true);
  });

  it("ignores out-of-range points", () => {
    const result = bucketize([{ t: -5, weight: 1 }, { t: 1000, weight: 1 }], 100, 10);
    expect(result.every((v) => v === 0)).toBe(true);
  });

  it("smooths density into neighboring buckets (box-blur radius 2)", () => {
    // A single point at bucket index 5 (of 10) spreads into buckets 3..7 —
    // outside that window the box blur contributes nothing.
    const result = bucketize([{ t: 50, weight: 1 }], 100, 10);
    for (let i = 3; i <= 7; i++) expect(result[i]).toBeGreaterThan(0);
    expect(result[0]).toBe(0);
    expect(result[9]).toBe(0);
  });
});

describe("bubbleHeatmap", () => {
  it("weights every bubble equally", () => {
    const result = bubbleHeatmap(
      [
        { id: "1", t: 10, text: "", createdAt: "" },
        { id: "2", t: 90, text: "", createdAt: "" },
      ],
      100,
      10
    );
    expect(result).toHaveLength(10);
    expect(Math.max(...result)).toBe(1);
  });
});
