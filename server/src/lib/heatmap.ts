// V2-C "Heatmap + shareable analysis" (SPEC): pure bucketing + Gaussian
// smoothing math for GET /api/projects/:id/heatmap. Kept dependency-free and
// side-effect-free (no fs/network) so it's directly unit-testable — the route
// (routes/heatmap.ts) is the only place that assembles real bubbles/pearls/
// overlay data into `HeatmapPoint[]` and calls this.

/** SPEC: "200-bucket density array over video duration". */
export const HEATMAP_BUCKET_COUNT = 200;

/** Default Gaussian smoothing sigma, in buckets. */
export const HEATMAP_SMOOTH_SIGMA = 2;

export interface HeatmapPoint {
  t: number;
  weight: number;
}

/**
 * Builds a normalized (odd-length, sums to 1) 1D Gaussian kernel with the
 * given standard deviation, truncated at `radius` (default: 3 sigma, the
 * point past which the kernel's contribution is negligible).
 */
export function gaussianKernel(sigma: number, radius: number = Math.max(1, Math.ceil(sigma * 3))): number[] {
  const raw: number[] = [];
  for (let i = -radius; i <= radius; i++) {
    raw.push(Math.exp(-(i * i) / (2 * sigma * sigma)));
  }
  const sum = raw.reduce((a, b) => a + b, 0);
  return sum > 0 ? raw.map((v) => v / sum) : raw;
}

/**
 * Convolves `values` with a Gaussian kernel of the given sigma (edge buckets
 * are handled by simply omitting out-of-range kernel taps, i.e. no wraparound
 * and no zero-padding bias — equivalent to renormalizing at the edges implicitly
 * since we sum weighted values directly rather than dividing by a fixed kernel sum).
 */
export function gaussianSmooth(values: readonly number[], sigma: number = HEATMAP_SMOOTH_SIGMA): number[] {
  if (values.length === 0) return [];
  if (sigma <= 0) return [...values];
  const kernel = gaussianKernel(sigma);
  const radius = (kernel.length - 1) / 2;
  return values.map((_, i) => {
    let sum = 0;
    for (let k = 0; k < kernel.length; k++) {
      const j = i + k - radius;
      if (j < 0 || j >= values.length) continue;
      sum += values[j] * kernel[k];
    }
    return sum;
  });
}

/**
 * Buckets weighted time points into `bucketCount` buckets over [0, duration],
 * then Gaussian-smooths and normalizes the result to [0, 1]. Points outside
 * [0, duration] or with non-positive weight are dropped. A non-positive
 * duration, or a point set that nets to all-zero after smoothing, returns an
 * all-zero array of the requested length (never throws, never NaN).
 */
export function bucketizeHeatmap(
  points: readonly HeatmapPoint[],
  duration: number,
  bucketCount: number = HEATMAP_BUCKET_COUNT,
  sigma: number = HEATMAP_SMOOTH_SIGMA
): number[] {
  const count = Math.max(1, Math.floor(bucketCount));
  const buckets = new Array<number>(count).fill(0);
  if (duration <= 0) return buckets;

  const bucketDuration = duration / count;
  for (const point of points) {
    if (point.t < 0 || point.t > duration || point.weight <= 0) continue;
    const idx = Math.min(count - 1, Math.floor(point.t / bucketDuration));
    buckets[idx] += point.weight;
  }

  const smoothed = gaussianSmooth(buckets, sigma);
  const max = Math.max(0, ...smoothed);
  if (max <= 0) return smoothed.map(() => 0);
  return smoothed.map((v) => Math.min(1, Math.max(0, v / max)));
}
