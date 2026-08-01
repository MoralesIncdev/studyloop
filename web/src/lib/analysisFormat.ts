// V2-C: small adapters/helpers shared by the analysis-rendering components
// (AnalysisPanel, ConceptChipStrip, PlayerChrome's seek ticks) — kept here
// rather than duplicated per-component.
import type { AnalysisConcept, ConceptCard, Pearl } from "./types";

/**
 * Every AI-breakdown concept's `ConceptCard.id` (and `highlightedConceptId`
 * value when a chip targets one — see ConceptChipStrip.tsx) carries this
 * prefix so ConceptsDock (doc concepts) and AnalysisSections' AiBreakdownSection
 * (AI concepts) can each recognize which chip-highlight targets are theirs
 * to handle (V3-A review finding #4).
 */
export const AI_CONCEPT_ID_PREFIX = "ai:";

/**
 * Adapts an AI-breakdown concept into the same `ConceptCard` shape doc
 * concepts use, so it can flow through the existing activeConcepts/
 * passedConcepts selectors and the ConceptChipStrip components unchanged
 * (SPEC: "anchored ones join the ticker windows like doc concepts"). `raw`
 * isn't rendered anywhere; `body` carries the full markdown breakdown.
 */
export function analysisConceptToConceptCard(concept: AnalysisConcept): ConceptCard {
  return {
    id: `${AI_CONCEPT_ID_PREFIX}${concept.id}`,
    title: concept.title,
    body: concept.body,
    anchors: concept.anchors,
    raw: concept.body,
  };
}

/**
 * Console slice B: the seek bar's tick vocabulary (attested/proposed/plain,
 * PlayerChrome.tsx) needs to look an AI-breakdown ConceptCard back up in
 * `attestations`, which is keyed by `analysis.units[].id` — the *unprefixed*
 * id (server's unitsToConceptsMirror keeps analysis.concepts 1:1 with
 * analysis.units by id; analysisConceptToConceptCard above is what adds the
 * `ai:` prefix on the way into ConceptCard-shaped data). Doc concepts never
 * carry the prefix, so this is a no-op for them — their id already isn't in
 * the unit id-space, and an attestations lookup on it will simply miss.
 */
export function unitIdForConceptCard(cardId: string): string {
  return cardId.startsWith(AI_CONCEPT_ID_PREFIX) ? cardId.slice(AI_CONCEPT_ID_PREFIX.length) : cardId;
}

/**
 * Console slice B: every concept-tick timestamp across doc concepts + the
 * AI breakdown, flattened and de-anchored — the ←/→ prev/next-concept hotkey
 * (hotkeys.ts) needs exactly this set (unsorted, may repeat) to find the
 * nearest tick via lib/conceptLoop.ts's adjacentConceptTick. PlayerChrome's
 * own conceptTicks memo builds the same anchors into id/title-carrying tick
 * objects for rendering; this is the lighter times-only cut for hotkey nav.
 */
export function conceptTickTimes(concepts: ConceptCard[], analysisConcepts?: AnalysisConcept[]): number[] {
  const cards = analysisConcepts ? [...concepts, ...analysisConcepts.map(analysisConceptToConceptCard)] : concepts;
  return cards.flatMap((c) => c.anchors.map((a) => a.t).filter((t): t is number => t != null));
}

/** Importance-sorted (3 first), then chronological within the same importance — matches the compiled doc's Pearls section. */
export function sortPearls(pearls: readonly Pearl[]): Pearl[] {
  return [...pearls].sort((a, b) => b.importance - a.importance || a.t - b.t);
}

/** Three-slot filled/outline star state for a pearl's importance rating —
 * rendered as `Icon name="star"|"starOutline"` by the caller (no glyph
 * characters; see components/icons.tsx). */
export function starStates(importance: 1 | 2 | 3): boolean[] {
  return [1, 2, 3].map((n) => n <= importance);
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
