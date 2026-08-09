// Phase 1 "Ingestion Pipeline Repair" (PIPE-02): plan 01-02 put `emptyPageCount`
// on the wire from the real pdf-parse extractor through SlidesMetaSchema; this
// is the web half — a pure, dependency-free, DOM-free copy function so the
// learner sees the empty-page signal in the slides row before analysis runs.
// Node-testable by design (web vitest environment is "node"): no React import,
// no store read, just meta in -> string | null out.
import type { SlidesMeta } from "./types";

/**
 * Derives the empty-page warning copy for a slide deck, or `null` when no
 * warning is warranted. `null` is the contract that keeps a normal
 * text-layer deck's row byte-identical to before this phase — SlidesRow
 * renders nothing when this returns `null`.
 */
export function slidesWarningText(meta: SlidesMeta): string | null {
  const { emptyPageCount, pageCount } = meta;
  if (emptyPageCount <= 0 || pageCount <= 0) return null;

  if (emptyPageCount === pageCount) {
    const pageNoun = pageCount === 1 ? "page" : "pages";
    return `no extractable text on any of the ${pageCount} ${pageNoun} — this deck looks image-only, so the slides channel is empty`;
  }

  const verb = emptyPageCount === 1 ? "has" : "have";
  return `${emptyPageCount} of ${pageCount} pages ${verb} no extractable text — analysis will miss those slides`;
}
