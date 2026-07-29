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

// --- V3-C C5 "Attention heatmap" (PEDAGOGY.md §7) ---------------------------
//
// "Aggregated marks measure attention; peaks may be confusion, not value, and
// crowd signal washes out expert signal. [...] render user layer and overlay
// layer separately (smooth within, never across)." This is the whole reason
// GET /api/projects/:id/heatmap now returns TWO independently-bucketed/
// normalized arrays (`own`, `overlays`) instead of one merged array — merging
// them (the old V2-C behavior, still exercised by bucketizeHeatmap itself
// above) let a crowd of imported marks visually dominate the learner's own,
// and a single normalized peak lost the distinction between "I marked this a
// lot" and "someone I imported marked this a lot".

export interface HeatmapMark {
  t: number;
  kind: "bubble" | "pearl";
  /** Pearls only. */
  importance?: 1 | 2 | 3;
  text: string;
  /** "You" for the learner's own marks; the overlay's shareHandle otherwise. */
  author: string;
}

export interface LayeredHeatmapInput {
  ownBubbles: readonly { t: number; text: string }[];
  ownPearls: readonly { t: number; label: string; importance: number }[];
  overlayBubbles: readonly { t: number; text: string; author: string }[];
  overlayPearls: readonly { t: number; label: string; importance: number; author: string }[];
}

export interface LayeredHeatmapResult {
  own: number[];
  overlays: number[];
  marks: { own: HeatmapMark[]; overlays: HeatmapMark[] };
}

/**
 * Builds the two independently-smoothed/normalized layers plus the raw mark
 * lists the click-to-inspect popover needs (SPEC C5: "popover listing marks
 * within that bucket (±1 bucket): author handle, type, text snippet").
 * Bubbles weight 1, pearls weight = importance — same relative weighting
 * within each layer as the pre-V3-C merged heatmap used, just no longer
 * cross-layer-downweighted (that ×0.5 existed only to keep a merged array
 * from letting overlays dominate; independent per-layer normalization makes
 * it moot — each layer's own peak is always 1).
 */
export function buildLayeredHeatmap(
  input: LayeredHeatmapInput,
  duration: number,
  bucketCount: number = HEATMAP_BUCKET_COUNT,
  sigma: number = HEATMAP_SMOOTH_SIGMA
): LayeredHeatmapResult {
  const ownPoints: HeatmapPoint[] = [
    ...input.ownBubbles.map((b) => ({ t: b.t, weight: 1 })),
    ...input.ownPearls.map((p) => ({ t: p.t, weight: p.importance })),
  ];
  const overlayPoints: HeatmapPoint[] = [
    ...input.overlayBubbles.map((b) => ({ t: b.t, weight: 1 })),
    ...input.overlayPearls.map((p) => ({ t: p.t, weight: p.importance })),
  ];

  const ownMarks: HeatmapMark[] = [
    ...input.ownBubbles.map((b): HeatmapMark => ({ t: b.t, kind: "bubble", text: b.text || "(no caption)", author: "You" })),
    ...input.ownPearls.map(
      (p): HeatmapMark => ({ t: p.t, kind: "pearl", importance: clampImportance(p.importance), text: p.label, author: "You" })
    ),
  ];
  const overlayMarks: HeatmapMark[] = [
    ...input.overlayBubbles.map(
      (b): HeatmapMark => ({ t: b.t, kind: "bubble", text: b.text || "(no caption)", author: b.author })
    ),
    ...input.overlayPearls.map(
      (p): HeatmapMark => ({ t: p.t, kind: "pearl", importance: clampImportance(p.importance), text: p.label, author: p.author })
    ),
  ];

  return {
    own: bucketizeHeatmap(ownPoints, duration, bucketCount, sigma),
    overlays: bucketizeHeatmap(overlayPoints, duration, bucketCount, sigma),
    marks: { own: ownMarks, overlays: overlayMarks },
  };
}

// --- V3-C review fix #6 "YouTube heatmaps positioned against the last mark,
// not video duration" ---------------------------------------------------
//
// routes/heatmap.ts previously had no YouTube duration source at all and
// fell back to `maxMarkTime * 1.05` — for a 60-minute video whose last mark
// sits at 10 minutes, that plots the last mark near 95% of the seek bar
// instead of ~17%, and click-to-inspect bucket mapping is correspondingly
// wrong (PEDAGOGY §7). This orders duration sources from most to least
// authoritative, kept pure/dependency-free (no fs) so it's directly
// unit-testable — routes/heatmap.ts is the only place that gathers the raw
// inputs (project.durationSeconds, an ffprobe result for local sources, the
// project's transcript's last segment end, watchedUpTo, and the raw mark
// times) and calls this.

export interface HeatmapDurationSources {
  /** project.durationSeconds — persisted once the player learns it (loadedmetadata / YT API), via a small PATCH from the web app. Most authoritative: it's the real video length, not a derived estimate. */
  storedDurationSeconds?: number | null;
  /** ffprobe result for local sources only (routes/heatmap.ts's existing resolveDuration) — also a real measurement, just not yet persisted onto the project. */
  probedDurationSeconds?: number | null;
  /** The project's transcript's last segment `end`, if a transcript exists — usually a close estimate of full video length since captions/transcripts typically run to the end. */
  transcriptEndSeconds?: number | null;
  /** project.watchedUpTo — the furthest playback position ever reached; a lower bound on duration. */
  watchedUpToSeconds?: number;
  /** Every own/overlay bubble/pearl timestamp — the last-resort estimate this fix demotes to (previously the ONLY estimate, times 1.05). */
  markTimes?: readonly number[];
}

/**
 * Resolves a bucketing-range duration in preference order: a stored/probed
 * real measurement first, then the best available estimate
 * (max(transcript end, watchedUpTo, latest mark)) — never the old
 * `maxMarkTime * 1.05` heuristic alone.
 */
export function resolveHeatmapDuration(sources: HeatmapDurationSources): number {
  if (sources.storedDurationSeconds != null && sources.storedDurationSeconds > 0) {
    return sources.storedDurationSeconds;
  }
  if (sources.probedDurationSeconds != null && sources.probedDurationSeconds > 0) {
    return sources.probedDurationSeconds;
  }
  const markMax = (sources.markTimes ?? []).reduce((max, t) => Math.max(max, t), 0);
  const candidates = [sources.transcriptEndSeconds ?? 0, sources.watchedUpToSeconds ?? 0, markMax];
  return Math.max(0, ...candidates);
}

function clampImportance(n: number): 1 | 2 | 3 {
  if (n >= 3) return 3;
  if (n <= 1) return 1;
  return 2;
}

/**
 * Marks within ±1 bucket of the bucket containing `t` (SPEC C5: "popover
 * listing marks within that bucket (±1 bucket)"). `bucketIndex` is derived
 * the same way bucketizeHeatmap's own loop derives it, so the popover's
 * notion of "which bucket" always matches what was actually plotted there.
 */
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
