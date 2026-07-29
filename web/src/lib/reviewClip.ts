/**
 * F11 Review Mode "Clip loop" (SPEC): a bubble card's back offers a 10s clip
 * centered on the card's timestamp — [t-5, t+5], clamped so it never starts
 * before 0. Pure so it's testable without mounting a <video> element.
 */
export interface ClipBounds {
  start: number;
  end: number;
}

export const CLIP_HALF_WINDOW_SECONDS = 5;

export function clipBounds(t: number): ClipBounds {
  const start = Math.max(0, t - CLIP_HALF_WINDOW_SECONDS);
  const end = t + CLIP_HALF_WINDOW_SECONDS;
  return { start, end };
}
