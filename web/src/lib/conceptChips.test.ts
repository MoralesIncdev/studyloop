// V3-A A4 acceptance: "chip-strip active-window selector reuse" — exercises
// selectConceptChips on top of the existing activeConcepts window selector,
// end to end, the same way ConceptChipStrip.tsx composes them.
import { describe, expect, it } from "vitest";
import { activeConcepts } from "./selectors";
import { selectConceptChips } from "./conceptChips";
import type { ConceptCard } from "./types";

function card(id: string, title: string, anchors: (number | null)[]): ConceptCard {
  return { id, title, body: "", raw: "", anchors: anchors.map((t) => ({ t })) };
}

describe("selectConceptChips (composed with activeConcepts)", () => {
  const concepts: ConceptCard[] = [
    card("a", "Grip fighting", [10]),
    card("b", "Posture control", [20]),
    card("c", "Hip escapes", [30]),
    card("d", "Never anchored", [null]),
  ];

  it("reuses activeConcepts' [anchor, anchor+90s] window — nothing active before the first anchor", () => {
    const active = activeConcepts(concepts, 5);
    expect(active).toHaveLength(0);
    expect(selectConceptChips(active, 2)).toEqual({ visible: [], overflowCount: 0 });
  });

  it("caps visible chips at maxVisible and reports the rest as overflowCount", () => {
    // t=40 is inside all three anchors' [t, t+90] windows.
    const active = activeConcepts(concepts, 40);
    expect(active).toHaveLength(3);
    const { visible, overflowCount } = selectConceptChips(active, 2);
    expect(visible).toHaveLength(2);
    expect(overflowCount).toBe(1);
    expect(visible.map((v) => v.card.id)).toEqual(["a", "b"]);
  });

  it("de-dupes a card active via more than one anchor within the window", () => {
    const multiAnchor = [card("x", "Repeated concept", [10, 15])];
    const active = activeConcepts(multiAnchor, 16);
    // activeConcepts itself only pushes the card once (it `break`s after the
    // first matching anchor) — selectConceptChips must still be safe if that
    // ever changes, so simulate two active-window entries for the same card.
    const doubled = [...active, ...active];
    const { visible, overflowCount } = selectConceptChips(doubled, 2);
    expect(visible).toHaveLength(1);
    expect(overflowCount).toBe(0);
  });

  it("an unanchored card never appears (activeConcepts skips null anchors)", () => {
    const active = activeConcepts(concepts, 40);
    expect(active.some((a) => a.card.id === "d")).toBe(false);
  });

  it("empty active-window input renders an empty strip (zero chips, zero overflow)", () => {
    expect(selectConceptChips([], 2)).toEqual({ visible: [], overflowCount: 0 });
  });
});
