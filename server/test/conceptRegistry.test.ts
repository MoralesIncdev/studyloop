// V3-D D3 "Concept merge queue (cross-video identity)" — fingerprint match
// tiers (exact auto-merge / >=0.85 Jaccard candidate / never-merge
// BOUNDARY-or-threshold guards) + resolve actions. Pure logic, no fs.
import { describe, expect, it } from "vitest";
import {
  emptyConceptRegistry,
  evaluateNewUnit,
  firstSentence,
  jaccardSimilarity,
  MERGE_SIMILARITY_THRESHOLD,
  resolveMergeCandidate,
  unitFingerprint,
  updateRegistryForProject,
  type ConceptRegistryFile,
} from "../src/lib/conceptRegistry.js";
import type { AnalysisUnit } from "../src/lib/analysis.js";

function unit(overrides: Partial<AnalysisUnit> = {}): AnalysisUnit {
  return {
    id: "u1",
    type: "MECHANISM",
    label: "Posture Control",
    summary: "Controlling posture stabilizes the position.",
    body: "b",
    anchors: [],
    confidence: 0.8,
    threshold: false,
    ...overrides,
  };
}

let idCounter = 0;
function newId(): string {
  idCounter += 1;
  return `id-${idCounter}`;
}

describe("firstSentence", () => {
  it("takes everything up to and including the first terminator", () => {
    expect(firstSentence("First bit. Second bit.")).toBe("First bit.");
    expect(firstSentence("Only one sentence")).toBe("Only one sentence");
    expect(firstSentence("Question? Then more.")).toBe("Question?");
  });
});

describe("unitFingerprint", () => {
  it("is stable for equivalent label/summary text regardless of casing/punctuation", () => {
    const a = unitFingerprint("Posture Control", "Controlling posture stabilizes.", "physical_skill");
    const b = unitFingerprint("posture control!!", "Controlling posture stabilizes. Extra detail.", "physical_skill");
    expect(a).toBe(b);
  });

  it("differs across domains for the same label/summary", () => {
    const a = unitFingerprint("Feedback Loop", "A feedback loop.", "biology");
    const b = unitFingerprint("Feedback Loop", "A feedback loop.", "generic");
    expect(a).not.toBe(b);
  });
});

describe("jaccardSimilarity", () => {
  it("is 1 for identical token sets", () => {
    expect(jaccardSimilarity(new Set(["a", "b"]), new Set(["a", "b"]))).toBe(1);
  });

  it("is 1 for two empty sets (nothing to compare, treated as identical)", () => {
    expect(jaccardSimilarity(new Set(), new Set())).toBe(1);
  });

  it("is 0 for entirely disjoint sets", () => {
    expect(jaccardSimilarity(new Set(["a"]), new Set(["b"]))).toBe(0);
  });

  it("computes |intersection|/|union| for a partial overlap", () => {
    // {hip, shoulder} vs {hip, knee} -> intersection {hip}=1, union {hip,shoulder,knee}=3
    expect(jaccardSimilarity(new Set(["hip", "shoulder"]), new Set(["hip", "knee"]))).toBeCloseTo(1 / 3);
  });
});

