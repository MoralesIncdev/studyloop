// SPEC V2 "Player chrome": a translucent area curve rendered directly above the
// progress bar, YouTube "most replayed" style. Purely presentational — takes a
// `number[]` of bucket densities in [0,1] (see lib/heatmap.ts for the stub
// selector that produces one from bubbles today, pearls once analysis ships).
import styles from "./HeatmapStrip.module.css";

interface Props {
  buckets: number[];
  height?: number;
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

export function HeatmapStrip({ buckets, height = 32 }: Props): JSX.Element | null {
  if (buckets.length === 0 || buckets.every((v) => v === 0)) return null;

  const width = 100; // viewBox units — scales to 100% via the SVG's width attr
  const step = width / (buckets.length - 1 || 1);
  const points = buckets.map((v, i) => [i * step, height - v * height] as const);
  const linePath = smoothedLinePath(points);
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;

  return (
    <svg
      className={styles.strip}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="heatmapFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity=".46" />
          <stop offset="1" stopColor="currentColor" stopOpacity=".08" />
        </linearGradient>
      </defs>
      <path d={areaPath} className={styles.area} />
      <path d={linePath} className={styles.line} fill="none" />
    </svg>
  );
}
