// SUPERSEDED (V2-C, then V3-C C5): PlayerChrome now sources the heatmap from
// the real `GET /api/projects/:id/heatmap` (server-side Gaussian smoothing —
// see server/src/lib/heatmap.ts) via the store's `heatmapOwn`/`heatmapOverlays`/
// `loadHeatmap`, not this client-side stand-in. Kept only for its unit test
// coverage of the bucketing math this module pioneered; not imported by any
// component anymore.
import type { Bubble } from "./types";

export const HEATMAP_BUCKET_COUNT = 100;

/** A single time point weighted by how "notable" it is (bubble = 1, could later carry pearl importance). */
export interface HeatmapPoint {
  t: number;
  weight: number;
}

/**
 * Buckets weighted points over [0, duration] into `bucketCount` buckets, then
 * applies a small box-blur smoothing pass so neighboring buckets bleed into
 * each other (approximates the server's eventual Gaussian smoothing — see
 * SPEC — without needing real math here). Returns values normalized to
 * [0, 1]; an empty/zero-duration input returns an all-zero array.
 */
export function bucketize(
  points: readonly HeatmapPoint[],
  duration: number,
  bucketCount: number = HEATMAP_BUCKET_COUNT
): number[] {
  const buckets = new Array<number>(Math.max(1, bucketCount)).fill(0);
  if (duration <= 0) return buckets;

  const bucketDuration = duration / buckets.length;
  for (const point of points) {
    if (point.t < 0 || point.t > duration) continue;
    const idx = Math.min(buckets.length - 1, Math.floor(point.t / bucketDuration));
    buckets[idx] += point.weight;
  }

  // Box blur, radius 2 — cheap smoothing so the strip reads as a curve
  // rather than a bar chart.
  const RADIUS = 2;
  const smoothed = buckets.map((_, i) => {
    let sum = 0;
    let count = 0;
    for (let d = -RADIUS; d <= RADIUS; d++) {
      const j = i + d;
      if (j < 0 || j >= buckets.length) continue;
      sum += buckets[j];
      count++;
    }
    return sum / count;
  });

  const max = Math.max(...smoothed, 0);
  if (max <= 0) return smoothed;
  return smoothed.map((v) => v / max);
}

/** Density stub fed to the heatmap strip — bubbles only, for now (SPEC: pearls come with the analysis engine). */
export function bubbleHeatmap(
  bubbles: readonly Bubble[],
  duration: number,
  bucketCount: number = HEATMAP_BUCKET_COUNT
): number[] {
  return bucketize(
    bubbles.map((b) => ({ t: b.t, weight: 1 })),
    duration,
    bucketCount
  );
}
