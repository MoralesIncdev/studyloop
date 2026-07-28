import { describe, expect, it } from "vitest";
import { activeConcepts, activeSegmentIndex, passedConcepts } from "./selectors";
import type { ConceptCard, TranscriptSegment } from "./types";

const segments: TranscriptSegment[] = [
  { start: 0, end: 10, text: "intro" },
  { start: 10, end: 25, text: "middle" },
  { start: 25, end: 40, text: "end" },
];

describe("activeSegmentIndex", () => {
  it("returns the segment containing t", () => {
    expect(activeSegmentIndex(segments, 0)).toBe(0);
    expect(activeSegmentIndex(segments, 12)).toBe(1);
  });

  it("returns -1 before the first segment starts", () => {
    expect(activeSegmentIndex(segments, -1)).toBe(-1);
  });

  it("returns -1 well past the end of the last segment", () => {
    // Last segment ends at 40; 999 is nowhere near it.
    expect(activeSegmentIndex(segments, 999)).toBe(-1);
  });

  it("stays active up to end + 0.5s grace, then drops to -1", () => {
    expect(activeSegmentIndex(segments, 40)).toBe(2);
    expect(activeSegmentIndex(segments, 40.5)).toBe(2);
    expect(activeSegmentIndex(segments, 40.51)).toBe(-1);
  });

  it("returns -1 inside a gap between two segments", () => {
    const withGap: TranscriptSegment[] = [
      { start: 0, end: 10, text: "intro" },
      { start: 15, end: 20, text: "after a gap" },
    ];
    expect(activeSegmentIndex(withGap, 12)).toBe(-1);
    // Just past the grace window after segment 0's end (10 + 0.5).
    expect(activeSegmentIndex(withGap, 10.6)).toBe(-1);
    // Within grace of segment 0's end.
    expect(activeSegmentIndex(withGap, 10.4)).toBe(0);
    // Inside segment 1.
    expect(activeSegmentIndex(withGap, 15)).toBe(1);
  });
});

const concepts: ConceptCard[] = [
  { id: "c1", title: "Concept 1", body: "", anchors: [{ t: 30 }], raw: "" },
  { id: "c2", title: "Concept 2 (unmatched)", body: "", anchors: [{ t: null }], raw: "" },
  { id: "c3", title: "Concept 3", body: "", anchors: [{ t: 200 }], raw: "" },
];

describe("activeConcepts", () => {
  it("includes concepts whose anchor is within the 90s trailing window", () => {
    expect(activeConcepts(concepts, 30).map((c) => c.card.id)).toEqual(["c1"]);
    expect(activeConcepts(concepts, 119).map((c) => c.card.id)).toEqual(["c1"]);
    expect(activeConcepts(concepts, 121).map((c) => c.card.id)).toEqual([]);
  });

  it("ignores concepts with no applicable (null) anchor", () => {
    expect(activeConcepts(concepts, 30).map((c) => c.card.id)).not.toContain("c2");
  });

  it("does not surface concepts before their anchor", () => {
    expect(activeConcepts(concepts, 10)).toEqual([]);
  });
});

describe("passedConcepts", () => {
  it("includes only concepts whose anchor has been reached", () => {
    expect(passedConcepts(concepts, 30).map((c) => c.id)).toEqual(["c1"]);
    expect(passedConcepts(concepts, 200).map((c) => c.id)).toEqual(["c1", "c3"]);
    expect(passedConcepts(concepts, 0)).toEqual([]);
  });
});
