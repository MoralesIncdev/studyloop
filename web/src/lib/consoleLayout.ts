// Console slice 8 scaffold (design/mockups/video-console/BUILD-BRIEF.md): pane
// positions are fractional (0-1 of the player frame's width/height), not pixel
// coordinates, so a pane restores to roughly the same spot on the footage
// regardless of viewport size (v6 mock's `fx` pattern). Persisted per
// project+pane in localStorage, like ccStorageKey/railSection elsewhere in
// this app — client-side only, tolerant of a missing/corrupt value rather
// than throwing (private browsing, a hand-edited key, a future schema
// change).

/** A pane's position as a fraction of the player frame's width (fx) and height (fy). */
export interface PaneFraction {
  fx: number;
  fy: number;
}

/** Console slice D: bare (frameless, chrome-on-hover) vs glassy (persistent
 *  glass surface) — the pane-level toggle in the chrome strip (Pane.tsx). */
export type PaneMode = "bare" | "glassy";

/** Console slice D: the resize grip's clamp (Pane.module.css/.tsx). */
export const PANE_MIN_WIDTH_PX = 210;
export const PANE_MAX_WIDTH_PX = 640;

/**
 * Console slice D: extends the slice-8 fx/fy-only shape with the pane's
 * resized width and bare/glassy mode, both optional so a pane that never
 * touched its grip or mode toggle still round-trips cleanly. Backward
 * compatible with everything slice 8 already wrote to localStorage — those
 * entries simply have `width`/`mode` come back `undefined`, and callers fall
 * back to their own defaults exactly like a missing key would.
 */
export interface PaneLayout extends PaneFraction {
  width?: number;
  mode?: PaneMode;
}

/** Clamp a fraction into [0, 1]; NaN (e.g. from corrupt JSON) falls back to 0. */
export function clampFraction(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** Clamp a pane width into the grip's [210, 640] range; NaN falls back to the minimum. */
export function clampPaneWidth(n: number): number {
  if (!Number.isFinite(n)) return PANE_MIN_WIDTH_PX;
  return Math.min(PANE_MAX_WIDTH_PX, Math.max(PANE_MIN_WIDTH_PX, n));
}

const STORAGE_PREFIX = "studyloop:console-layout:";

function storageKey(projectId: string, paneId: string): string {
  return `${STORAGE_PREFIX}${projectId}:${paneId}`;
}

function isPaneFraction(value: unknown): value is PaneFraction {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.fx === "number" && typeof v.fy === "number";
}

function readRaw(projectId: string, paneId: string): PaneLayout | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(projectId, paneId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isPaneFraction(parsed)) return null;
    const v = parsed as unknown as Record<string, unknown>;
    const layout: PaneLayout = { fx: clampFraction(v.fx as number), fy: clampFraction(v.fy as number) };
    if (typeof v.width === "number") layout.width = clampPaneWidth(v.width);
    if (v.mode === "bare" || v.mode === "glassy") layout.mode = v.mode;
    return layout;
  } catch {
    return null;
  }
}

/** Returns null on a missing key, corrupt JSON, or an unrecognized shape — callers fall back to a default position/width/mode. */
export function loadPaneLayout(projectId: string, paneId: string): PaneLayout | null {
  return readRaw(projectId, paneId);
}

function writeRaw(projectId: string, paneId: string, layout: PaneLayout): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(projectId, paneId), JSON.stringify(layout));
  } catch {
    // Storage can throw (private browsing, quota) — the pane just won't
    // remember its position across reloads. Not worth a toast.
  }
}

export function savePaneLayout(projectId: string, paneId: string, pos: PaneFraction): void {
  const existing = readRaw(projectId, paneId) ?? {};
  writeRaw(projectId, paneId, { ...existing, fx: clampFraction(pos.fx), fy: clampFraction(pos.fy) });
}

/**
 * Console slice D: persists the grip-resized width without disturbing the
 * pane's stored position/mode (read-modify-write, same one-blob-per-pane
 * storage as savePaneLayout). `currentPos` is the pane's position AS
 * CURRENTLY DISPLAYED (stored value if any, else its defaultPos) — required
 * because the stored blob's fx/fy are non-optional (isPaneFraction gates
 * every read); resizing before ever dragging must not fabricate a (0,0)
 * position and silently jump the pane to the corner.
 */
export function savePaneWidth(projectId: string, paneId: string, currentPos: PaneFraction, width: number): void {
  const existing = readRaw(projectId, paneId);
  const base = existing ?? currentPos;
  writeRaw(projectId, paneId, { fx: clampFraction(base.fx), fy: clampFraction(base.fy), mode: existing?.mode, width: clampPaneWidth(width) });
}

/** Console slice D: persists the bare/glassy toggle — same currentPos
 *  requirement as savePaneWidth. */
export function savePaneMode(projectId: string, paneId: string, currentPos: PaneFraction, mode: PaneMode): void {
  const existing = readRaw(projectId, paneId);
  const base = existing ?? currentPos;
  writeRaw(projectId, paneId, { fx: clampFraction(base.fx), fy: clampFraction(base.fy), width: existing?.width, mode });
}

/** Edit mode's per-pane reset — forget the stored position so the pane returns
 *  to its default (loadPaneLayout goes back to null). */
export function clearPaneLayout(projectId: string, paneId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(projectId, paneId));
  } catch {
    // Same tolerance as savePaneLayout.
  }
}

/** Every pane id that persists a layout — kept in one place so the "reset all"
 *  corner control (double-click the bento button, slice A) doesn't drift out
 *  of sync with whichever panes actually exist. */
export const ALL_PANE_IDS = ["p-concept", "p-drill", "p-echo", "p-note", "p-test", "p-map", "p-suggest"] as const;

/** Bento-button double-click: forget every pane's stored position for this
 *  project in one shot. Callers still need to force each Pane to re-read
 *  (e.g. remount via a version key) — this only clears storage. */
export function resetAllPaneLayouts(projectId: string): void {
  for (const paneId of ALL_PANE_IDS) clearPaneLayout(projectId, paneId);
}

/** Edit-mode grid snapping (SURVEY.md, WoW Edit Mode / FFXIV): quantize a
 *  fraction to STEP increments so dragged layouts land looking intentional. */
export const EDIT_SNAP_STEP = 0.02;

export function snapFraction(n: number, step: number = EDIT_SNAP_STEP): number {
  return clampFraction(Math.round(n / step) * step);
}
