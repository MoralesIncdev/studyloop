// Console slice B: the transport's inline speed control (mock line 689 shows
// a static "1.5×" — SPEC deviation, approved: clicking it cycles rates
// instead of only being readable, since the mock's speed control had no
// interaction of its own to model). Pure cycle-selection logic so
// PlayerControls only has to call `nextPlaybackRate(playbackRate)`.

export const RATE_CYCLE = [1, 1.25, 1.5, 1.75, 2] as const;

/** The next rate after `current` in RATE_CYCLE, wrapping around. A current
 *  rate outside the cycle (e.g. left over from the old settings menu, which
 *  offered a wider range) snaps forward to the first cycle value greater
 *  than it, wrapping to the start if it was already past the top. */
export function nextPlaybackRate(current: number): number {
  const i = RATE_CYCLE.indexOf(current as (typeof RATE_CYCLE)[number]);
  if (i >= 0) return RATE_CYCLE[(i + 1) % RATE_CYCLE.length];
  const next = RATE_CYCLE.find((r) => r > current);
  return next ?? RATE_CYCLE[0];
}
