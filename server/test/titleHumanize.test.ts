import { describe, expect, it } from "vitest";
import { humanizeVideoTitle } from "../src/lib/titleHumanize.js";

describe("humanizeVideoTitle", () => {
  it("splits camelCase and a trailing letter/digit boundary (real filename from this library)", () => {
    expect(humanizeVideoTitle("OpenGuardSeatedVolume1")).toBe("Open Guard Seated Volume 1");
  });

  it("produces a sensible split for a longer run-together filename (real filename from this library)", () => {
    expect(humanizeVideoTitle("HighPercentageGiPassesbyGordonRyan1")).toBe(
      "High Percentage Gi Passes by Gordon Ryan 1"
    );
  });

  it("replaces dash/underscore/dot separator runs with a single space", () => {
    expect(humanizeVideoTitle("half_guard-passing.drills")).toBe("Half Guard Passing Drills");
    expect(humanizeVideoTitle("multi___dash---dot...run")).toBe("Multi Dash Dot Run");
  });

  it("splits a leading acronym run from a following capitalized word", () => {
    expect(humanizeVideoTitle("BJJFundamentals")).toBe("BJJ Fundamentals");
  });

  it("preserves a known acronym's canonical casing even when the filename used different casing", () => {
    expect(humanizeVideoTitle("bjj_fundamentals")).toBe("BJJ Fundamentals");
    expect(humanizeVideoTitle("adcc_2024_highlights")).toBe("ADCC 2024 Highlights");
  });

  it("splits digit-to-letter boundaries too", () => {
    expect(humanizeVideoTitle("3PointStance")).toBe("3 Point Stance");
  });

  it("collapses accidental double spaces and trims", () => {
    expect(humanizeVideoTitle("  double   space  title  ")).toBe("Double Space Title");
  });

  it("returns an empty string unchanged rather than throwing", () => {
    expect(humanizeVideoTitle("")).toBe("");
    expect(humanizeVideoTitle("   ")).toBe("");
  });

  it("leaves an already-spaced, already-capitalized title essentially unchanged", () => {
    expect(humanizeVideoTitle("Half Guard Passing")).toBe("Half Guard Passing");
  });

  describe("redundant series-name prefix stripping", () => {
    it("strips the series name when the title is just the series + a bare volume index (real filename from this library)", () => {
      expect(
        humanizeVideoTitle("Getting Swole as A Grappler by Gordon Ryan Vol 2", "Getting Swole as A Grappler by Gordon Ryan")
      ).toBe("Vol 2");
    });

    it("strips the series name for a bare numeric suffix with no 'Vol' word", () => {
      expect(humanizeVideoTitle("OpenGuardSeated3", "OpenGuardSeated")).toBe("3");
    });

    it("does not strip when the remainder is a real subtitle, not just an index", () => {
      const title = humanizeVideoTitle("Open Guard Seated - The Finer Details", "Open Guard Seated");
      expect(title).toBe("Open Guard Seated The Finer Details");
    });

    it("does not strip when the title doesn't start with the series name at all", () => {
      // Real case: the series folder is named after the instructor + technique,
      // but the video file itself is just named after the technique — no shared prefix to strip.
      expect(humanizeVideoTitle("OpenGuardSeatedVolume1", "Gordon Ryan - Systematically Attacking From Open Guard Seated Position")).toBe(
        "Open Guard Seated Volume 1"
      );
    });

    it("keeps the full humanized title when it equals the series name exactly (nothing left to show)", () => {
      expect(humanizeVideoTitle("Open Guard Seated", "Open Guard Seated")).toBe("Open Guard Seated");
    });

    it("is a no-op when no series is given", () => {
      expect(humanizeVideoTitle("OpenGuardSeatedVolume1", undefined)).toBe("Open Guard Seated Volume 1");
      expect(humanizeVideoTitle("OpenGuardSeatedVolume1", null)).toBe("Open Guard Seated Volume 1");
    });
  });
});

describe("authorship 'by' splitting", () => {
  it("splits a glued authorship 'by' before a capitalized name", () => {
    expect(humanizeVideoTitle("SweepTheWorldbyBernardoFaria")).toBe(
      "Sweep The World by Bernardo Faria",
    );
  });

  it("never splits short real words ending in 'by'", () => {
    expect(humanizeVideoTitle("RubyGordon")).toBe("Ruby Gordon");
    expect(humanizeVideoTitle("BabyShark")).toBe("Baby Shark");
  });
});
