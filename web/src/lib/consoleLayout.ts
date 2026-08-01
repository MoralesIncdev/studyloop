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

/** Clamp a fraction into [0, 1]; NaN (e.g. from corrupt JSON) falls back to 0. */
export function clampFraction(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
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

/** Returns null on a missing key, corrupt JSON, or an unrecognized shape — callers fall back to a default position. */
export function loadPaneLayout(projectId: string, paneId: string): PaneFraction | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(projectId, paneId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isPaneFraction(parsed)) return null;
    return { fx: clampFraction(parsed.fx), fy: clampFraction(parsed.fy) };
  } catch {
    return null;
  }
}

export function savePaneLayout(projectId: string, paneId: string, pos: PaneFraction): void {
  if (typeof window === "undefined") return;
  try {
    const clamped: PaneFraction = { fx: clampFraction(pos.fx), fy: clampFraction(pos.fy) };
    window.localStorage.setItem(storageKey(projectId, paneId), JSON.stringify(clamped));
  } catch {
    // Storage can throw (private browsing, quota) — the pane just won't
    // remember its position across reloads. Not worth a toast.
  }
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
export const ALL_PANE_IDS = ["p-concept", "p-drill", "p-echo", "p-note"] as const;

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
