import { describe, expect, it } from "vitest";
import { buildMinedText, mineSpan, MINE_BACK_S, MINE_FWD_S, MINE_EXCERPT_CHARS } from "./mining";
import type { TranscriptSegment } from "./types";

const seg = (start: number, end: number, text: string): TranscriptSegment => ({ start, end, text });

describe("mineSpan", () => {
  it("windows around the playhead", () => {
    expect(mineSpan(100, 1800)).toEqual({ start: 100 - MINE_BACK_S, end: 100 + MINE_FWD_S });
  });

  it("clamps to the video bounds", () => {
    expect(mineSpan(5, 1800).start).toBe(0);
    expect(mineSpan(1798, 1800).end).toBe(1800);
  });

  it("tolerates an unknown duration", () => {
    expect(mineSpan(100, 0).end).toBe(100 + MINE_FWD_S);
  });
});

describe("buildMinedText", () => {
  it("includes only segments overlapping the span, in order", () => {
    const segments = [
      seg(0, 5, "way before"),
      seg(90, 95, "leading in"),
      seg(95, 105, "the point itself"),
      seg(120, 130, "way after"),
    ];
    const text = buildMinedText(segments, 100, 1800);
    expect(text).toContain("leading in the point itself");
    expect(text).not.toContain("way before");
    expect(text).not.toContain("way after");
  });

  it("prefixes the span header with timestamps", () => {
    expect(buildMinedText([], 100, 1800)).toMatch(/^\[mined \d+:\d{2}–\d+:\d{2}\]$/);
  });

  it("caps the excerpt length", () => {
    const segments = [seg(95, 105, "x".repeat(2000))];
    const text = buildMinedText(segments, 100, 1800);
    expect(text.length).toBeLessThanOrEqual(MINE_EXCERPT_CHARS + 40);
  });

  it("drops whitespace-only segments", () => {
    const text = buildMinedText([seg(95, 105, "   ")], 100, 1800);
    expect(text).toMatch(/\]$/);
  });
});
