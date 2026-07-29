// V3-B B3 "Study Path rail tab" — topo sort + cycle/low-confidence fallback.
// V3-D D2 "REINFORCE step insertion" tests live at the bottom of this file.
import { describe, expect, it } from "vitest";
import { buildStudyPathSteps, PATH_EDGE_CONFIDENCE_THRESHOLD, topoSortUnits, type StudyPathStep } from "./studyPath";
import type { AnalysisEdge, AnalysisUnit } from "./types";

function unit(id: string, t: number, overrides: Partial<AnalysisUnit> = {}): AnalysisUnit {
  return {
    id,
    type: "CLAIM",
    label: id,
    summary: "s",
    body: "b",
    anchors: [{ t, quote: "q" }],
    confidence: 0.9,
    threshold: false,
    ...overrides,
  };
}

function edge(source: string, target: string, type: AnalysisEdge["type"], confidence = 0.9): AnalysisEdge {
  return { source, target, type, quote: "q", confidence };
}

describe("topoSortUnits — no edges (pure time-order fallback)", () => {
  it("orders units purely by first anchor time when there are no edges at all", () => {
    const units = [unit("c", 300), unit("a", 100), unit("b", 200)];
    expect(topoSortUnits(units, []).map((u) => u.id)).toEqual(["a", "b", "c"]);
  });

  it("breaks ties (same anchor time) by label", () => {
    const units = [unit("z", 100), unit("a", 100)];
    expect(topoSortUnits(units, []).map((u) => u.id)).toEqual(["a", "z"]);
  });
});

describe("topoSortUnits — REQUIRES edges", () => {
  it("places a REQUIRES target before its source, even against time order", () => {
    // "a REQUIRES b" -> b is a's prerequisite -> b must come first, even though a's anchor is earlier.
    const units = [unit("a", 10), unit("b", 500)];
    const edges = [edge("a", "b", "REQUIRES")];
    expect(topoSortUnits(units, edges).map((u) => u.id)).toEqual(["b", "a"]);
  });

  it("resolves a chain of prerequisites in dependency order", () => {
    // c REQUIRES b, b REQUIRES a -> order: a, b, c
    const units = [unit("c", 30), unit("b", 20), unit("a", 10)];
    const edges = [edge("c", "b", "REQUIRES"), edge("b", "a", "REQUIRES")];
    expect(topoSortUnits(units, edges).map((u) => u.id)).toEqual(["a", "b", "c"]);
  });
});

describe("topoSortUnits — PROCEDURE_STEP edges", () => {
  it("places a PROCEDURE_STEP source before its target", () => {
    const units = [unit("step2", 5), unit("step1", 50)];
    const edges = [edge("step1", "step2", "PROCEDURE_STEP")];
    expect(topoSortUnits(units, edges).map((u) => u.id)).toEqual(["step1", "step2"]);
  });
});

describe("topoSortUnits — low-confidence edges don't affect ordering", () => {
  it("ignores an edge below the confidence threshold, falling back to time order for those units", () => {
    const units = [unit("a", 10), unit("b", 5)];
    const edges = [edge("a", "b", "REQUIRES", PATH_EDGE_CONFIDENCE_THRESHOLD - 0.01)];
    // Without the (ignored) edge, pure time order: b (t=5) before a (t=10).
    expect(topoSortUnits(units, edges).map((u) => u.id)).toEqual(["b", "a"]);
  });

  it("honors an edge exactly at the confidence threshold", () => {
    const units = [unit("a", 10), unit("b", 5)];
    const edges = [edge("a", "b", "REQUIRES", PATH_EDGE_CONFIDENCE_THRESHOLD)];
    expect(topoSortUnits(units, edges).map((u) => u.id)).toEqual(["b", "a"]);
  });
});

describe("topoSortUnits — edges referencing unknown units are ignored", () => {
  it("drops an edge whose source or target isn't in the units list", () => {
    const units = [unit("a", 10), unit("b", 20)];
    const edges = [edge("a", "ghost", "REQUIRES"), edge("ghost", "b", "PROCEDURE_STEP")];
    expect(topoSortUnits(units, edges).map((u) => u.id)).toEqual(["a", "b"]);
  });

  it("ignores EXAMPLE_OF/PART_OF edges entirely for ordering purposes", () => {
    const units = [unit("a", 10), unit("b", 5)];
    const edges = [edge("a", "b", "EXAMPLE_OF"), edge("a", "b", "PART_OF")];
    // Neither edge type orders — pure time order: b before a.
    expect(topoSortUnits(units, edges).map((u) => u.id)).toEqual(["b", "a"]);
  });
});

