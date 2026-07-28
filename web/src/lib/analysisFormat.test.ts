import { describe, expect, it } from "vitest";
import { analysisConceptToConceptCard, hashHueForHandle, starStates, sortPearls } from "./analysisFormat";
import type { AnalysisConcept, Pearl } from "./types";

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