describe("evaluateNewUnit — exact fingerprint match", () => {
  it("auto-merges a non-BOUNDARY, non-threshold unit whose fingerprint exactly matches an existing registry unit", () => {
    let registry = emptyConceptRegistry();
    const first = evaluateNewUnit(registry, {
      projectId: "p1",
      domain: "physical_skill",
      unit: unit({ id: "u1", label: "Posture Control" }),
      nowIso: "t",
      newId,
    });
    expect(first.outcome).toBe("registered");
    registry = first.registry;

    const second = evaluateNewUnit(registry, {
      projectId: "p2",
      domain: "physical_skill",
      unit: unit({ id: "u2", label: "posture control" }), // same fingerprint after normalization
      nowIso: "t",
      newId,
    });
    expect(second.outcome).toBe("auto-merged");
    const merged = Object.values(second.registry.units)[0];
    expect(merged.projectRefs).toEqual([
      { projectId: "p1", unitId: "u1" },
      { projectId: "p2", unitId: "u2" },
    ]);
    expect(merged.aliases).toEqual(["posture control"]);
  });

  it("never auto-merges a BOUNDARY unit even on an exact fingerprint match — queues a candidate instead", () => {
    let registry = emptyConceptRegistry();
    registry = evaluateNewUnit(registry, {
      projectId: "p1",
      domain: "physical_skill",
      unit: unit({ id: "u1", label: "Posture Control" }),
      nowIso: "t",
      newId,
    }).registry;

    const result = evaluateNewUnit(registry, {
      projectId: "p2",
      domain: "physical_skill",
      unit: unit({ id: "u2", label: "Posture Control", type: "BOUNDARY" }),
      nowIso: "t",
      newId,
    });
    expect(result.outcome).toBe("candidate");
    expect(result.registry.candidates).toHaveLength(1);
    expect(result.registry.candidates[0].similarity).toBe(1);
    // The registry unit itself is untouched — still just p1's original ref.
    const original = Object.values(result.registry.units).find((u) => u.projectRefs.some((r) => r.projectId === "p1"))!;
    expect(original.projectRefs).toEqual([{ projectId: "p1", unitId: "u1" }]);
  });

  it("never auto-merges a threshold-flagged unit even on an exact fingerprint match", () => {
    let registry = emptyConceptRegistry();
    registry = evaluateNewUnit(registry, {
      projectId: "p1",
      domain: "biology",
      unit: unit({ id: "u1", label: "Feedback Loop" }),
      nowIso: "t",
      newId,
    }).registry;

    const result = evaluateNewUnit(registry, {
      projectId: "p2",
      domain: "biology",
      unit: unit({ id: "u2", label: "Feedback Loop", threshold: true }),
      nowIso: "t",
      newId,
    });
    expect(result.outcome).toBe("candidate");
  });
});

describe("evaluateNewUnit — similarity tier (Jaccard >= 0.85, no exact match)", () => {
  it("queues a candidate when token similarity clears the threshold but the fingerprint isn't exact", () => {
    // registryUnitTokens compares against the registry unit's label(+aliases)
    // only (not summary) — 6 shared label tokens + 1 extra token on the
    // incoming side gives 6/7 ≈ 0.857 similarity (>=0.85) while still being
    // fingerprint-different (the extra word changes the label slug).
    let registry = emptyConceptRegistry();
    registry = evaluateNewUnit(registry, {
      projectId: "p1",
      domain: "physical_skill",
      unit: unit({ id: "u1", label: "Alpha Bravo Charlie Delta Echo Foxtrot", summary: "" }),
      nowIso: "t",
      newId,
    }).registry;

    const result = evaluateNewUnit(registry, {
      projectId: "p2",
      domain: "physical_skill",
      unit: unit({ id: "u2", label: "Alpha Bravo Charlie Delta Echo Foxtrot Golf", summary: "" }),
      nowIso: "t",
      newId,
    });
    expect(result.outcome).toBe("candidate");
    expect(result.registry.candidates[0].similarity).toBeGreaterThanOrEqual(MERGE_SIMILARITY_THRESHOLD);
    expect(result.registry.candidates[0].similarity).toBeLessThan(1);
  });

  it("registers an entirely new canonical unit when similarity falls below the threshold", () => {
    let registry = emptyConceptRegistry();
    registry = evaluateNewUnit(registry, {
      projectId: "p1",
      domain: "physical_skill",
      unit: unit({ id: "u1", label: "Closed Guard Retention" }),
      nowIso: "t",
      newId,
    }).registry;

    const result = evaluateNewUnit(registry, {
      projectId: "p2",
      domain: "physical_skill",
      unit: unit({ id: "u2", label: "Kimura Grip Entry" }),
      nowIso: "t",
      newId,
    });
    expect(result.outcome).toBe("registered");
    expect(Object.keys(result.registry.units)).toHaveLength(2);
  });
});

