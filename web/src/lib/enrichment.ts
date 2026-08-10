// ANLZ-02 "Ungrounded enrichment marking" (Phase 2): the web half of the
// self-reported groundedness flag threaded through server/src/lib/analysis.ts
// (ChunkUnitRawSchema/AnalysisUnitSchema `enrichment`). Same pure,
// dependency-free, DOM-free copy-function contract as slidesWarning.ts — no
// React import, no store read, no DOM — so it stays node-testable in a
// codebase where web/src/concepts/ has no component-test harness.
//
// Parameter is a structural type, not `AnalysisUnit`, so a later plan
// (02-03, pearls/compiled export) can pass a `Pearl` or any other shape
// carrying the same flag through this identical helper.

/** Locked copy (02-CONTEXT.md interface_context) — plan 02-03 reuses this exact wording. */
const ENRICHMENT_NOTICE_TEXT = "Not stated in this lecture — added for context";

/**
 * Derives the enrichment notice copy for a unit (or pearl) carrying the
 * ANLZ-02 self-reported groundedness flag, or `null` when no notice is
 * warranted. `null` is the contract that keeps an unflagged card
 * byte-identical to before this plan — the caller renders nothing when this
 * returns `null`.
 */
export function enrichmentNoticeText(source: { enrichment?: boolean }): string | null {
  return source.enrichment === true ? ENRICHMENT_NOTICE_TEXT : null;
}
