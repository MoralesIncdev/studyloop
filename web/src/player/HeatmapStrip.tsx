// SPEC V2 "Player chrome" + V3-C C5 "Attention heatmap" (PEDAGOGY.md §7): a
// translucent area curve rendered directly above the progress bar, YouTube
// "most replayed" style — now TWO layers ("own" solid, "overlays"
// translucent, per PEDAGOGY §7: "render user layer and overlay layer
// separately... never averaged into the crowd curve"). Clicking the strip
// opens a click-to-inspect popover (SPEC C5) instead of seeking — it
// stopPropagation()s so the click never reaches SeekBar's track underneath.
import { useCallback, useRef } from "react";
import { formatTimestamp } from "../lib/time";
import styles from "./HeatmapStrip.module.css";

/** Console slice 5: the peak label is suppressed until this many buckets have
 *  data — a half-watched video shouldn't advertise a misleading spike
 *  (SURVEY.md, YouTube's cold-start suppression). */
const PEAK_MIN_NONZERO_BUCKETS = 8;

interface Props {
  own: number[];
  overlays?: number[];
  height?: number;
  /** Click-to-inspect (SPEC C5) — receives the click's ratio (0..1) along the strip. Omit to render decoratively (no pointer events). */
  onInspect?: (ratio: number) => void;
  /** Console slice 5 (SURVEY.md, YouTube "Most replayed"): with both present,
   *  the tallest own-layer peak gets a clickable "Most reviewed" label. */
  duration?: number;
  onSeekPeak?: (t: number) => void;
}

/** Monotone cubic (Catmull-Rom-derived) smoothing so the strip reads as a
 * curve rather than a straight point-to-point polyline. */
function smoothedLinePath(points: readonly (readonly [number, number])[]): string {
  if (points.length < 3) {
    return points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  }
  let d = `M${points[0][0].toFixed(2)},${points[0][1].toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? i : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  return d;
}

function layerPaths(buckets: number[], width: number, height: number): { line: string; area: string } | null {
  if (buckets.length === 0 || buckets.every((v) => v === 0)) return null;
  const step = width / (buckets.length - 1 || 1);
  const points = buckets.map((v, i) => [i * step, height - v * height] as const);
  const line = smoothedLinePath(points);
  const area = `${line} L${width},${height} L0,${height} Z`;
  return { line, area };
}

export function HeatmapStrip({ own, overlays = [], height = 32, onInspect, duration, onSeekPeak }: Props): JSX.Element | null {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const width = 100; // viewBox units — scales to 100% via the SVG's width attr

  const ownPaths = layerPaths(own, width, height);
  const overlayPaths = layerPaths(overlays, width, height);

  // Console slice 5: locate the own-layer peak (cold-start suppressed).
  let peak: { ratio: number; t: number } | null = null;
  if (duration != null && duration > 0 && onSeekPeak && own.length > 1) {
    const nonzero = own.filter((v) => v > 0).length;
    if (nonzero >= PEAK_MIN_NONZERO_BUCKETS) {
      const maxV = Math.max(...own);
      const i = own.indexOf(maxV);
      peak = { ratio: i / (own.length - 1), t: ((i + 0.5) / own.length) * duration };
    }
  }

  // Rules of Hooks: every hook must run unconditionally on every render, so
  // this early return has to come AFTER useCallback below — an earlier
  // version returned before useCallback, which meant a render where
  // own/overlays both had data called one more hook than an empty render
  // right before/after it, crashing React with a "change in the order of
  // Hooks" error the instant the heatmap actually had something to show.
  const handleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!onInspect) return;
      e.stopPropagation();
      const el = svgRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      onInspect(ratio);
    },
    [onInspect]
  );

  if (!ownPaths && !overlayPaths) return null;

  return (
    <>
    {peak && (
      <button
        type="button"
        className={styles.peakLabel}
        style={{ left: `clamp(60px, ${(peak.ratio * 100).toFixed(2)}%, calc(100% - 60px))` }}
        onClick={(e) => {
          e.stopPropagation();
          onSeekPeak?.(peak.t);
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        Most reviewed · {formatTimestamp(peak.t)}
      </button>
    )}
    <svg
      ref={svgRef}
      className={`${styles.strip} ${onInspect ? styles.interactive : ""}`}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role={onInspect ? "button" : undefined}
      aria-label={onInspect ? "Capture density — click to inspect marks" : undefined}
      aria-hidden={onInspect ? undefined : "true"}
      onMouseDown={(e) => {
        if (onInspect) e.stopPropagation();
      }}
      onClick={handleClick}
    >
      <defs>
        <linearGradient id="heatmapFillOwn" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity=".46" />
          <stop offset="1" stopColor="currentColor" stopOpacity=".08" />
        </linearGradient>
        <linearGradient id="heatmapFillOverlays" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent-blue)" stopOpacity=".32" />
          <stop offset="1" stopColor="var(--accent-blue)" stopOpacity=".04" />
        </linearGradient>
      </defs>
      {overlayPaths && (
        <g className={styles.overlayLayer}>
          <path d={overlayPaths.area} className={styles.overlayArea} />
          <path d={overlayPaths.line} className={styles.overlayLine} fill="none" />
        </g>
      )}
      {ownPaths && (
        <g className={styles.ownLayer}>
          <path d={ownPaths.area} className={styles.area} />
          <path d={ownPaths.line} className={styles.line} fill="none" />
        </g>
      )}
    </svg>
    </>
  );
}
