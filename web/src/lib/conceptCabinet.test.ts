import { describe, expect, it } from "vitest";
import { buildConceptCabinetRows } from "./conceptCabinet";
import type { AnalysisConcept, AnalysisUnit, AttestationsFile, ConceptCard } from "./types";

const docCard = (id: string, title: string, t: number): ConceptCard => ({
  id,
  title,
  body: "",
  anchors: [{ t }],
  raw: "",
});

const aiConcept = (id: string, title: string, t: number): AnalysisConcept => ({
  id,
  title,
  summary: "",
  anchors: [{ t }],
  body: "",
});

const unit = (id: string, type: AnalysisUnit["type"]): AnalysisUnit => ({
  id,
  type,
  label: id,
  summary: "",
  body: "",
  anchors: [{ t: 0, quote: "" }],
  confidence: 1,
  threshold: false,
});

describe("buildConceptCabinetRows", () => {
  it("merges doc concepts and AI-breakdown concepts, sorted chronologically", () => {
    const rows = buildConceptCabinetRows(
      [docCard("doc-a", "Doc A", 300)],
      [aiConcept("ai-a", "AI A", 100)],
      undefined,
      {},
      0
    );
    expect(rows.map((r) => r.id)).toEqual(["ai:ai-a", "doc-a"]);
    expect(rows.map((r) => r.title)).toEqual(["AI A", "Doc A"]);
  });

  it("marks an attested unit as attested regardless of AI/doc origin", () => {
    const attestations: AttestationsFile = { "ai-a": { status: "attested", at: "2026-01-01T00:00:00.000Z" } };
    const rows = buildConceptCabinetRows([], [aiConcept("ai-a", "AI A", 100)], undefined, attestations, 0);
    expect(rows[0].status).toBe("attested");
  });

  it("marks an un-attested AI-backed concept as proposed", () => {
    const rows = buildConceptCabinetRows([], [aiConcept("ai-a", "AI A", 100)], undefined, {}, 0);
    expect(rows[0].status).toBe("proposed");
  });

  it("marks a dismissed AI-backed concept as upcoming, not proposed", () => {
    const attestations: AttestationsFile = { "ai-a": { status: "dismissed", at: "2026-01-01T00:00:00.000Z" } };
    const rows = buildConceptCabinetRows([], [aiConcept("ai-a", "AI A", 100)], undefined, attestations, 0);
    expect(rows[0].status).toBe("upcoming");
  });

  it("marks a doc concept (never AI-backed) as upcoming when un-attested", () => {
    const rows = buildConceptCabinetRows([docCard("doc-a", "Doc A", 100)], undefined, undefined, {}, 0);
    expect(rows[0].status).toBe("upcoming");
  });

  it("drops concepts with no anchored timestamp", () => {
    const unanchored: ConceptCard = { id: "u", title: "U", body: "", anchors: [{ t: null }], raw: "" };
    const rows = buildConceptCabinetRows([unanchored], undefined, undefined, {}, 0);
    expect(rows).toHaveLength(0);
  });

  it("attaches the unit type as a title-cased meta line when a matching unit exists", () => {
    const rows = buildConceptCabinetRows(
      [],
      [aiConcept("ai-a", "AI A", 100)],
      [unit("ai-a", "MECHANISM")],
      {},
      0
    );
    expect(rows[0].meta).toBe("Mechanism");
  });

  it("leaves meta null when no matching unit exists", () => {
    const rows = buildConceptCabinetRows([docCard("doc-a", "Doc A", 100)], undefined, [], {}, 0);
    expect(rows[0].meta).toBeNull();
  });
});
