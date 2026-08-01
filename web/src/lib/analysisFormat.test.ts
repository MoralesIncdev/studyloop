import { describe, expect, it } from "vitest";
import { analysisConceptToConceptCard, conceptTickTimes, hashHueForHandle, starStates, sortPearls, unitIdForConceptCard } from "./analysisFormat";
import type { AnalysisConcept, ConceptCard, Pearl } from "./types";

describe("sortPearls", () => {
  it("sorts by importance descending, then by timestamp ascending", () => {
    const pearls: Pearl[] = [
      { t: 900, label: "minor", insight: "", importance: 1 },
      { t: 65, label: "critical-early", insight: "", importance: 3 },
      { t: 300, label: "critical-late", insight: "", importance: 3 },
      { t: 500, label: "supporting", insight: "", importance: 2 },
    ];
    expect(sortPearls(pearls).map((p) => p.label)).toEqual(["critical-early", "critical-late", "supporting", "minor"]);
  });

  it("does not mutate the input array", () => {
    const pearls: Pearl[] = [
      { t: 10, label: "b", insight: "", importance: 1 },
      { t: 5, label: "a", insight: "", importance: 3 },
    ];
    const copy = [...pearls];
    sortPearls(pearls);
    expect(pearls).toEqual(copy);
  });
});

describe("starStates", () => {
  it("returns filled/outline flags totalling 3 slots", () => {
    expect(starStates(3)).toEqual([true, true, true]);
    expect(starStates(2)).toEqual([true, true, false]);
    expect(starStates(1)).toEqual([true, false, false]);
  });
});

describe("hashHueForHandle", () => {
  it("is deterministic for the same handle", () => {
    expect(hashHueForHandle("ryan")).toBe(hashHueForHandle("ryan"));
  });

  it("returns a value in [0, 359]", () => {
    for (const handle of ["ryan", "anonymous", "", "a-very-long-handle-string-123"]) {
      const hue = hashHueForHandle(handle);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });

  it("differs for different handles (not a constant)", () => {
    expect(hashHueForHandle("ryan")).not.toBe(hashHueForHandle("someone-else"));
  });
});

describe("analysisConceptToConceptCard", () => {
  it("maps fields into the ConceptCard shape doc concepts use, prefixing the id to avoid collisions", () => {
    const concept: AnalysisConcept = {
      id: "grip-fighting",
      title: "Grip Fighting",
      summary: "A short summary.",
      body: "## Full markdown body",
      anchors: [{ t: 65 }, { t: 500 }],
    };
    const card = analysisConceptToConceptCard(concept);
    expect(card.id).toBe("ai:grip-fighting");
    expect(card.title).toBe("Grip Fighting");
    expect(card.body).toBe("## Full markdown body");
    expect(card.anchors).toEqual([{ t: 65 }, { t: 500 }]);
  });
});

describe("unitIdForConceptCard", () => {
  it("strips the ai: prefix so it matches analysis.units[].id", () => {
    expect(unitIdForConceptCard("ai:grip-fighting")).toBe("grip-fighting");
  });

  it("leaves a doc concept id unprefixed and unchanged", () => {
    expect(unitIdForConceptCard("frames-before-grips")).toBe("frames-before-grips");
  });
});

describe("conceptTickTimes", () => {
  const docConcepts: ConceptCard[] = [
    { id: "frames", title: "Frames", body: "", raw: "", anchors: [{ t: 135 }, { t: null }] },
  ];
  const analysisConcepts: AnalysisConcept[] = [
    { id: "distance", title: "Distance", summary: "", body: "", anchors: [{ t: 522 }] },
  ];

  it("flattens doc concept anchors, dropping unset (null) ones", () => {
    expect(conceptTickTimes(docConcepts)).toEqual([135]);
  });

  it("includes AI-breakdown anchors when provided", () => {
    expect(conceptTickTimes(docConcepts, analysisConcepts)).toEqual([135, 522]);
  });

  it("returns an empty array with no concepts at all", () => {
    expect(conceptTickTimes([])).toEqual([]);
  });
});