describe("evaluateNewUnit — domain scoping + idempotency", () => {
  it("does not match across different domains even with identical label/summary", () => {
    let registry = emptyConceptRegistry();
    registry = evaluateNewUnit(registry, {
      projectId: "p1",
      domain: "biology",
      unit: unit({ id: "u1", label: "Feedback Loop", summary: "Same summary." }),
      nowIso: "t",
      newId,
    }).registry;

    const result = evaluateNewUnit(registry, {
      projectId: "p2",
      domain: "history",
      unit: unit({ id: "u2", label: "Feedback Loop", summary: "Same summary." }),
      nowIso: "t",
      newId,
    });
    expect(result.outcome).toBe("registered");
    expect(Object.keys(result.registry.units)).toHaveLength(2);
  });

  it("is idempotent — re-evaluating the exact same (projectId, unitId) pair is a no-op", () => {
    let registry = emptyConceptRegistry();
    registry = evaluateNewUnit(registry, { projectId: "p1", domain: "biology", unit: unit({ id: "u1" }), nowIso: "t", newId }).registry;
    const before = registry;
    const result = evaluateNewUnit(registry, { projectId: "p1", domain: "biology", unit: unit({ id: "u1" }), nowIso: "t", newId });
    expect(result.outcome).toBe("already-known");
    expect(result.registry).toBe(before); // same reference — genuinely untouched
  });

  it("treats a unit already sitting in the candidate queue as already-known too", () => {
    let registry = emptyConceptRegistry();
    registry = evaluateNewUnit(registry, {
      projectId: "p1",
      domain: "biology",
      unit: unit({ id: "u1", threshold: true }),
      nowIso: "t",
      newId,
    }).registry;
    registry = evaluateNewUnit(registry, {
      projectId: "p2",
      domain: "biology",
      unit: unit({ id: "u2", threshold: true }), // exact match, blocked -> candidate
      nowIso: "t",
      newId,
    }).registry;
    const result = evaluateNewUnit(registry, {
      projectId: "p2",
      domain: "biology",
      unit: unit({ id: "u2", threshold: true }),
      nowIso: "t",
      newId,
    });
    expect(result.outcome).toBe("already-known");
  });
});

describe("updateRegistryForProject", () => {
  it("catches within-run duplicates too, not just cross-video ones", () => {
    const registry = updateRegistryForProject(
      emptyConceptRegistry(),
      "p1",
      "physical_skill",
      [unit({ id: "u1", label: "Posture Control" }), unit({ id: "u2", label: "posture control" })],
      "t",
      newId
    );
    expect(Object.keys(registry.units)).toHaveLength(1);
    expect(Object.values(registry.units)[0].projectRefs).toHaveLength(2);
  });
});

// --- Phase 5 "Lens registry + clinical as first data-driven lens", item 5
// "Safety tier": extends the BOUNDARY/threshold never-auto-merge rule to
// whichever unit types the active lens flags via `safetyTier` (e.g.
// clinical's DOSAGE/CONTRAINDICATION/LAB_VALUE). ---------------------------

describe("evaluateNewUnit — Phase 5 safety-tier never-auto-merge extension", () => {
  it("never auto-merges a unit whose type is in safetyUnitTypes, even on an exact fingerprint match — queues a candidate instead", () => {
    let registry = emptyConceptRegistry();
    registry = evaluateNewUnit(registry, {
      projectId: "p1",
      domain: "clinical",
      unit: unit({ id: "u1", label: "Metoprolol Dose", type: "DOSAGE" }),
      nowIso: "t",
      newId,
    }).registry;

    const result = evaluateNewUnit(registry, {
      projectId: "p2",
      domain: "clinical",
      unit: unit({ id: "u2", label: "Metoprolol Dose", type: "DOSAGE" }),
      nowIso: "t",
      newId,
      safetyUnitTypes: new Set(["DOSAGE", "CONTRAINDICATION", "LAB_VALUE"]),
    });
    expect(result.outcome).toBe("candidate");
    expect(result.registry.candidates).toHaveLength(1);
    // The registry unit itself is untouched — still just p1's original ref.
    const original = Object.values(result.registry.units).find((u) => u.projectRefs.some((r) => r.projectId === "p1"))!;
    expect(original.projectRefs).toEqual([{ projectId: "p1", unitId: "u1" }]);
  });

  it("auto-merges normally when the unit's type is NOT in safetyUnitTypes (extension only blocks the listed types)", () => {
    let registry = emptyConceptRegistry();
    registry = evaluateNewUnit(registry, {
      projectId: "p1",
      domain: "clinical",
      unit: unit({ id: "u1", label: "Assessment Step", type: "CLAIM" }),
      nowIso: "t",
      newId,
    }).registry;

    const result = evaluateNewUnit(registry, {
      projectId: "p2",
      domain: "clinical",
      unit: unit({ id: "u2", label: "Assessment Step", type: "CLAIM" }),
      nowIso: "t",
      newId,
      safetyUnitTypes: new Set(["DOSAGE", "CONTRAINDICATION", "LAB_VALUE"]),
    });
    expect(result.outcome).toBe("auto-merged");
  });

  it("is a no-op (preserves the pre-Phase-5 auto-merge behavior exactly) when safetyUnitTypes is omitted entirely", () => {
    let registry = emptyConceptRegistry();
    registry = evaluateNewUnit(registry, {
      projectId: "p1",
      domain: "clinical",
      unit: unit({ id: "u1", label: "Metoprolol Dose", type: "DOSAGE" }),
      nowIso: "t",
      newId,
    }).registry;

    const result = evaluateNewUnit(registry, {
      projectId: "p2",
      domain: "clinical",
      unit: unit({ id: "u2", label: "Metoprolol Dose", type: "DOSAGE" }),
      nowIso: "t",
      newId,
      // safetyUnitTypes deliberately omitted
    });
    expect(result.outcome).toBe("auto-merged");
  });

  it("updateRegistryForProject threads safetyUnitTypes through to every unit in the run", () => {
    const registry = updateRegistryForProject(
      emptyConceptRegistry(),
      "p1",
      "clinical",
      [unit({ id: "u1", label: "Metoprolol Dose", type: "DOSAGE" }), unit({ id: "u2", label: "metoprolol dose", type: "DOSAGE" })],
      "t",
      newId,
      new Set(["DOSAGE"])
    );
    // Both units registered separately (never merged) — one candidate queued, not an auto-merge.
    expect(Object.keys(registry.units)).toHaveLength(1);
    expect(registry.candidates).toHaveLength(1);
  });
});

