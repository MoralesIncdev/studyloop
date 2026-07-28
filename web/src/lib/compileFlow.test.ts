import { describe, expect, it } from "vitest";
import { getUncaptionedBubbles } from "./compileFlow";
import type { Bubble } from "./types";

function bubble(overrides: Partial<Bubble>): Bubble {
  return {
    id: overrides.id ?? "b1",
    t: overrides.t ?? 60,
    text: overrides.text ?? "",
    shot: overrides.shot ?? null,
    createdAt: "2026-07-28T00:00:00Z",
    ...overrides,
  };
}

describe("getUncaptionedBubbles", () => {
  it("includes a bubble with a shot and empty text", () => {
    const bubbles = [bubble({ id: "a", shot: "shots/a.jpg", text: "" })];
    expect(getUncaptionedBubbles(bubbles).map((b) => b.id)).toEqual(["a"]);
  });

  it("excludes a bubble with a shot and non-empty text", () => {
    const bubbles = [bubble({ id: "a", shot: "shots/a.jpg", text: "grip fighting" })];
    expect(getUncaptionedBubbles(bubbles)).toEqual([]);
  });

  it("excludes a text-only bubble with no shot, even if text is empty", () => {
    // A screenshot-only capture whose ffmpeg call failed server-side has
    // shot: null but is still a real capture — nothing to caption without an
    // image to look at, so it shouldn't show up in the caption pass.
    const bubbles = [bubble({ id: "a", shot: null, text: "" })];
    expect(getUncaptionedBubbles(bubbles)).toEqual([]);
  });

  it("treats whitespace-only text as uncaptioned", () => {
    const bubbles = [bubble({ id: "a", shot: "shots/a.jpg", text: "   " })];
    expect(getUncaptionedBubbles(bubbles).map((b) => b.id)).toEqual(["a"]);
  });

  it("filters a mixed list down to only the uncaptioned-with-shot bubbles", () => {
    const bubbles = [
      bubble({ id: "captioned", shot: "shots/1.jpg", text: "has a note" }),
      bubble({ id: "uncaptioned-1", shot: "shots/2.jpg", text: "" }),
      bubble({ id: "no-shot", shot: null, text: "" }),
      bubble({ id: "uncaptioned-2", shot: "shots/3.jpg", text: "" }),
    ];
    expect(getUncaptionedBubbles(bubbles).map((b) => b.id)).toEqual(["uncaptioned-1", "uncaptioned-2"]);
  });

  it("returns an empty array for an empty bubble list", () => {
    expect(getUncaptionedBubbles([])).toEqual([]);
  });
});
