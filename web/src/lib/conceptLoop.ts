// Console slice 1 (design/mockups/video-console/SURVEY.md, delta #1): clicking a
// concept tick scopes playback to that concept's span — the range becomes the
// playback window, loopable, which is the drill-a-segment mechanic (Frame.io's
// range-comment playback, Hudl's range-scoped review).
//
// Concept anchors are points, not ranges (ConceptAnchor carries only `t`), so the
// span is derived: a concept owns the timeline from its anchor until the next
// concept tick of any concept, capped at DEFAULT_SPAN_S — "the space between
// concepts belongs to the current one."

export const DEFAULT_SPAN_S = 60;
/** A span never collapses below this, even with a near-adjacent next tick. */
export const MIN_SPAN_S = 10;

/**
 * Derive the loop span for a concept tick at `t`, given every tick time on the
 * bar (any concept, unsorted, may include `t` itself) and the video duration.
 */
export function conceptLoopSpan(
  t: number,
  allTickTimes: number[],
  duration: number
): { start: number; end: number } {
  const start = Math.max(0, t);
  const next = allTickTimes
    .filter((x) => x > t + MIN_SPAN_S)
    .sort((a, b) => a - b)[0];
  const cap = start + DEFAULT_SPAN_S;
  const end = Math.min(duration > 0 ? duration : cap, next ?? cap, cap);
  return { start, end: Math.max(end, start + MIN_SPAN_S) };
}
