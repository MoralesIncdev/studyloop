// V3-B B3 "Study Path rail tab" (SPEC): "topological order over
// REQUIRES/PROCEDURE_STEP edges (fallback: anchor time order)... Low-
// confidence (<0.6) edges do not affect ordering (time order wins)." Pure —
// no store/React dependency — so it's directly unit-testable, matching this
// codebase's web/src/lib/*.ts convention (conceptChips.ts, heatmap.ts).
import type { AnalysisEdge, AnalysisUnit } from "./types";

/** SPEC B3: edges below this confidence are excluded from ordering entirely — time order wins for those units regardless of what the edge claimed. */
export const PATH_EDGE_CONFIDENCE_THRESHOLD = 0.6;

/** A unit's own first anchor time (fallback ordering key, and the tie-breaker within Kahn's algorithm — see topoSortUnits). */
function firstAnchorTime(unit: AnalysisUnit): number {
  if (unit.anchors.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(...unit.anchors.map((a) => a.t));
}

/**
 * Orders units for the Study Path rail. Only REQUIRES/PROCEDURE_STEP edges
 * at or above `PATH_EDGE_CONFIDENCE_THRESHOLD` participate (SPEC: an edge
 * "requires" its source to come after its target — i.e. target is the
 * prerequisite, source depends on it; PROCEDURE_STEP is source-before-target
 * in step order). Uses Kahn's algorithm (stable: ties always break by
 * ascending first-anchor time, so units with no orderable edges at all still
 * come out in a sensible sequence) and falls back to a pure time sort for
 * any units left over once no more edges can be resolved (a cycle, or a
 * unit with no anchors and no edges) — SPEC: "fallback: anchor time order",
 * applied per-remaining-unit rather than aborting the whole ordering.
 */
export function topoSortUnits(units: readonly AnalysisUnit[], edges: readonly AnalysisEdge[]): AnalysisUnit[] {
  const byId = new Map(units.map((u) => [u.id, u]));
  const orderEdges = edges.filter(
    (e) => (e.type === "REQUIRES" || e.type === "PROCEDURE_STEP") && e.confidence >= PATH_EDGE_CONFIDENCE_THRESHOLD && byId.has(e.source) && byId.has(e.target)
  );

  // REQUIRES: source requires target as a prerequisite -> target before source.
  // PROCEDURE_STEP: source is the step before target -> source before target.
  const predecessors = new Map<string, Set<string>>(); // unitId -> set of unit ids that must come before it
  for (const u of units) predecessors.set(u.id, new Set());
  for (const e of orderEdges) {
    if (e.type === "REQUIRES") {
      predecessors.get(e.source)!.add(e.target);
    } else {
      predecessors.get(e.target)!.add(e.source);
    }
  }

  const remaining = new Set(units.map((u) => u.id));
  const result: AnalysisUnit[] = [];

  const byTimeThenId = (a: string, b: string): number => {
    const ua = byId.get(a)!;
    const ub = byId.get(b)!;
    const ta = firstAnchorTime(ua);
    const tb = firstAnchorTime(ub);
    if (ta !== tb) return ta - tb;
    return ua.label.localeCompare(ub.label);
  };

  // Kahn's algorithm: repeatedly take all units whose predecessors are all
  // already placed, in time order among that ready set — this is what makes
  // a cycle degrade gracefully (nothing left is "ready", the loop below
  // falls through to the time-order fallback for whatever's left) instead
  // of throwing or hanging.
  let progressed = true;
  while (remaining.size > 0 && progressed) {
    progressed = false;
    const ready = [...remaining].filter((id) => [...predecessors.get(id)!].every((p) => !remaining.has(p)));
    if (ready.length === 0) break;
    ready.sort(byTimeThenId);
    for (const id of ready) {
      result.push(byId.get(id)!);
      remaining.delete(id);
      progressed = true;
    }
  }

  // Fallback for anything left (a cycle, or units unreachable via the
  // ready-set process for any other reason) — pure anchor-time order.
  if (remaining.size > 0) {
    const leftover = [...remaining].sort(byTimeThenId).map((id) => byId.get(id)!);
    result.push(...leftover);
  }

  return result;
}

// --- V3-D D2 "Study Path inserts a REINFORCE step (repeat slot) 2 positions
// after a threshold unit" ----------------------------------------------------

export type StudyPathStep =
  | { kind: "unit"; unit: AnalysisUnit }
  | { kind: "reinforce"; id: string; afterUnit: AnalysisUnit };

/**
 * Wraps `topoSortUnits`' ordering with SPEC D2's REINFORCE insertions: for
 * every threshold-flagged unit at position `i` in the topo-sorted sequence,
 * a synthetic "repeat slot" step is inserted at position `i + 2` (clamped to
 * the end of the path for a threshold unit near the tail). Insertions are
 * computed against the ORIGINAL (pre-insertion) indices and applied from the
 * highest target index down to the lowest, so earlier insertions never shift
 * a later one's already-resolved position — standard "insert-many by
 * descending index" technique, and the only way multiple insertions compose
 * correctly without re-deriving positions after each splice.
 */
export function buildStudyPathSteps(units: readonly AnalysisUnit[], edges: readonly AnalysisEdge[]): StudyPathStep[] {
  const ordered = topoSortUnits(units, edges);
  const steps: StudyPathStep[] = ordered.map((unit) => ({ kind: "unit", unit }));

  const insertions = ordered
    .map((unit, i) => ({ at: Math.min(i + 2, ordered.length), unit, i }))
    .filter(({ unit }) => unit.threshold)
    // Descending by target index (ties broken by descending original index,
    // an arbitrary but stable choice) so each splice's index is still valid
    // relative to everything already inserted.
    .sort((a, b) => (b.at !== a.at ? b.at - a.at : b.i - a.i));

  for (const { at, unit } of insertions) {
    steps.splice(at, 0, { kind: "reinforce", id: `reinforce:${unit.id}`, afterUnit: unit });
  }

  return steps;
}
