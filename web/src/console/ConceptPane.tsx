// Console slice 8 scaffold (design/mockups/video-console/BUILD-BRIEF.md): the
// "active concept" pane — the v6 mock's #p-concept ported to React over the
// real <video>. Bare mode only (no glassy/edit/park modes yet, no other pane
// kinds): title + a snippet of body float as plain text over the footage;
// hovering ghosts in a small glass address-bar strip that also serves as the
// drag handle. Perf constraint from the brief: backdrop-filter is only ever
// applied to that strip, never to a full-pane surface over video.
import { useEffect, useMemo, useRef, useState, type PointerEvent, type RefObject } from "react";
import { useStudyLoopStore } from "../state/store";
import { analysisConceptToConceptCard } from "../lib/analysisFormat";
import { formatTimestamp } from "../lib/time";
import { clampFraction, loadPaneLayout, savePaneLayout, type PaneFraction } from "../lib/consoleLayout";
import type { ConceptCard } from "../lib/types";
import styles from "./ConceptPane.module.css";

const PANE_ID = "p-concept";
const DEFAULT_POS: PaneFraction = { fx: 0.62, fy: 0.12 };
/** How far past a concept's anchor it stays "active" — matches the existing
 *  concept-loop span cap (lib/conceptLoop.ts DEFAULT_SPAN_S). */
const ACTIVE_WINDOW_S = 60;
const BODY_PREVIEW_CHARS = 140;

interface DragState {
  frameRect: DOMRect;
  paneWidthFrac: number;
  paneHeightFrac: number;
  offsetX: number;
  offsetY: number;
}

interface Props {
  frameRef: RefObject<HTMLDivElement>;
}

function bodyPreview(body: string): string {
  const trimmed = body.trim();
  if (trimmed.length <= BODY_PREVIEW_CHARS) return trimmed;
  return `${trimmed.slice(0, BODY_PREVIEW_CHARS).trimEnd()}…`;
}

export function ConceptPane({ frameRef }: Props): JSX.Element | null {
  const concepts = useStudyLoopStore((s) => s.concepts);
  const analysis = useStudyLoopStore((s) => s.analysis);
  const currentTime = useStudyLoopStore((s) => s.currentTime);
  const currentProject = useStudyLoopStore((s) => s.currentProject);
  const projectId = currentProject?.id ?? null;

  const paneRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const posRef = useRef<PaneFraction>(DEFAULT_POS);
  const [pos, setPos] = useState<PaneFraction>(DEFAULT_POS);
  const [dragging, setDragging] = useState(false);

  // Restore the persisted position whenever the project changes (fresh
  // mount per project session — mirrors the rest of console/ state).
  useEffect(() => {
    const next = projectId ? loadPaneLayout(projectId, PANE_ID) ?? DEFAULT_POS : DEFAULT_POS;
    posRef.current = next;
    setPos(next);
  }, [projectId]);

  // V2-C: AI-breakdown concepts join the doc-concept pool the same way
  // PlayerChrome's seek ticks do (analysisConceptToConceptCard gives them the
  // same ConceptCard shape).
  const tickerConcepts = useMemo<ConceptCard[]>(
    () => [...concepts, ...(analysis?.concepts.map(analysisConceptToConceptCard) ?? [])],
    [concepts, analysis]
  );

  // Active concept = the one whose nearest anchor covers the playhead
  // (t <= currentTime <= t + ACTIVE_WINDOW_S), picking the latest such
  // anchor across every concept when more than one qualifies.
  const active = useMemo<{ card: ConceptCard; t: number } | null>(() => {
    let best: { card: ConceptCard; t: number } | null = null;
    for (const card of tickerConcepts) {
      for (const anchor of card.anchors) {
        if (anchor.t == null) continue;
        if (currentTime >= anchor.t && currentTime <= anchor.t + ACTIVE_WINDOW_S) {
          if (!best || anchor.t > best.t) best = { card, t: anchor.t };
        }
      }
    }
    return best;
  }, [tickerConcepts, currentTime]);

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    if (e.target instanceof HTMLElement && e.target.closest("a, button")) return;
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
    const maxFx = Math.max(0, 1 - paneWidthFrac);
    const maxFy = Math.max(0, 1 - paneHeightFrac);
    const next: PaneFraction = {
      fx: Math.min(maxFx, clampFraction(rawFx)),
      fy: Math.min(maxFy, clampFraction(rawFy)),
    };
    posRef.current = next;
    setPos(next);
  };

  const handlePointerUp = (e: PointerEvent<HTMLDivElement>): void => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    paneRef.current?.releasePointerCapture(e.pointerId);
    if (projectId) savePaneLayout(projectId, PANE_ID, posRef.current);
  };

  if (!active) return null;

  return (
    <div
      ref={paneRef}
      className={`${styles.pane} ${dragging ? styles.dragging : ""}`}
      style={{ left: `${pos.fx * 100}%`, top: `${pos.fy * 100}%` }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div className={styles.chrome}>
        <span className={styles.label}>CONCEPT &middot; {formatTimestamp(active.t)}</span>
      </div>
      <div className={styles.title}>{active.card.title}</div>
      <p className={styles.body}>{bodyPreview(active.card.body)}</p>
    </div>
  );
}
