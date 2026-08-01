// Console slice D: the constellation map pane's layout — a small graph of a
// video's own concepts (mock's #p-map, index.html lines 464-489, is a single
// hand-placed SVG; a real one needs a deterministic layout for however many
// concepts a given video actually has). No physics/force-directed dependency
// — a golden-angle scatter seeded by index, same family as phyllotaxis
// layouts, gives an even, non-overlapping spread that's identical on every
// render for the same input (required: clicking a node must land on the same
// node next render).

export interface ConstellationInput {
  id: string;
  title: string;
  t: number;
  attested: boolean;
}

export interface ConstellationNode extends ConstellationInput {
  /** Normalized [0, 1] position — the caller scales into its own viewBox. */
  x: number;
  y: number;
  isNow: boolean;
}

export interface ConstellationEdge {
  a: string;
  b: string;
}

/** The golden angle in radians (~137.5°) — successive points at this angular
 *  step never re-align, which is what keeps a phyllotaxis scatter from
 *  producing visible spokes at any node count. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
/** Keeps the scatter inside the unit circle with room for node radius + labels. */
const MAX_RADIUS = 0.42;

/**
 * Deterministic, physics-free scatter: node i sits at radius
 * sqrt((i+0.5)/n) * MAX_RADIUS (equal-area spacing, so density doesn't pile
 * up at the center) and angle i * GOLDEN_ANGLE, centered at (0.5, 0.5).
 * Order of `items` is significant (it's what index i comes from) — callers
 * should pass a stable order (e.g. chronological) so the layout doesn't
 * reshuffle across renders.
 */
export function layoutConstellation(items: readonly ConstellationInput[], activeId: string | null): ConstellationNode[] {
  const n = items.length;
  return items.map((item, i) => {
    const radius = n <= 1 ? 0 : Math.sqrt((i + 0.5) / n) * MAX_RADIUS;
    const theta = i * GOLDEN_ANGLE;
    return {
      ...item,
      x: 0.5 + radius * Math.cos(theta),
      y: 0.5 + radius * Math.sin(theta),
      isNow: activeId != null && item.id === activeId,
    };
  });
}

/**
 * Light edges connecting temporally adjacent concepts (consecutive by `t`),
 * plus same-title cross-links when trivially available (two nodes sharing an
 * exact, case/whitespace-insensitive title — the only "same concept twice"
 * signal cheaply available from a single video's own concept list, short of
 * pulling in the cross-project registry). Deduped — a pair already linked by
 * one rule isn't added again by the other.
 */
export function constellationEdges(nodes: readonly ConstellationNode[]): ConstellationEdge[] {
  const seen = new Set<string>();
  const edges: ConstellationEdge[] = [];
  const add = (a: string, b: string): void => {
    if (a === b) return;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ a, b });
  };

  const byTime = [...nodes].sort((x, y) => x.t - y.t);
  for (let i = 0; i < byTime.length - 1; i++) add(byTime[i].id, byTime[i + 1].id);

  const byTitle = new Map<string, string[]>();
  for (const node of nodes) {
    const key = node.title.trim().toLowerCase();
    if (!key) continue;
    const ids = byTitle.get(key);
    if (ids) ids.push(node.id);
    else byTitle.set(key, [node.id]);
  }
  for (const ids of byTitle.values()) {
    for (let i = 0; i < ids.length - 1; i++) add(ids[i], ids[i + 1]);
  }

  return edges;
}
