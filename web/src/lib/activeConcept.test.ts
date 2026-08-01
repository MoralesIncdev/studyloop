import { describe, expect, it } from "vitest";
import { activeConceptAt, ACTIVE_WINDOW_S } from "./activeConcept";
import type { ConceptCard } from "./types";

const card = (id: string, ts: (number | null)[]): ConceptCard => ({
  id,
  title: id,
  body: "",
  anchors: ts.map((t) => ({ t })),
  raw: "",
});

describe("activeConceptAt", () => {
  it("returns null when nothing covers the playhead", () => {
    expect(activeConceptAt([card("a", [100])], 500)).toBeNull();
  });

  it("returns the covering concept", () => {
    const a = card("a", [100]);
    expect(activeConceptAt([a], 130)?.card.id).toBe("a");
  });

  it("is inclusive at both window edges", () => {
    const a = card("a", [100]);
    expect(activeConceptAt([a], 100)?.t).toBe(100);
    expect(activeConceptAt([a], 100 + ACTIVE_WINDOW_S)?.t).toBe(100);
    expect(activeConceptAt([a], 100 + ACTIVE_WINDOW_S + 1)).toBeNull();
  });

  it("picks the latest qualifying anchor across cards", () => {
    const early = card("early", [100]);
    const late = card("late", [140]);
    expect(activeConceptAt([early, late], 150)?.card.id).toBe("late");
  });

  it("picks the latest qualifying anchor within one card", () => {
    const a = card("a", [100, 140]);
    expect(activeConceptAt([a], 150)?.t).toBe(140);
  });

  it("skips null anchors", () => {
    expect(activeConceptAt([card("a", [null, 100])], 120)?.t).toBe(100);
  });
});
