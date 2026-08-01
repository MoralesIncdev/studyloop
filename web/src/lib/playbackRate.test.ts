import { describe, expect, it } from "vitest";
import { nextPlaybackRate, RATE_CYCLE } from "./playbackRate";

describe("nextPlaybackRate", () => {
  it("advances through the cycle", () => {
    expect(nextPlaybackRate(1)).toBe(1.25);
    expect(nextPlaybackRate(1.25)).toBe(1.5);
    expect(nextPlaybackRate(1.5)).toBe(1.75);
    expect(nextPlaybackRate(1.75)).toBe(2);
  });

  it("wraps from the top back to the bottom", () => {
    expect(nextPlaybackRate(2)).toBe(RATE_CYCLE[0]);
  });

  it("snaps a rate left over from the old settings menu forward to the next cycle value", () => {
    expect(nextPlaybackRate(0.75)).toBe(1);
    expect(nextPlaybackRate(1.6)).toBe(1.75);
  });

  it("wraps a rate above the whole cycle back to the start", () => {
    expect(nextPlaybackRate(2.5)).toBe(RATE_CYCLE[0]);
  });
});
