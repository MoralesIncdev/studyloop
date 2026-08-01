// Console slice 8 (design/mockups/video-console/BUILD-BRIEF.md): the shared
// pane shell — every console pane is bare content over the footage with a
// hover-ghosted glass chrome strip (label left, tool buttons right, whole strip
// is the drag affordance) and fractional per-project position persistence
// (lib/consoleLayout.ts). Type-specific panes supply the label/tools/body;
// this owns drag, clamping, and persistence. Perf constraint from the brief:
// backdrop-filter only ever applies to the chrome strip, never a full pane.
//
// Console slice D (mock lines 74-197, 1011-1099): bare/glassy mode per pane
// (persisted via savePaneMode), a bottom-right resize grip (210-640px,
// savePaneWidth), edit-mode drag magnetism against sibling panes + the 24px
// grid origin (lib/magnetism.ts, 2% grid snap as fallback), hover-pause with
// auto-resume (mock lines 1065-1074, same contract as CCOverlay), and — for
// tick-anchored panes (parkAnchor) — drag-to-park: dragging into the bottom
// 150px of the frame arms parking, release flies the pane toward its seek-bar
// tick (~750ms) and parks it via store.parkPane; PlayerChrome's waiting tick
// + store.undockPane bring it back.
import { useEffect, useRef, useState, type PointerEvent, type ReactNode, type RefObject } from "react";
import { useStudyLoopStore } from "../state/store";
import {
  clampFraction,
  clampPaneWidth,
  clearPaneLayout,
  loadPaneLayout,
  savePaneLayout,
  savePaneMode,
  savePaneWidth,
  snapFraction,
  type PaneFraction,
  type PaneMode,
} from "../lib/consoleLayout";
import { magnetize, type Rect } from "../lib/magnetism";
import { Icon } from "../components/icons";
import styles from "./Pane.module.css";

interface DragState {
  frameRect: DOMRect;
  paneWidthFrac: number;
  paneHeightFrac: number;
  offsetX: number;
  offsetY: number;
}

interface SizeState {
  startWidth: number;
  startClientX: number;
}

/** Mock: the bottom strip of the frame that arms parking while dragging a
 *  tick-anchored pane (index.html line 1045). */
const PARK_ZONE_PX = 150;
/** Mock's dockPane flight duration (index.html lines 1091-1098). */
const PARK_FLIGHT_MS = 750;

export type ChipStatus = "proposed" | "attested" | "quiet";

interface Props {
  paneId: string;
  projectId: string | null;
  frameRef: RefObject<HTMLDivElement>;
  defaultPos: PaneFraction;
  /** Left side of the chrome strip — the uppercase pane label. */
  label: ReactNode;
  /** Mock's `.chip .dot` (lines 118-122): amber proposed / jade attested / dim quiet. */
  chipStatus?: ChipStatus;
  /** Right side of the chrome strip — small tool buttons (park, dismiss…). */
  tools?: ReactNode;
  /** Per-pane default mode when no persisted mode exists (mock's DEFAULTS, lines 975-983). */
  defaultMode?: PaneMode;
  /** Override the default 340px pane width. */
  width?: number;
  /**
   * Console slice C: rendered as a `data-pane` attribute on the root — the
   * modality choreography (StudyView's `.generate`/`.review` class on
   * .consoleRoot) targets specific panes via `[data-pane="…"]` exemptions in
   * Pane.module.css (generate keeps the future self-test pane readable;
   * review keeps a future map pane and the drill pane readable) without
   * threading modality state through every pane component.
   */
  dataPane?: string;
  /** Tick-anchored pane (concept): enables drag-to-park, the park tool, and
   *  the flight animation toward this anchor's seek-bar tick. */
  parkAnchor?: { conceptId: string; t: number } | null;
  /** Envelope-driven opacity (ConceptPane, lib/envelope.ts); undefined = 1. */
  opacity?: number;
  /** Mock's `.arriving` materialize (line 142) — re-run by remounting or re-toggling. */
  arriving?: boolean;
  /** Fired on hover — the envelope treats an engaged pane as user-claimed (no auto-park). */
  onEngaged?: () => void;
  children: ReactNode;
}

