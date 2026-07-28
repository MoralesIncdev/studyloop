// V2-C: small adapters/helpers shared by the analysis-rendering components
// (AnalysisPanel, ConceptTicker, PlayerChrome's seek ticks) — kept here rather
// than duplicated per-component.
import type { AnalysisConcept, ConceptCard, Pearl } from "./types";

/**
 * Adapts an AI-breakdown concept into the same `ConceptCard` shape doc
 * concepts use, so it can flow through the existing activeConcepts/
 * passedConcepts selectors and the ConceptTicker/ConceptOverlay components
 * unchanged (SPEC: "anchored ones join the ticker windows like doc
 * concepts"). `raw` isn't rendered anywhere; `body` carries the full
 * markdown breakdown (what ConceptCard/ConceptOverlay actually display).
 */
export function analysisConceptToConceptCard(concept: AnalysisConcept): ConceptCard {
  return { id: `ai:${concept.id}`, title: concept.title, body: concept.body, anchors: concept.anchors, raw: concept.body };
}

/** Importance-sorted (3 first), then chronological within the same importance — matches the compiled doc's Pearls section. */
export function sortPearls(pearls: readonly Pearl[]): Pearl[] {
  return [...pearls].sort((a, b) => b.importance - a.importance || a.t - b.t);
}

export function importanceStars(importance: 1 | 2 | 3): string {
  return "★".repeat(importance) + "☆".repeat(3 - importance);
}

/**
 * Deterministic hue (0-359) for an overlay's author handle, so the same
 * handle always renders the same color across the seek bar markers, legend
 * chips, and "Others' analysis" section headers (SPEC: "distinct color per
 * handle"). A simple string hash, not cryptographic — collisions between two
 * handles are a cosmetic near-miss, not a correctness issue.
 */
export function hashHueForHandle(handle: string): number {
  let hash = 0;
  for (let i = 0; i < handle.length; i++) {
    hash = (hash * 31 + handle.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}