describe("topoSortUnits — cycle fallback", () => {
  it("degrades to time order for a cyclic pair rather than hanging or throwing", () => {
    const units = [unit("a", 20), unit("b", 10)];
    const edges = [edge("a", "b", "REQUIRES"), edge("b", "a", "REQUIRES")];
    const result = topoSortUnits(units, edges);
    expect(result).toHaveLength(2);
    // Cycle: neither unit's predecessors are ever fully placed, so both fall
    // through to the time-order fallback — b (t=10) before a (t=20).
    expect(result.map((u) => u.id)).toEqual(["b", "a"]);
  });

  it("resolves the acyclic part of a graph normally and only falls back for units inside a cycle", () => {
    // c REQUIRES b (fine); a and b cycle against each other.
    const units = [unit("c", 100), unit("a", 5), unit("b", 1)];
    const edges = [edge("c", "b", "REQUIRES"), edge("a", "b", "REQUIRES"), edge("b", "a", "REQUIRES")];
    const result = topoSortUnits(units, edges);
    expect(result).toHaveLength(3);
    expect(new Set(result.map((u) => u.id))).toEqual(new Set(["a", "b", "c"]));
  });

  it("never loses or duplicates a unit, regardless of graph shape", () => {
    const units = ["a", "b", "c", "d", "e"].map((id, i) => unit(id, i * 10));
    const edges = [edge("a", "b", "REQUIRES"), edge("b", "c", "REQUIRES"), edge("c", "a", "REQUIRES"), edge("d", "e", "PROCEDURE_STEP")];
    const result = topoSortUnits(units, edges);
    expect(result.map((u) => u.id).sort()).toEqual(["a", "b", "c", "d", "e"]);
  });
});

// --- V3-D D2 "Study Path inserts a REINFORCE step (repeat slot) 2 positions
// after a threshold unit" ----------------------------------------------------

function stepIds(steps: StudyPathStep[]): string[] {
  return steps.map((s) => (s.kind === "unit" ? s.unit.id : s.id));
}

describe("buildStudyPathSteps — no threshold units", () => {
  it("is identical to topoSortUnits' order, wrapped as unit steps, when nothing is threshold-flagged", () => {
    const units = [unit("a", 10), unit("b", 20), unit("c", 30)];
    const steps = buildStudyPathSteps(units, []);
    expect(steps.every((s) => s.kind === "unit")).toBe(true);
    expect(stepIds(steps)).toEqual(["a", "b", "c"]);
  });
});

describe("buildStudyPathSteps — REINFORCE insertion", () => {
  it("inserts a reinforce step exactly 2 positions after a threshold unit", () => {
    const units = [unit("a", 10, { threshold: true }), unit("b", 20), unit("c", 30), unit("d", 40)];
    const steps = buildStudyPathSteps(units, []);
    // order: a(threshold), b, c, d -> reinforce:a inserted at index 2 (after b, before c)
    expect(stepIds(steps)).toEqual(["a", "b", "reinforce:a", "c", "d"]);
    expect(steps[2]).toEqual({ kind: "reinforce", id: "reinforce:a", afterUnit: units[0] });
  });

  it("clamps to the end of the path when the threshold unit is near the tail", () => {
    const units = [unit("a", 10), unit("b", 20, { threshold: true }), unit("c", 30)];
    const steps = buildStudyPathSteps(units, []);
    // b is at index 1; 1+2=3 clamps to steps.length (3) -> appended at the end.
    expect(stepIds(steps)).toEqual(["a", "b", "c", "reinforce:b"]);
  });

  it("handles multiple threshold units without corrupting later insertion positions", () => {
    const units = [
      unit("a", 10, { threshold: true }),
      unit("b", 20),
      unit("c", 30, { threshold: true }),
      unit("d", 40),
      unit("e", 50),
    ];
    const steps = buildStudyPathSteps(units, []);
    // Original order: a, b, c, d, e (indices 0..4).
    // reinforce:a targets index 0+2=2 (before c); reinforce:c targets index 2+2=4 (before e, in ORIGINAL indexing).
    expect(stepIds(steps)).toEqual(["a", "b", "reinforce:a", "c", "d", "reinforce:c", "e"]);
  });

  it("inserts one reinforce step per threshold unit even when two threshold units are adjacent", () => {
    const units = [unit("a", 10, { threshold: true }), unit("b", 20, { threshold: true }), unit("c", 30), unit("d", 40)];
    const steps = buildStudyPathSteps(units, []);
    expect(stepIds(steps).filter((id) => id.startsWith("reinforce:"))).toEqual(["reinforce:a", "reinforce:b"]);
    expect(stepIds(steps)).toHaveLength(6);
  });

  it("never drops or duplicates a unit step, regardless of how many are threshold-flagged", () => {
    const units = ["a", "b", "c", "d", "e"].map((id, i) => unit(id, i * 10, { threshold: i % 2 === 0 }));
    const steps = buildStudyPathSteps(units, []);
    const unitSteps = steps.filter((s): s is Extract<StudyPathStep, { kind: "unit" }> => s.kind === "unit");
    expect(unitSteps.map((s) => s.unit.id).sort()).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("composes with edge-based ordering (REINFORCE follows the topo-sorted position, not raw input order)", () => {
    // b REQUIRES a -> topo order is [a, b]; a is threshold -> reinforce:a lands 2 after (clamped to end).
    const units = [unit("b", 999, { threshold: false }), unit("a", 1, { threshold: true })];
    const edges = [edge("b", "a", "REQUIRES")];
    const steps = buildStudyPathSteps(units, edges);
    expect(stepIds(steps)).toEqual(["a", "b", "reinforce:a"]);
  });
});