export function Pane({
  paneId,
  projectId,
  frameRef,
  defaultPos,
  label,
  chipStatus,
  tools,
  defaultMode = "bare",
  width,
  dataPane,
  parkAnchor = null,
  opacity,
  arriving = false,
  onEngaged,
  children,
}: Props): JSX.Element {
  // Edit mode (SURVEY.md, WoW/ElvUI lineage): chrome forced visible, dashed
  // outline, drags snap to the grid, and a per-pane reset tool appears.
  const editing = useStudyLoopStore((s) => s.consoleEditMode);
  const paneRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const sizeRef = useRef<SizeState | null>(null);
  const flightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverPausedRef = useRef(false);
  const posRef = useRef<PaneFraction>(defaultPos);
  const widthRef = useRef<number | undefined>(width);
  const [pos, setPos] = useState<PaneFraction>(defaultPos);
  const [mode, setMode] = useState<PaneMode>(defaultMode);
  const [widthPx, setWidthPx] = useState<number | undefined>(width);
  const [dragging, setDragging] = useState(false);
  const [sizing, setSizing] = useState(false);
  const [parking, setParking] = useState(false);
  const [flight, setFlight] = useState<{ dx: number; dy: number } | null>(null);

  // Restore the persisted position/width/mode whenever the project changes.
  useEffect(() => {
    const layout = projectId ? loadPaneLayout(projectId, paneId) : null;
    const next = layout ?? defaultPos;
    posRef.current = next;
    setPos(next);
    setMode(layout?.mode ?? defaultMode);
    widthRef.current = layout?.width ?? width;
    setWidthPx(layout?.width ?? width);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, paneId]);

  // Release a hover-pause if the pane unmounts mid-hover (same contract as CCOverlay).
  useEffect(
    () => () => {
      if (hoverPausedRef.current) {
        hoverPausedRef.current = false;
        useStudyLoopStore.getState().controller?.play();
        useStudyLoopStore.getState().setAutoPaused(false);
      }
      if (flightTimerRef.current) clearTimeout(flightTimerRef.current);
    },
    []
  );

  const startFlight = (): void => {
    const frame = frameRef.current;
    const pane = paneRef.current;
    if (!frame || !pane || !parkAnchor) return;
    const frameRect = frame.getBoundingClientRect();
    const paneRect = pane.getBoundingClientRect();
    // The exact tick element lives in SeekBar (outside this tree); the flight
    // targets its computed position — anchor fraction along the frame width,
    // just above the transport at the frame's bottom edge.
    const duration = useStudyLoopStore.getState().duration;
    const ratio = duration > 0 ? Math.min(1, Math.max(0, parkAnchor.t / duration)) : 0;
    setFlight({
      dx: frameRect.left + ratio * frameRect.width - paneRect.left,
      dy: frameRect.bottom - 30 - paneRect.top,
    });
    setParking(false);
    flightTimerRef.current = setTimeout(() => {
      flightTimerRef.current = null;
      setFlight(null);
      useStudyLoopStore.getState().parkPane(paneId, parkAnchor.conceptId, parkAnchor.t);
    }, PARK_FLIGHT_MS);
  };

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
    const size = sizeRef.current;
    if (size) {
      const nextWidth = clampPaneWidth(size.startWidth + (e.clientX - size.startClientX));
      widthRef.current = nextWidth;
      setWidthPx(nextWidth);
      return;
    }
    const drag = dragRef.current;
    if (!drag) return;
    const { frameRect, paneWidthFrac, paneHeightFrac, offsetX, offsetY } = drag;
    const rawFx = (e.clientX - offsetX - frameRect.left) / frameRect.width;
    const rawFy = (e.clientY - offsetY - frameRect.top) / frameRect.height;
    let snappedFx: number;
    let snappedFy: number;
    if (editing) {
      // Magnetism (mock lines 1011-1043): snap to sibling panes' edges and
      // the 24px grid origin in pixel space; an axis with no magnetic target
      // within 9px falls back to the 2% grid quantize.
      const frame = frameRef.current;
      const others: Rect[] = [];
      frame?.querySelectorAll("[data-pane]").forEach((el) => {
        if (el === paneRef.current) return;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return; // hidden/parked panes aren't targets (mock line 1017)
        others.push({ x: r.left - frameRect.left, y: r.top - frameRect.top, w: r.width, h: r.height });
      });
      const m = magnetize(rawFx * frameRect.width, rawFy * frameRect.height, paneWidthFrac * frameRect.width, others);
      snappedFx = m.snappedX ? m.x / frameRect.width : snapFraction(rawFx);
      snappedFy = m.snappedY ? m.y / frameRect.height : snapFraction(rawFy);
    } else {
      snappedFx = clampFraction(rawFx);
      snappedFy = clampFraction(rawFy);
    }
    const next: PaneFraction = {
      fx: Math.min(Math.max(0, 1 - paneWidthFrac), snappedFx),
      fy: Math.min(Math.max(0, 1 - paneHeightFrac), snappedFy),
    };
    posRef.current = next;
    setPos(next);
    // Drag-to-park arming (mock lines 1044-1048) — works in normal mode too,
    // not just edit mode; only tick-anchored panes can park.
    if (parkAnchor) setParking(e.clientY - frameRect.top > frameRect.height - PARK_ZONE_PX);
  };

  const handlePointerUp = (e: PointerEvent<HTMLDivElement>): void => {
    if (sizeRef.current) {
      sizeRef.current = null;
      setSizing(false);
      paneRef.current?.releasePointerCapture(e.pointerId);
      if (projectId && widthRef.current != null) savePaneWidth(projectId, paneId, posRef.current, widthRef.current);
      return;
    }
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    paneRef.current?.releasePointerCapture(e.pointerId);
    if (parking && parkAnchor) {
      setParking(false);
      startFlight();
      return;
    }
    setParking(false);
    if (projectId) savePaneLayout(projectId, paneId, posRef.current);
  };

  const handleGripDown = (e: PointerEvent<HTMLSpanElement>): void => {
    e.stopPropagation();
    const pane = paneRef.current;
    if (!pane) return;
    sizeRef.current = { startWidth: pane.getBoundingClientRect().width, startClientX: e.clientX };
    pane.setPointerCapture(e.pointerId);
    setSizing(true);
  };

  const handleReset = (): void => {
    posRef.current = defaultPos;
    setPos(defaultPos);
    widthRef.current = width;
    setWidthPx(width);
    setMode(defaultMode);
    if (projectId) clearPaneLayout(projectId, paneId);
  };

  const toggleMode = (): void => {
    const next: PaneMode = mode === "bare" ? "glassy" : "bare";
    setMode(next);
    if (projectId) savePaneMode(projectId, paneId, posRef.current, next);
  };

  // Hover-pause with auto-resume (mock lines 1065-1074, Language Reactor) —
  // same store contract as CCOverlay's caption hover-pause.
  const handlePointerEnter = (): void => {
    onEngaged?.();
    if (editing || dragRef.current || sizeRef.current) return;
    const store = useStudyLoopStore.getState();
    if (store.isPlaying && store.controller) {
      hoverPausedRef.current = true;
      store.controller.pause();
      store.setAutoPaused(true);
    }
  };

  const handlePointerLeave = (): void => {
    if (!hoverPausedRef.current) return;
    hoverPausedRef.current = false;
    const store = useStudyLoopStore.getState();
    store.controller?.play();
    store.setAutoPaused(false);
  };

  const className = [
    styles.pane,
    mode === "glassy" ? styles.glassy : styles.bare,
    dragging ? styles.dragging : "",
    sizing ? styles.sizing : "",
    parking ? styles.parking : "",
    arriving ? styles.arriving : "",
    flight ? styles.flying : "",
    editing ? styles.editing : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={paneRef}
      className={className}
      style={{
        left: `${pos.fx * 100}%`,
        top: `${pos.fy * 100}%`,
        width: widthPx != null ? `${widthPx}px` : undefined,
        opacity: flight ? 0 : opacity,
        transform: flight ? `translate(${flight.dx}px, ${flight.dy}px) scale(0.04)` : undefined,
      }}
      data-pane={dataPane}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <div className={styles.chrome}>
        <span className={styles.label}>
          {chipStatus && <span className={styles.chipDot} data-status={chipStatus} aria-hidden="true" />}
          {label}
        </span>
        <span className={styles.tools}>
          <button
            type="button"
            className={styles.tool}
            title={mode === "bare" ? "Switch to glass container" : "Switch to bare"}
            aria-label="Toggle pane container"
            onClick={toggleMode}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
              <rect x="1.5" y="1.5" width="11" height="11" rx="3" strokeDasharray="2.5 2.5" />
            </svg>
          </button>
          {parkAnchor && (
            <button
              type="button"
              className={styles.tool}
              title="Park on the timeline"
              aria-label="Park pane on the timeline"
              onClick={startFlight}
            >
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="M7 1.5v7M4 6l3 3 3-3" />
                <path d="M2 12.5h10" />
              </svg>
            </button>
          )}
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
      <span className={styles.grip} title="Resize" onPointerDown={handleGripDown}>
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.3">
          <path d="M13 6L6 13M13 10l-3 3" />
        </svg>
      </span>
    </div>
  );
}
