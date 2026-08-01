// Phase 8 "Document mode" — transcript-time ordering + chapter grouping for
// the document surface's unit list. `unit()` builder mirrors
// lib/studyPath.test.ts's own fixture helper.
import { describe, expect, it } from "vitest";
import { groupUnitsIntoChapters, orderUnitsForDocument } from "./documentOrder";
import type { AnalysisUnit } from "./types";

function unit(id: string, t: number, overrides: Partial<AnalysisUnit> = {}): AnalysisUnit {
  return {
    id,
    type: "CLAIM",
    label: id,
    summary: "s",
    body: "b",
    anchors: t === Number.NEGATIVE_INFINITY ? [] : [{ t, quote: "q" }],
    confidence: 0.9,
    threshold: false,
    ...overrides,
  };
}

describe("orderUnitsForDocument", () => {
  it("orders purely by first anchor time — no REQUIRES/PROCEDURE_STEP reordering", () => {
    const units = [unit("c", 30), unit("a", 10), unit("b", 20)];
    expect(orderUnitsForDocument(units).map((u) => u.id)).toEqual(["a", "b", "c"]);
  });

  it("breaks ties (same anchor time) by label", () => {
    const units = [unit("z", 10), unit("a", 10)];
    expect(orderUnitsForDocument(units).map((u) => u.id)).toEqual(["a", "z"]);
  });

  it("uses a unit's earliest anchor when it carries more than one", () => {
    const multi = unit("multi", 100, { anchors: [{ t: 100, quote: "q" }, { t: 5, quote: "q2" }] });
    const units = [unit("early", 10), multi];
    expect(orderUnitsForDocument(units).map((u) => u.id)).toEqual(["multi", "early"]);
  });

  it("sorts a unit with no anchors at all to the end", () => {
    const units = [unit("no-anchor", Number.NEGATIVE_INFINITY), unit("has-anchor", 10)];
    expect(orderUnitsForDocument(units).map((u) => u.id)).toEqual(["has-anchor", "no-anchor"]);
  });

  it("does not mutate the input array", () => {
    const units = [unit("b", 20), unit("a", 10)];
    const copy = [...units];
    orderUnitsForDocument(units);
    expect(units).toEqual(copy);
  });

  it("collapses a CLUSTER to exactly one entry in the ordered output regardless of member count", () => {
    const cluster = unit("cluster", 15, {
      type: "CLUSTER",
      members: [
        { label: "m1", body: "b1", anchorSec: 15 },
        { label: "m2", body: "b2", anchorSec: 16 },
        { label: "m3", body: "b3", anchorSec: 17 },
      ],
    });
    const units = [unit("a", 10), cluster, unit("b", 20)];
    const ordered = orderUnitsForDocument(units);
    expect(ordered).toHaveLength(3);
    expect(ordered.map((u) => u.id)).toEqual(["a", "cluster", "b"]);
  });
});

describe("groupUnitsIntoChapters", () => {
  it("returns one untitled group holding every unit when no chapters are supplied (plain ordered flow)", () => {
    const ordered = orderUnitsForDocument([unit("a", 10), unit("b", 20)]);
    const groups = groupUnitsIntoChapters(ordered);
    expect(groups).toHaveLength(1);
    expect(groups[0].title).toBeNull();
    expect(groups[0].units.map((u) => u.id)).toEqual(["a", "b"]);
  });

  it("returns no groups at all for an empty unit list", () => {
    expect(groupUnitsIntoChapters([])).toEqual([]);
  });

  it("assigns each unit to the chapter whose span contains its first anchor", () => {
    const ordered = orderUnitsForDocument([unit("a", 5), unit("b", 15), unit("c", 25)]);
    const groups = groupUnitsIntoChapters(ordered, [
      { title: "Intro", startSec: 0 },
      { title: "Middle", startSec: 10 },
      { title: "End", startSec: 20 },
    ]);
    expect(groups.map((g) => g.title)).toEqual(["Intro", "Middle", "End"]);
    expect(groups.map((g) => g.units.map((u) => u.id))).toEqual([["a"], ["b"], ["c"]]);
  });

  it("drops a chapter with nothing anchored inside its span", () => {
    const ordered = orderUnitsForDocument([unit("a", 5), unit("c", 25)]);
    const groups = groupUnitsIntoChapters(ordered, [
      { title: "Intro", startSec: 0 },
      { title: "Empty middle", startSec: 10 },
      { title: "End", startSec: 20 },
    ]);
    expect(groups.map((g) => g.title)).toEqual(["Intro", "End"]);
  });

  it("sorts out-of-order chapter markers by startSec before assigning", () => {
    const ordered = orderUnitsForDocument([unit("a", 5), unit("b", 25)]);
    const groups = groupUnitsIntoChapters(ordered, [
      { title: "End", startSec: 20 },
      { title: "Intro", startSec: 0 },
    ]);
    expect(groups.map((g) => g.title)).toEqual(["Intro", "End"]);
  });
});
