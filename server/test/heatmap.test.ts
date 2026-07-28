import { describe, expect, it } from "vitest";
import { bucketizeHeatmap, gaussianKernel, gaussianSmooth, HEATMAP_BUCKET_COUNT, type HeatmapPoint } from "../src/lib/heatmap.js";

describe("gaussianKernel", () => {
  it("is normalized (sums to 1)", () => {
    const kernel = gaussianKernel(2);
    const sum = kernel.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 6);
  });

  it("is symmetric and peaks at the center", () => {
    const kernel = gaussianKernel(3, 5);
    const mid = (kernel.length - 1) / 2;
    for (let i = 1; i <= mid; i++) {
      expect(kernel[mid - i]).toBeCloseTo(kernel[mid + i], 10);
    }
    expect(kernel[mid]).toBe(Math.max(...kernel));
  });

  it("has length 2*radius+1", () => {
    expect(gaussianKernel(1, 4)).toHaveLength(9);
  });
});

describe("gaussianSmooth", () => {
  it("returns [] for an empty input", () => {
    expect(gaussianSmooth([])).toEqual([]);
  });

  it("returns the input unchanged for sigma <= 0", () => {
    expect(gaussianSmooth([1, 2, 3], 0)).toEqual([1, 2, 3]);
  });

  it("spreads a single spike into neighboring buckets", () => {
    const input = new Array(21).fill(0);
    input[10] = 100;
    const smoothed = gaussianSmooth(input, 2);
    expect(smoothed[10]).toBeGreaterThan(0);
    expect(smoothed[10]).toBeLessThan(100); // some mass spread away from the center
    expect(smoothed[9]).toBeGreaterThan(0);
    expect(smoothed[11]).toBeGreaterThan(0);
    // Symmetric spread around the spike.
    expect(smoothed[9]).toBeCloseTo(smoothed[11], 6);
    expect(smoothed[8]).toBeCloseTo(smoothed[12], 6);
  });

  it("preserves total mass approximately (away from edges)", () => {
    const input = new Array(41).fill(0);
    input[20] = 100;
    const smoothed = gaussianSmooth(input, 2);
    const total = smoothed.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(100, 0);
  });

  it("does not wrap around or bleed past array edges", () => {
    const input = [100, 0, 0, 0, 0];
    const smoothed = gaussianSmooth(input, 1);
    // A spike at index 0 must not push mass onto a wrapped "index -1" (== last index).
    expect(smoothed[4]).toBe(0);
  });
});

describe("bucketizeHeatmap", () => {
  it("returns an all-zero array of the requested length for a non-positive duration", () => {
    const result = bucketizeHeatmap([{ t: 5, weight: 1 }], 0, 10);
    expect(result).toEqual(new Array(10).fill(0));
  });

  it("returns an all-zero array when there are no points", () => {
    const result = bucketizeHeatmap([], 100, 10);
    expect(result.every((v) => v === 0)).toBe(true);
    expect(result).toHaveLength(10);
  });

  it("normalizes output to [0, 1] with the peak bucket at (or very near) 1", () => {
    const points: HeatmapPoint[] = [{ t: 50, weight: 5 }];
    const result = bucketizeHeatmap(points, 100, 20, 0.1); // near-zero sigma keeps the peak sharp
    expect(Math.max(...result)).toBeCloseTo(1, 5);
    expect(result.every((v) => v >= 0 && v <= 1)).toBe(true);
  });

  it("weights sum within a bucket — two points in the same bucket outweigh one point elsewhere", () => {
    const points: HeatmapPoint[] = [
      { t: 10, weight: 1 },
      { t: 11, weight: 1 },
      { t: 90, weight: 1 },
    ];
    const result = bucketizeHeatmap(points, 100, 10, 0); // sigma 0 => no smoothing, easy to reason about
    // bucketDuration = 10, so t=10 and t=11 both land in bucket 1; t=90 lands in bucket 9.
    expect(result[1]).toBeGreaterThan(result[9]);
  });

  it("drops points outside [0, duration]", () => {
    const points: HeatmapPoint[] = [
      { t: -5, weight: 1 },
      { t: 1000, weight: 1 },
    ];
    const result = bucketizeHeatmap(points, 100, 10);
    expect(result.every((v) => v === 0)).toBe(true);
  });

  it("drops points with non-positive weight", () => {
    const result = bucketizeHeatmap([{ t: 50, weight: 0 }, { t: 50, weight: -1 }], 100, 10);
    expect(result.every((v) => v === 0)).toBe(true);
  });

  it("respects a point exactly at t=duration (bucket edge, inclusive)", () => {
    const result = bucketizeHeatmap([{ t: 100, weight: 1 }], 100, 10, 0);
    expect(result.some((v) => v > 0)).toBe(true);
  });

  it("respects a point exactly at t=0 (bucket edge, inclusive)", () => {
    const result = bucketizeHeatmap([{ t: 0, weight: 1 }], 100, 10, 0);
    expect(result[0]).toBeGreaterThan(0);
  });

  it("defaults to HEATMAP_BUCKET_COUNT buckets", () => {
    expect(bucketizeHeatmap([{ t: 1, weight: 1 }], 100)).toHaveLength(HEATMAP_BUCKET_COUNT);
  });

  it("floors a fractional bucketCount to a whole number of buckets", () => {
    expect(bucketizeHeatmap([], 100, 5.9)).toHaveLength(5);
  });

  it("never returns NaN, even with degenerate inputs", () => {
    const result = bucketizeHeatmap([{ t: 0, weight: 1 }], 100, 1);
    expect(result.every((v) => Number.isFinite(v))).toBe(true);
  });
});