describe("resolveMergeCandidate", () => {
  function seedCandidate(): { registry: ConceptRegistryFile; candidateId: string; targetId: string } {
    let registry = emptyConceptRegistry();
    registry = evaluateNewUnit(registry, {
      projectId: "p1",
      domain: "biology",
      unit: unit({ id: "u1", label: "Feedback Loop" }),
      nowIso: "t",
      newId,
    }).registry;
    registry = evaluateNewUnit(registry, {
      projectId: "p2",
      domain: "biology",
      unit: unit({ id: "u2", label: "Feedback Loop", threshold: true }), // exact-but-blocked -> candidate
      nowIso: "t",
      newId,
    }).registry;
    const targetId = Object.keys(registry.units)[0];
    const candidateId = registry.candidates[0].id;
    return { registry, candidateId, targetId };
  }

  it("returns null for an unknown candidate id", () => {
    const { registry } = seedCandidate();
    expect(resolveMergeCandidate(registry, "nope", "merge", { label: "L", summary: "S" }, newId)).toBeNull();
  });

  it("merge: adds the incoming label as an alias and joins projectRefs, removing the candidate", () => {
    const { registry, candidateId, targetId } = seedCandidate();
    const next = resolveMergeCandidate(registry, candidateId, "merge", { label: "Feedback Loop (variant)", summary: "s" }, newId)!;
    expect(next.candidates).toHaveLength(0);
    expect(next.units[targetId].aliases).toEqual(["Feedback Loop (variant)"]);
    expect(next.units[targetId].projectRefs).toEqual([
      { projectId: "p1", unitId: "u1" },
      { projectId: "p2", unitId: "u2" },
    ]);
  });

  it("link: joins projectRefs WITHOUT adding an alias", () => {
    const { registry, candidateId, targetId } = seedCandidate();
    const next = resolveMergeCandidate(registry, candidateId, "link", { label: "Feedback Loop (variant)", summary: "s" }, newId)!;
    expect(next.candidates).toHaveLength(0);
    expect(next.units[targetId].aliases).toEqual([]);
    expect(next.units[targetId].projectRefs).toHaveLength(2);
  });

  it("ignore: registers the incoming unit as its own new canonical entry ('keep separate'), leaving the target untouched", () => {
    const { registry, candidateId, targetId } = seedCandidate();
    const next = resolveMergeCandidate(registry, candidateId, "ignore", { label: "Feedback Loop (their take)", summary: "s" }, newId)!;
    expect(next.candidates).toHaveLength(0);
    expect(next.units[targetId].projectRefs).toEqual([{ projectId: "p1", unitId: "u1" }]); // untouched
    const newEntries = Object.values(next.units).filter((u) => u.id !== targetId);
    expect(newEntries).toHaveLength(1);
    expect(newEntries[0].label).toBe("Feedback Loop (their take)");
    expect(newEntries[0].projectRefs).toEqual([{ projectId: "p2", unitId: "u2" }]);
  });

  it("drops a candidate whose target registry unit no longer exists, without throwing", () => {
    const { registry, candidateId } = seedCandidate();
    const corrupted: ConceptRegistryFile = { ...registry, units: {} };
    const next = resolveMergeCandidate(corrupted, candidateId, "merge", { label: "L", summary: "S" }, newId)!;
    expect(next).not.toBeNull();
    expect(next.candidates).toHaveLength(0);
  });
});
