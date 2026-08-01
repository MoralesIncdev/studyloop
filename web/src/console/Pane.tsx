// Console slice 8 (design/mockups/video-console/BUILD-BRIEF.md): the shared
// pane shell — every console pane is bare content over the footage with a
// hover-ghosted glass chrome strip (label left, tool buttons right, whole strip
// is the drag affordance) and fractional per-project position persistence
// (lib/consoleLayout.ts). Type-specific panes supply the label/tools/body;
// this owns drag, clamping, and persistence. Perf constraint from the brief:
// backdrop-filter only ever applies to the chrome strip, never a full pane.
import { useEffect, useRef, useState, type PointerEvent, type ReactNode, type RefObject } from "react";
import { useStudyLoopStore } from "../state/store";
import {
  clampFraction,
  clearPaneLayout,
  loadPaneLayout,
  savePaneLayout,
  snapFraction,
  type PaneFraction,
} from "../lib/consoleLayout";
import { Icon } from "../components/icons";
import styles from "./Pane.module.css";

interface DragState {
  frameRect: DOMRect;
  paneWidthFrac: number;
  paneHeightFrac: number;
  offsetX: number;
  offsetY: number;
}

interface Props {
  paneId: string;
  projectId: string | null;
  frameRef: RefObject<HTMLDivElement>;
  defaultPos: PaneFraction;
  /** Left side of the chrome strip — the uppercase pane label. */
  label: ReactNode;
  /** Right side of the chrome strip — small tool buttons (park, dismiss…). */
  tools?: ReactNode;
  /** Override the default 340px pane width. */
  width?: number;
  children: ReactNode;
}

export function Pane({ paneId, projectId, frameRef, defaultPos, label, tools, width, children }: Props): JSX.Element {
  // Edit mode (SURVEY.md, WoW/ElvUI lineage): chrome forced visible, dashed
  // outline, drags snap to the grid, and a per-pane reset tool appears.
  const editing = useStudyLoopStore((s) => s.consoleEditMode);
  const paneRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const posRef = useRef<PaneFraction>(defaultPos);
  const [pos, setPos] = useState<PaneFraction>(defaultPos);
  const [dragging, setDragging] = useState(false);

  // Restore the persisted position whenever the project changes.
  useEffect(() => {
    const next = projectId ? loadPaneLayout(projectId, paneId) ?? defaultPos : defaultPos;
    posRef.current = next;
    setPos(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, paneId]);

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    // Interactive children own their own pointer story — dragging starts from
    // anywhere else on the pane (the chrome strip is the visual affordance).
    if (e.target instanceof HTMLElement && e.target.closest("a, button, textarea, input, select")) return;
    const frame = frameRef.current;
    const pane = paneRef.current;
    if (!frame || !pane) return;
    const frameRect = frame.getBoundingClientRect();
    const paneRect = pane.getBoundingClientRect();
    if (frameRect.width === 0 || frameRect.height === 0) return;
    dragRef.current = {
      frameRect,
      paneWidthFrac: paneRect.width / frameRect.width,
      paneHeightFrac: paneRect.height / frameRect.height,
      offsetX: e.clientX - paneRect.left,
      offsetY: e.clientY - paneRect.top,
    };
    pane.setPointerCapture(e.pointerId);
    setDragging(true);
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    if (!drag) return;
    const { frameRect, paneWidthFrac, paneHeightFrac, offsetX, offsetY } = drag;
    const rawFx = (e.clientX - offsetX - frameRect.left) / frameRect.width;
    const rawFy = (e.clientY - offsetY - frameRect.top) / frameRect.height;
    const snappedFx = editing ? snapFraction(rawFx) : clampFraction(rawFx);
    const snappedFy = editing ? snapFraction(rawFy) : clampFraction(rawFy);
    const next: PaneFraction = {
      fx: Math.min(Math.max(0, 1 - paneWidthFrac), snappedFx),
      fy: Math.min(Math.max(0, 1 - paneHeightFrac), snappedFy),
    };
    posRef.current = next;
    setPos(next);
  };

  const handlePointerUp = (e: PointerEvent<HTMLDivElement>): void => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    paneRef.current?.releasePointerCapture(e.pointerId);
    if (projectId) savePaneLayout(projectId, paneId, posRef.current);
  };

  const handleReset = (): void => {
    posRef.current = defaultPos;
    setPos(defaultPos);
    if (projectId) clearPaneLayout(projectId, paneId);
  };

  return (
    <div
      ref={paneRef}
      className={`${styles.pane} ${dragging ? styles.dragging : ""} ${editing ? styles.editing : ""}`}
      style={{ left: `${pos.fx * 100}%`, top: `${pos.fy * 100}%`, width: width ? `${width}px` : undefined }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div className={styles.chrome}>
        <span className={styles.label}>{label}</span>
        <span className={styles.tools}>
          {editing && (
            <button
              type="button"
              className={styles.tool}
              title="Reset this pane to its default position"
              aria-label="Reset pane position"
              onClick={handleReset}
            >
              <Icon name="refresh" size={11} />
            </button>
          )}
          {tools}
        </span>
      </div>
      {children}
    </div>
  );
}
