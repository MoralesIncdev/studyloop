import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bucketIndexForTime,
  hasSeenAttentionLegend,
  markAttentionLegendSeen,
  marksForClickRatio,
  marksNearBucket,
} from "./attentionHeatmap";
import type { HeatmapMark } from "./types";

function mark(overrides: Partial<HeatmapMark> = {}): HeatmapMark {
  return { t: 0, kind: "bubble", text: "text", author: "You", ...overrides };
}

describe("bucketIndexForTime", () => {
  it("computes the bucket a timestamp falls into", () => {
    expect(bucketIndexForTime(25, 100, 10)).toBe(2);
    expect(bucketIndexForTime(0, 100, 10)).toBe(0);
    expect(bucketIndexForTime(99, 100, 10)).toBe(9);
  });

  it("clamps t exactly at duration to the last bucket", () => {
    expect(bucketIndexForTime(100, 100, 10)).toBe(9);
  });

  it("returns 0 for non-positive duration/bucketCount", () => {
    expect(bucketIndexForTime(50, 0, 10)).toBe(0);
    expect(bucketIndexForTime(50, 100, 0)).toBe(0);
  });
});

describe("marksNearBucket", () => {
  it("matches the server's marksNearBucket semantics: includes ±1 bucket", () => {
    const marks = [mark({ t: 15, text: "b1" }), mark({ t: 25, text: "b2" }), mark({ t: 35, text: "b3" })];
    const result = marksNearBucket(marks, 2, 10, 100);
    expect(result.map((m) => m.text).sort()).toEqual(["b1", "b2", "b3"]);
  });

  it("excludes marks 2+ buckets away", () => {
    const marks = [mark({ t: 5, text: "far" }), mark({ t: 25, text: "near" })];
    expect(marksNearBucket(marks, 2, 10, 100).map((m) => m.text)).toEqual(["near"]);
  });
});

describe("marksForClickRatio", () => {
  it("resolves a click ratio to the marks in that bucket across both layers, own first then sorted by time", () => {
    const own = [mark({ t: 25, text: "own-mark", author: "You" })];
    const overlays = [mark({ t: 20, text: "overlay-mark", author: "friend" })];
    const result = marksForClickRatio(0.25, 100, 10, own, overlays); // ratio 0.25 -> t=25 -> bucket 2
    expect(result.map((m) => m.text)).toEqual(["overlay-mark", "own-mark"]); // sorted by time: 20 before 25
  });

  it("clamps an out-of-range ratio", () => {
    const own = [mark({ t: 0, text: "start" })];
    expect(marksForClickRatio(-1, 100, 10, own, [])).toHaveLength(1);
    expect(marksForClickRatio(2, 100, 10, own, [])).toEqual([]);
  });
});

describe("attention legend one-time flag", () => {
  function fakeWindow(initialStorage: Record<string, string> = {}): { localStorage: Storage } {
    const backing = new Map(Object.entries(initialStorage));
    return {
      localStorage: {
        getItem: (k: string) => (backing.has(k) ? backing.get(k)! : null),
        setItem: (k: string, v: string) => {
          backing.set(k, v);
        },
        removeItem: (k: string) => backing.delete(k),
        clear: () => backing.clear(),
        key: () => null,
        get length() {
          return backing.size;
        },
      } as Storage,
    };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns true (already-seen) when window is unavailable, so it never nags in non-browser environments", () => {
    expect(hasSeenAttentionLegend()).toBe(true);
  });

  it("returns false the first time, then true after markAttentionLegendSeen()", () => {
    vi.stubGlobal("window", fakeWindow({}));
    expect(hasSeenAttentionLegend()).toBe(false);
    markAttentionLegendSeen();
    expect(hasSeenAttentionLegend()).toBe(true);
  });

  it("respects a pre-existing seen flag", () => {
    vi.stubGlobal("window", fakeWindow({ "studyloop:attentionLegendSeen": "1" }));
    expect(hasSeenAttentionLegend()).toBe(true);
  });
});
