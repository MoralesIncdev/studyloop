import { describe, expect, it } from "vitest";
import {
  buildLayeredHeatmap,
  bucketizeHeatmap,
  gaussianKernel,
  gaussianSmooth,
  HEATMAP_BUCKET_COUNT,
  marksNearBucket,
  type HeatmapMark,
  type HeatmapPoint,
  type LayeredHeatmapInput,
} from "../src/lib/heatmap.js";

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

// V3-C C5 "Attention heatmap" (PEDAGOGY.md §7) — own/overlay layers built
// and normalized independently.
describe("buildLayeredHeatmap", () => {
  function input(overrides: Partial<LayeredHeatmapInput> = {}): LayeredHeatmapInput {
    return { ownBubbles: [], ownPearls: [], overlayBubbles: [], overlayPearls: [], ...overrides };
  }

  it("returns an all-zero own layer and all-zero overlays layer when there's no data at all", () => {
    const result = buildLayeredHeatmap(input(), 100, 10, 0);
    expect(result.own).toEqual(new Array(10).fill(0));
    expect(result.overlays).toEqual(new Array(10).fill(0));
    expect(result.marks.own).toEqual([]);
    expect(result.marks.overlays).toEqual([]);
  });

  it("normalizes the own and overlays layers independently — a single overlay mark still peaks at 1", () => {
    // Own has 3 bubbles concentrated in one bucket; overlays has a single,
    // much smaller mark elsewhere. Independent normalization means BOTH
    // layers still peak at ~1 — neither is visually dwarfed by the other.
    const result = buildLayeredHeatmap(
      input({
        ownBubbles: [{ t: 10, text: "a" }, { t: 10, text: "b" }, { t: 10, text: "c" }],
        overlayBubbles: [{ t: 90, text: "x", author: "friend" }],
      }),
      100,
      10,
      0
    );
    expect(Math.max(...result.own)).toBeCloseTo(1, 5);
    expect(Math.max(...result.overlays)).toBeCloseTo(1, 5);
  });

  it("weights own pearls by importance, same as bubbles=1, within the own layer", () => {
    const result = buildLayeredHeatmap(
      input({
        ownBubbles: [{ t: 10, text: "a" }],
        ownPearls: [{ t: 90, label: "big pearl", importance: 3 }],
      }),
      100,
      10,
      0
    );
    // bucket for t=10 (weight 1) vs bucket for t=90 (weight 3) — the pearl's bucket must be strictly higher.
    expect(result.own[9]).toBeGreaterThan(result.own[1]);
  });

  it("labels own marks with author 'You' and overlay marks with the bundle's shareHandle", () => {
    const result = buildLayeredHeatmap(
      input({
        ownBubbles: [{ t: 10, text: "mine" }],
        overlayBubbles: [{ t: 20, text: "theirs", author: "gordon" }],
      }),
      100,
      10,
      0
    );
    expect(result.marks.own[0]).toMatchObject({ author: "You", kind: "bubble", text: "mine" });
    expect(result.marks.overlays[0]).toMatchObject({ author: "gordon", kind: "bubble", text: "theirs" });
  });

  it("falls back to '(no caption)' for a bubble with empty text, in both layers", () => {
    const result = buildLayeredHeatmap(
      input({ ownBubbles: [{ t: 10, text: "" }], overlayBubbles: [{ t: 20, text: "", author: "x" }] }),
      100,
      10,
      0
    );
    expect(result.marks.own[0].text).toBe("(no caption)");
    expect(result.marks.overlays[0].text).toBe("(no caption)");
  });

  it("combines multiple overlay bundles into a single overlays layer (not one per handle)", () => {
    const result = buildLayeredHeatmap(
      input({
        overlayBubbles: [{ t: 10, text: "a", author: "alice" }, { t: 10, text: "b", author: "bob" }],
      }),
      100,
      10,
      0
    );
    expect(result.marks.overlays).toHaveLength(2);
    expect(new Set(result.marks.overlays.map((m) => m.author))).toEqual(new Set(["alice", "bob"]));
  });
});

describe("marksNearBucket", () => {
  function mark(overrides: Partial<HeatmapMark> = {}): HeatmapMark {
    return { t: 0, kind: "bubble", text: "text", author: "You", ...overrides };
  }

  it("includes a mark exactly in the target bucket", () => {
    // duration 100, bucketCount 10 -> bucketDuration 10; t=25 -> bucket 2.
    const marks = [mark({ t: 25 })];
    expect(marksNearBucket(marks, 2, 10, 100)).toHaveLength(1);
  });

  it("includes marks in the ±1 neighboring buckets", () => {
    const marks = [mark({ t: 15, text: "bucket1" }), mark({ t: 25, text: "bucket2" }), mark({ t: 35, text: "bucket3" })];
    const result = marksNearBucket(marks, 2, 10, 100);
    expect(result.map((m) => m.text).sort()).toEqual(["bucket1", "bucket2", "bucket3"]);
  });

  it("excludes marks 2+ buckets away", () => {
    const marks = [mark({ t: 5, text: "bucket0" }), mark({ t: 25, text: "bucket2" })];
    const result = marksNearBucket(marks, 2, 10, 100);
    expect(result.map((m) => m.text)).toEqual(["bucket2"]);
  });

  it("returns [] for a non-positive duration or bucketCount", () => {
    expect(marksNearBucket([mark({ t: 5 })], 0, 10, 0)).toEqual([]);
    expect(marksNearBucket([mark({ t: 5 })], 0, 0, 100)).toEqual([]);
  });

  it("drops marks outside [0, duration]", () => {
    const marks = [mark({ t: -5 }), mark({ t: 1000 })];
    expect(marksNearBucket(marks, 0, 10, 100)).toEqual([]);
  });
});
