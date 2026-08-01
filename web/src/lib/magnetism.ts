// Console slice D (design/mockups/video-console/index.html lines 1011-1023,
// 1038-1043): drag-time magnetism — while dragging a pane in edit mode, its
// position snaps to other visible panes' edges (left edge, or its own right
// edge lining up with another pane's right edge) and the 24px grid origin,
// within a 9px threshold. Pure pixel-space geometry, extracted from the mock
// verbatim so it's testable without a DOM. Pane.tsx converts to/from the
// frame-fraction coordinates it actually persists; when nothing is within
// threshold it falls back to the existing 2% grid `snapFraction`
// (lib/consoleLayout.ts) rather than this module's own grid step.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Mock's `SNAP` (index.html line 1013). */
export const SNAP_THRESHOLD_PX = 9;
/** Mock's edit-mode grid (index.html line 187, `28px 28px`) rounded to a
 *  value StudyLoop's own corner-button grid already uses elsewhere — kept as
 *  its own constant rather than importing consoleLayout's percentage step,
 *  since this module works in pixels. */
export const GRID_ORIGIN_PX = 24;

/**
 * Candidate snap targets for one axis each — mirrors the mock's
 * `snapTargets(el)`: every other visible pane's left edge and (own-width-
 * adjusted) right edge feed the x candidates; every other pane's top edge
 * feeds the y candidates. The grid origin is always a candidate on both axes.
 */
export function snapTargetsFor(draggedWidth: number, others: readonly Rect[]): { xs: number[]; ys: number[] } {
  const xs = [GRID_ORIGIN_PX];
  const ys = [GRID_ORIGIN_PX];
  for (const o of others) {
    xs.push(o.x, o.x + o.w - draggedWidth);
    ys.push(o.y);
  }
  return { xs, ys };
}

/** First candidate within SNAP_THRESHOLD_PX of `value`, else `value` unchanged — mirrors the mock's first-match-wins loop (index.html lines 1041-1042). */
function snapAxis(value: number, candidates: readonly number[]): number {
  for (const candidate of candidates) {
    if (Math.abs(value - candidate) < SNAP_THRESHOLD_PX) return candidate;
  }
  return value;
}

export interface MagnetizeResult {
  x: number;
  y: number;
  /** True when the x (resp. y) value actually snapped to a target — Pane.tsx
   *  uses this to decide whether to fall back to grid-quantizing that axis. */
  snappedX: boolean;
  snappedY: boolean;
}

/** Snaps a dragged pane's proposed top-left (x, y) against every other
 *  visible pane's edges plus the grid origin. `others` should exclude the
 *  dragged pane itself and any hidden/parked pane (mock: `o.style.display
 *  === 'none'` is skipped). */
export function magnetize(x: number, y: number, draggedWidth: number, others: readonly Rect[]): MagnetizeResult {
  const { xs, ys } = snapTargetsFor(draggedWidth, others);
  const sx = snapAxis(x, xs);
  const sy = snapAxis(y, ys);
  return { x: sx, y: sy, snappedX: sx !== x, snappedY: sy !== y };
}
