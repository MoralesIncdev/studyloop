import { describe, expect, it } from "vitest";
import { gapConceptsFromAttestations, loosePearls, topConceptTitles } from "../src/lib/analysisAccess.js";

describe("topConceptTitles — v2 shape (concepts + themes)", () => {
  it("reads concept titles first, then fills remaining slots with theme titles", () => {
    const analysis = {
      version: 2,
      concepts: [{ id: "a", title: "Concept A" }, { id: "b", title: "Concept B" }],
      themes: [{ title: "Theme A" }],
    };
    expect(topConceptTitles(analysis, 3)).toEqual(["Concept A", "Concept B", "Theme A"]);
  });

  it("caps at `max`", () => {
    const analysis = { concepts: [{ title: "A" }, { title: "B" }, { title: "C" }] };
    expect(topConceptTitles(analysis, 2)).toEqual(["A", "B"]);
  });
});

describe("topConceptTitles — v3-shaped (units instead of concepts)", () => {
  it("falls back to units[].label when concepts is absent", () => {
    const analysis = {
      version: 3,
      units: [{ id: "u1", type: "MECHANISM", label: "Unit One" }, { id: "u2", type: "CLAIM", label: "Unit Two" }],
      themes: [],
    };
    expect(topConceptTitles(analysis, 3)).toEqual(["Unit One", "Unit Two"]);
  });

  it("tolerates a unit with a `title` field instead of `label`", () => {
    const analysis = { units: [{ id: "u1", title: "Titled Unit" }] };
    expect(topConceptTitles(analysis, 3)).toEqual(["Titled Unit"]);
  });
});

describe("topConceptTitles — degradation", () => {
  it("returns [] for null/undefined", () => {
    expect(topConceptTitles(null)).toEqual([]);
    expect(topConceptTitles(undefined)).toEqual([]);
  });

  it("returns [] for a non-object", () => {
    expect(topConceptTitles("not an analysis")).toEqual([]);
    expect(topConceptTitles(42)).toEqual([]);
  });

  it("returns [] for an object with none of the expected fields", () => {
    expect(topConceptTitles({ someOtherField: 1 })).toEqual([]);
  });

  it("skips concepts/units with neither title nor label", () => {
    const analysis = { concepts: [{ id: "no-title" }, { title: "Has Title" }] };
    expect(topConceptTitles(analysis, 5)).toEqual(["Has Title"]);
  });
});

describe("loosePearls", () => {
  it("normalizes valid pearls", () => {
    const analysis = { pearls: [{ t: 12, label: "Pearl", insight: "x", importance: 2 }] };
    expect(loosePearls(analysis)).toEqual([{ t: 12, label: "Pearl", importance: 2 }]);
  });

  it("drops pearls missing label or importance rather than throwing", () => {
    const analysis = { pearls: [{ t: 1, insight: "no label or importance" }, { t: 2, label: "ok", importance: 1 }] };
    expect(loosePearls(analysis)).toEqual([{ t: 2, label: "ok", importance: 1 }]);
  });

  it("returns [] when there's no pearls field at all (v3 may restructure it)", () => {
    expect(loosePearls({ units: [] })).toEqual([]);
  });

  it("tolerates an unknown extra field on each pearl (e.g. v3's unitId?)", () => {
    const analysis = { pearls: [{ t: 5, label: "L", importance: 3, unitId: "abc" }] };
    expect(loosePearls(analysis)).toEqual([{ t: 5, label: "L", importance: 3 }]);
  });
});

describe("gapConceptsFromAttestations", () => {
  const analysis = {
    units: [
      { id: "u1", label: "Unit One" },
      { id: "u2", label: "Unit Two" },
      { id: "u3", label: "Unit Three" },
    ],
  };

  it("returns [] when attestations.json doesn't exist (undefined/null)", () => {
    expect(gapConceptsFromAttestations(analysis, null)).toEqual([]);
    expect(gapConceptsFromAttestations(analysis, undefined)).toEqual([]);
  });

  it("returns [] when there's no analysis at all, even with attestations present", () => {
    expect(gapConceptsFromAttestations(null, { u1: { status: "dismissed" } })).toEqual([]);
  });

  it("includes a unit explicitly marked dismissed", () => {
    const attestations = { u1: { status: "dismissed" } };
    expect(gapConceptsFromAttestations(analysis, attestations)).toContain("Unit One");
  });

  it("includes a unit with no attestation entry at all (unattested) once the file exists", () => {
    const attestations = { u1: { status: "attested" } }; // u2/u3 have no entry
    const gaps = gapConceptsFromAttestations(analysis, attestations);
    expect(gaps).toContain("Unit Two");
    expect(gaps).toContain("Unit Three");
  });

  it("excludes a unit that is attested", () => {
    const attestations = { u1: { status: "attested" }, u2: { status: "attested" }, u3: { status: "attested" } };
    expect(gapConceptsFromAttestations(analysis, attestations)).toEqual([]);
  });

  it("caps at `max`", () => {
    const attestations = {}; // everything unattested
    expect(gapConceptsFromAttestations(analysis, attestations, 2)).toHaveLength(2);
  });

  it("degrades to [] for a corrupt (non-record) attestations payload", () => {
    expect(gapConceptsFromAttestations(analysis, "not an object")).toEqual([]);
    expect(gapConceptsFromAttestations(analysis, 12345)).toEqual([]);
  });
});
