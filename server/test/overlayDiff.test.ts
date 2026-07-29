import { describe, expect, it } from "vitest";
import { diffMarks, type Mark } from "../src/lib/overlayDiff.js";

function mark(overrides: Partial<Mark> = {}): Mark {
  return { t: 0, kind: "bubble", text: "text", author: "handle", ...overrides };
}

describe("diffMarks — basic set difference", () => {
  it("returns [] for two empty arrays", () => {
    expect(diffMarks([], [])).toEqual([]);
  });

  it("returns [] when imported is empty regardless of own", () => {
    expect(diffMarks([], [mark({ t: 10 })])).toEqual([]);
  });

  it("returns every imported mark when own is empty", () => {
    const imported = [mark({ t: 10 }), mark({ t: 200 })];
    expect(diffMarks(imported, [])).toHaveLength(2);
  });

  it("excludes an imported mark that has a matching own mark within tolerance", () => {
    const imported = [mark({ t: 100 })];
    const own = [mark({ t: 105 })];
    expect(diffMarks(imported, own, 15)).toEqual([]);
  });

  it("keeps an imported mark with no nearby own mark", () => {
    const imported = [mark({ t: 100, text: "unmatched" })];
    const own = [mark({ t: 500 })];
    const result = diffMarks(imported, own, 15);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("unmatched");
  });
});

describe("diffMarks — tolerance boundary", () => {
  it("treats a mark exactly at the tolerance boundary as matched (excluded)", () => {
    const imported = [mark({ t: 100 })];
    const own = [mark({ t: 115 })]; // exactly 15s away
    expect(diffMarks(imported, own, 15)).toEqual([]);
  });

  it("treats a mark 1 second beyond the tolerance boundary as unmatched (kept)", () => {
    const imported = [mark({ t: 100 })];
    const own = [mark({ t: 116 })]; // 16s away
    expect(diffMarks(imported, own, 15)).toHaveLength(1);
  });

  it("matches symmetrically regardless of which side is earlier", () => {
    const importedBefore = [mark({ t: 90 })];
    const own = [mark({ t: 100 })];
    expect(diffMarks(importedBefore, own, 15)).toEqual([]);
    const importedAfter = [mark({ t: 110 })];
    expect(diffMarks(importedAfter, own, 15)).toEqual([]);
  });

  it("respects a custom tolerance window", () => {
    const imported = [mark({ t: 100 })];
    const own = [mark({ t: 103 })];
    expect(diffMarks(imported, own, 2)).toHaveLength(1); // 3s apart, tolerance 2s
    expect(diffMarks(imported, own, 5)).toEqual([]); // 3s apart, tolerance 5s
  });

  it("defaults to a 15s tolerance when none is given", () => {
    const imported = [mark({ t: 100 })];
    const own = [mark({ t: 114 })];
    expect(diffMarks(imported, own)).toEqual([]);
    const ownFar = [mark({ t: 120 })];
    expect(diffMarks(imported, ownFar)).toHaveLength(1);
  });
});

describe("diffMarks — dedup of own marks", () => {
  it("dedupes duplicate own timestamps before matching (doesn't crash or double-count)", () => {
    const imported = [mark({ t: 500 })];
    const own = [mark({ t: 100 }), mark({ t: 100 }), mark({ t: 100 })];
    expect(diffMarks(imported, own, 15)).toHaveLength(1);
  });
});

describe("diffMarks — sort order", () => {
  it("sorts pearls before bubbles regardless of input order", () => {
    const imported: Mark[] = [
      mark({ t: 10, kind: "bubble", text: "bubble-early" }),
      mark({ t: 500, kind: "pearl", importance: 1, text: "pearl-late" }),
    ];
    const result = diffMarks(imported, []);
    expect(result[0].kind).toBe("pearl");
    expect(result[1].kind).toBe("bubble");
  });

  it("sorts pearls by importance descending", () => {
    const imported: Mark[] = [
      mark({ t: 10, kind: "pearl", importance: 1, text: "low" }),
      mark({ t: 20, kind: "pearl", importance: 3, text: "high" }),
      mark({ t: 30, kind: "pearl", importance: 2, text: "mid" }),
    ];
    const result = diffMarks(imported, []);
    expect(result.map((m) => m.text)).toEqual(["high", "mid", "low"]);
  });

  it("treats a pearl with no importance field as importance 1", () => {
    const imported: Mark[] = [
      mark({ t: 10, kind: "pearl", importance: undefined, text: "defaulted" }),
      mark({ t: 20, kind: "pearl", importance: 3, text: "explicit-high" }),
    ];
    const result = diffMarks(imported, []);
    expect(result.map((m) => m.text)).toEqual(["explicit-high", "defaulted"]);
  });

  it("breaks pearl importance ties by time ascending", () => {
    const imported: Mark[] = [
      mark({ t: 300, kind: "pearl", importance: 2, text: "later" }),
      mark({ t: 100, kind: "pearl", importance: 2, text: "earlier" }),
    ];
    const result = diffMarks(imported, []);
    expect(result.map((m) => m.text)).toEqual(["earlier", "later"]);
  });

  it("sorts bubbles among themselves by time ascending", () => {
    const imported: Mark[] = [
      mark({ t: 300, kind: "bubble", text: "later" }),
      mark({ t: 100, kind: "bubble", text: "earlier" }),
    ];
    const result = diffMarks(imported, []);
    expect(result.map((m) => m.text)).toEqual(["earlier", "later"]);
  });

  it("full mixed ordering: importance-3 pearl, importance-1 pearl, then bubbles by time", () => {
    const imported: Mark[] = [
      mark({ t: 400, kind: "bubble", text: "bubble-late" }),
      mark({ t: 50, kind: "pearl", importance: 1, text: "pearl-low" }),
      mark({ t: 200, kind: "bubble", text: "bubble-early" }),
      mark({ t: 10, kind: "pearl", importance: 3, text: "pearl-high" }),
    ];
    const result = diffMarks(imported, []);
    expect(result.map((m) => m.text)).toEqual(["pearl-high", "pearl-low", "bubble-early", "bubble-late"]);
  });
});

describe("diffMarks — edge cases", () => {
  it("handles a large own array without pathological slowness (smoke test)", () => {
    const own = Array.from({ length: 2000 }, (_, i) => mark({ t: i }));
    const imported = [mark({ t: 500.5 })]; // between two own marks, both just outside 15s? actually within tolerance of 500 or 501
    const result = diffMarks(imported, own, 15);
    // t=500.5 is within 15s of own t=500 -> matched, excluded.
    expect(result).toEqual([]);
  });

  it("an imported mark with no own marks at all is always kept", () => {
    const imported = [mark({ t: 0 })];
    expect(diffMarks(imported, [])).toHaveLength(1);
  });
});
