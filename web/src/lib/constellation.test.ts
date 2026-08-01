import { describe, expect, it } from "vitest";
import { constellationEdges, layoutConstellation, type ConstellationInput } from "./constellation";

const item = (id: string, t: number, title = id, attested = false): ConstellationInput => ({ id, t, title, attested });

describe("layoutConstellation", () => {
  it("returns one node per input, all inside the unit square", () => {
    const nodes = layoutConstellation([item("a", 0), item("b", 60), item("c", 120)], null);
    expect(nodes).toHaveLength(3);
    for (const n of nodes) {
      expect(n.x).toBeGreaterThan(0);
      expect(n.x).toBeLessThan(1);
      expect(n.y).toBeGreaterThan(0);
      expect(n.y).toBeLessThan(1);
    }
  });

  it("is deterministic for the same input order", () => {
    const items = [item("a", 0), item("b", 60), item("c", 120), item("d", 180)];
    expect(layoutConstellation(items, null)).toEqual(layoutConstellation(items, null));
  });

  it("marks exactly the active id as isNow", () => {
    const nodes = layoutConstellation([item("a", 0), item("b", 60)], "b");
    expect(nodes.find((n) => n.id === "a")?.isNow).toBe(false);
    expect(nodes.find((n) => n.id === "b")?.isNow).toBe(true);
  });

  it("places a single node at the exact center", () => {
    const nodes = layoutConstellation([item("solo", 0)], null);
    expect(nodes[0].x).toBeCloseTo(0.5);
    expect(nodes[0].y).toBeCloseTo(0.5);
  });

  it("handles an empty list", () => {
    expect(layoutConstellation([], null)).toEqual([]);
  });
});

describe("constellationEdges", () => {
  it("connects temporally adjacent nodes in a chain", () => {
    const nodes = layoutConstellation([item("a", 100), item("b", 0), item("c", 50)], null);
    const edges = constellationEdges(nodes);
    // Sorted by t: b(0) -> c(50) -> a(100)
    expect(edges).toContainEqual({ a: "b", b: "c" });
    expect(edges).toContainEqual({ a: "c", b: "a" });
    expect(edges).toHaveLength(2);
  });

  it("adds a same-title cross-link without duplicating an adjacency edge", () => {
    const nodes = layoutConstellation(
      [item("a", 0, "frames first"), item("b", 60, "elbow-knee"), item("c", 120, "frames first")],
      null
    );
    const edges = constellationEdges(nodes);
    // temporal chain a-b, b-c, plus the same-title link a-c
    expect(edges).toHaveLength(3);
    expect(edges.some((e) => (e.a === "a" && e.b === "c") || (e.a === "c" && e.b === "a"))).toBe(true);
  });

  it("ignores empty titles for cross-linking", () => {
    const nodes = layoutConstellation([item("a", 0, ""), item("b", 60, "")], null);
    expect(constellationEdges(nodes)).toEqual([{ a: "a", b: "b" }]);
  });

  it("produces no edges for 0 or 1 nodes", () => {
    expect(constellationEdges([])).toEqual([]);
    expect(constellationEdges(layoutConstellation([item("solo", 0)], null))).toEqual([]);
  });
});
