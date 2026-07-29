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
