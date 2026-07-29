import { describe, expect, it } from "vitest";
import { clipBounds } from "./reviewClip";

describe("clipBounds", () => {
  it("centers a 10s window on t", () => {
    expect(clipBounds(30)).toEqual({ start: 25, end: 35 });
  });

  it("clamps start at 0 for a timestamp near the start of the video", () => {
    expect(clipBounds(3)).toEqual({ start: 0, end: 8 });
  });

  it("clamps start at 0 for t === 0", () => {
    expect(clipBounds(0)).toEqual({ start: 0, end: 5 });
  });
});
