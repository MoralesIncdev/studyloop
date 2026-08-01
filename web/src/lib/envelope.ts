// Console slice D (design/mockups/video-console/index.html lines 1116-1140,
// "proposal: arrival + temporal opacity envelope (Kinovea)"): a concept-
// anchored pane isn't just visible/hidden — it fades in as its concept
// approaches, holds full opacity across the concept's span, then decays away
// over its tail. Ported verbatim from the mock's `envelope(sec)`, generalized
// to take the span's start/end instead of a hardcoded concept.

/** Mock's `IN` (index.html line 1127): seconds of fade-in before the span starts. */
export const ENVELOPE_FADE_IN_S = 15;
/** Mock's `OUT`: seconds of decay after the span ends. */
export const ENVELOPE_DECAY_S = 75;
/** Mock's `tickEnvelope()` auto-park threshold (index.html line 1139) — once
 *  the envelope decays to (or below) this, the pane parks instead of sitting
 *  at a barely-visible opacity forever. */
export const ENVELOPE_PARK_THRESHOLD = 0.05;

/**
 * Opacity in [0, 1] for a concept-anchored pane at `currentTime`, given the
 * concept's span [spanStart, spanEnd]. Below `spanStart - fadeIn` or at/after
 * `spanEnd + decay`, this is 0 (fully decayed — the caller auto-parks rather
 * than rendering an invisible pane, mirroring the mock's tickEnvelope()).
 */
export function envelopeOpacity(
  currentTime: number,
  spanStart: number,
  spanEnd: number,
  fadeIn: number = ENVELOPE_FADE_IN_S,
  decay: number = ENVELOPE_DECAY_S
): number {
  if (currentTime < spanStart - fadeIn) return 0;
  if (currentTime < spanStart) return (currentTime - (spanStart - fadeIn)) / fadeIn;
  if (currentTime <= spanEnd) return 1;
  if (currentTime < spanEnd + decay) return 1 - (currentTime - spanEnd) / decay;
  return 0;
}
