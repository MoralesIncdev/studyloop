// SPEC V2 "Player chrome": a translucent area curve rendered directly above the
// progress bar, YouTube "most replayed" style. Purely presentational — takes a
// `number[]` of bucket densities in [0,1] (see lib/heatmap.ts for the stub
// selector that produces one from bubbles today, pearls once analysis ships).
import styles from "./HeatmapStrip.module.css";

interface Props {
  buckets: number[];
  height?: number;
}

export function HeatmapStrip({ buckets, height = 24 }: Props): JSX.Element | null {
  if (buckets.length === 0 || buckets.every((v) => v === 0)) return null;

  const width = 100; // viewBox units — scales to 100% via the SVG's width attr
  const step = width / (buckets.length - 1 || 1);
  const points = buckets.map((v, i) => [i * step, height - v * height] as const);
  const linePath = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;

  return (
    <svg
      className={styles.strip}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={areaPath} className={styles.area} />
      <path d={linePath} className={styles.line} fill="none" />
    </svg>
  );
}
