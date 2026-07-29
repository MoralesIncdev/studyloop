// V3-C C5 "Attention heatmap" (PEDAGOGY.md §7): client-side mirror of the
// server's ±1-bucket math (server/src/lib/heatmap.ts's marksNearBucket) —
// GET /api/projects/:id/heatmap already returns every mark behind both
// layers (own/overlays), so a click on the strip resolves "which marks does
// this bucket represent" locally, no network round trip.
import type { HeatmapMark } from "./types";

/** Which bucket index a timestamp falls into, given `duration`/`bucketCount` (same math as bucketizeHeatmap's own loop). */
export function bucketIndexForTime(t: number, duration: number, bucketCount: number): number {
  if (duration <= 0 || bucketCount <= 0) return 0;
  const bucketDuration = duration / bucketCount;
  return Math.min(bucketCount - 1, Math.max(0, Math.floor(t / bucketDuration)));
}

/** Marks within ±1 bucket of `bucketIndex` — mirrors server/src/lib/heatmap.ts's marksNearBucket exactly. */
export function marksNearBucket(
  marks: readonly HeatmapMark[],
  bucketIndex: number,
  bucketCount: number,
  duration: number
): HeatmapMark[] {
  if (duration <= 0 || bucketCount <= 0) return [];
  const bucketDuration = duration / bucketCount;
  return marks.filter((m) => {
    if (m.t < 0 || m.t > duration) return false;
    const idx = Math.min(bucketCount - 1, Math.floor(m.t / bucketDuration));
    return Math.abs(idx - bucketIndex) <= 1;
  });
}

/**
 * Resolves the marks behind a click at a given ratio (0..1) along the strip
 * — combines own + overlay marks into one popover list, own first, sorted by
 * time. Used directly by SeekBar's click handler.
 */
export function marksForClickRatio(
  ratio: number,
  duration: number,
  bucketCount: number,
  own: readonly HeatmapMark[],
  overlays: readonly HeatmapMark[]
): HeatmapMark[] {
  const t = Math.min(duration, Math.max(0, ratio * duration));
  const bucketIndex = bucketIndexForTime(t, duration, bucketCount);
  const ownNear = marksNearBucket(own, bucketIndex, bucketCount, duration);
  const overlaysNear = marksNearBucket(overlays, bucketIndex, bucketCount, duration);
  return [...ownNear, ...overlaysNear].sort((a, b) => a.t - b.t);
}

const LEGEND_STORAGE_KEY = "studyloop:attentionLegendSeen";

/** SPEC C5: "Legend line one-time" — global (not per-project), never shown again once dismissed/shown. */
export function hasSeenAttentionLegend(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(LEGEND_STORAGE_KEY) === "1";
  } catch {
    return true; // storage unavailable (private browsing) — don't nag every load
  }
}

export function markAttentionLegendSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LEGEND_STORAGE_KEY, "1");
  } catch {
    // ignore — see hasSeenAttentionLegend
  }
}
