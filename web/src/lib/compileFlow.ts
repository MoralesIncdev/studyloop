/**
 * F10 compile flow: pure helpers extracted out of CompileFlow.tsx so the
 * "should we show the caption pass?" decision is unit-testable without
 * rendering anything (web/vitest.config.ts runs in a plain node environment,
 * no DOM — see web/src/lib/notesFormat.ts for the same convention).
 */
import type { Bubble } from "./types";

/**
 * Bubbles worth prompting a caption for before compiling: they have a shot
 * (there's something to look at) but no text yet. Mirrors BubbleRail's
 * `noCaption` badge condition exactly, so the two surfaces never disagree
 * about what counts as "uncaptioned".
 */
export function getUncaptionedBubbles(bubbles: readonly Bubble[]): Bubble[] {
  return bubbles.filter((b) => !!b.shot && b.text.trim().length === 0);
}
