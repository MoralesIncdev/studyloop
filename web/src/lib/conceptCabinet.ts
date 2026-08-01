// Console slice C (design/mockups/video-console/index.html lines 606-614,
// 1221-1240 "concepts cabinet built from data"): the left edge cabinet lists
// every concept for the video — doc concepts (store.concepts) plus the
// AI-breakdown concepts (analysis.concepts), the same merge PlayerChrome's
// own `tickerConcepts` memo and ConceptPane already build (NOT store's
// `mergedConcepts` field, which is the unrelated V3-D D3 cross-project
// "also in ⟨project⟩" echo-pane source — see lib/analysisFormat.ts's own
// warning on unitIdForConceptCard). Status (attested/proposed/upcoming) reads
// off `attestations` exactly like PlayerChrome's seek-bar tick kind.
import { analysisConceptToConceptCard, unitIdForConceptCard, AI_CONCEPT_ID_PREFIX } from "./analysisFormat";
import { conceptLoopSpan } from "./conceptLoop";
import type { AnalysisConcept, AnalysisUnit, AttestationsFile, ConceptCard } from "./types";

export type ConceptCabinetStatus = "attested" | "proposed" | "upcoming";

export interface ConceptCabinetRow {
  id: string;
  title: string;
  t: number;
  end: number;
  status: ConceptCabinetStatus;
  /** Unit type ("Claim", "Mechanism"…) when the row resolves to a typed unit — the mock's small meta line. */
  meta: string | null;
}

function titleCaseUnitType(type: string): string {
  return type.charAt(0) + type.slice(1).toLowerCase();
}

/**
 * Builds the cabinet's row list from the same doc-concept + AI-breakdown
 * merge every other console surface uses, sorted chronologically (mock's own
 * CONCEPTS array order). `end` is a derived span (lib/conceptLoop.ts,
 * "the space between concepts belongs to the current one") so the caller can
 * decide "does the playhead currently sit inside this row" the same way
 * ChaptersRail's `now` chip does.
 */
export function buildConceptCabinetRows(
  concepts: ConceptCard[],
  analysisConcepts: AnalysisConcept[] | undefined,
  analysisUnits: AnalysisUnit[] | undefined,
  attestations: AttestationsFile,
  duration: number
): ConceptCabinetRow[] {
  const cards = [...concepts, ...(analysisConcepts?.map(analysisConceptToConceptCard) ?? [])];
  const allTimes = cards.flatMap((c) => c.anchors.map((a) => a.t).filter((t): t is number => t != null));

  const rows: ConceptCabinetRow[] = [];
  for (const card of cards) {
    const t = card.anchors.find((a) => a.t != null)?.t;
    if (t == null) continue;
    const unitId = unitIdForConceptCard(card.id);
    const isAiBacked = card.id.startsWith(AI_CONCEPT_ID_PREFIX);
    const entry = attestations[unitId];
    const status: ConceptCabinetStatus =
      entry?.status === "attested" ? "attested" : isAiBacked && entry?.status !== "dismissed" ? "proposed" : "upcoming";
    const span = conceptLoopSpan(t, allTimes, duration);
    const unit = analysisUnits?.find((u) => u.id === unitId);
    rows.push({ id: card.id, title: card.title, t, end: span.end, status, meta: unit ? titleCaseUnitType(unit.type) : null });
  }
  return rows.sort((a, b) => a.t - b.t);
}
