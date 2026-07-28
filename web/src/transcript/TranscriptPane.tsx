// Windowed transcript list synced to playback. Renders only the rows near the
// viewport (hand-rolled — no react-window dependency), highlights + auto-scrolls
// to the active segment, holds off auto-scroll for 5s after the user scrolls by
// hand, and offers click-to-seek plus a filter+jump search box.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStudyLoopStore } from "../state/store";
import { activeSegmentIndex } from "../lib/selectors";
import { formatTimestamp } from "../lib/time";
import type { TranscriptSegment } from "../lib/types";
import styles from "./TranscriptPane.module.css";

const ROW_HEIGHT = 56;
const OVERSCAN = 6;
const SCROLL_HOLD_OFF_MS = 5000;

interface Props {
  segments: TranscriptSegment[];
  loading: boolean;
}

export function TranscriptPane({ segments, loading }: Props): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const programmaticScrollRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [query, setQuery] = useState("");

  const currentTime = useStudyLoopStore((s) => s.currentTime);
  const controller = useStudyLoopStore((s) => s.controller);
  const lastUserScrollAt = useStudyLoopStore((s) => s.lastUserScrollAt);
  const markUserScroll = useStudyLoopStore((s) => s.markUserScroll);

  const activeIndex = useMemo(() => activeSegmentIndex(segments, currentTime), [segments, currentTime]);

  const filteredIndices = useMemo(() => {
    if (!query.trim()) return null;
    const q = query.trim().toLowerCase();
    const indices: number[] = [];
    segments.forEach((s, i) => {
      if (s.text.toLowerCase().includes(q)) indices.push(i);
    });
    return indices;
  }, [segments, query]);

  const visibleList = filteredIndices ?? segments.map((_, i) => i);

  // Reset scroll position when the search query changes — the old scrollTop
  // was measured against a different (unfiltered, or differently-filtered)
  // row count and no longer means anything for the new list.
  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = 0;
    setScrollTop(0);
  }, [query]);

  // Measure the scroll container so we know how many rows fit.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const update = () => setViewportHeight(el.clientHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Auto-scroll to the active row, unless the user scrolled recently.
  useEffect(() => {
    if (filteredIndices) return; // don't fight a search filter view
    if (activeIndex < 0) return;
    if (Date.now() - lastUserScrollAt < SCROLL_HOLD_OFF_MS) return;
    const el = containerRef.current;
    if (!el) return;
    const rowTop = activeIndex * ROW_HEIGHT;
    const target = rowTop - el.clientHeight / 2 + ROW_HEIGHT / 2;
    const clamped = Math.max(0, target);
    if (Math.abs(el.scrollTop - clamped) < 2) return;
    programmaticScrollRef.current = true;
    el.scrollTop = clamped;
  }, [activeIndex, lastUserScrollAt, filteredIndices]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setScrollTop(el.scrollTop);
    if (programmaticScrollRef.current) {
      programmaticScrollRef.current = false;
      return;
    }
    markUserScroll();
  }, [markUserScroll]);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== "Enter") return;
      if (!filteredIndices || filteredIndices.length === 0) return;
      const segment = segments[filteredIndices[0]];
      controller?.seek(segment.start);
    },
    [controller, filteredIndices, segments]
  );

  // Windowed the same way whether we're showing the full list or search
  // results — a match list can be long too (a common word in an hour-long
  // transcript), and rendering it in full defeated the point of virtualizing
  // the main list in the first place.
  const rowCount = visibleList.length;
  const startRow = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visibleRows = Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2;
  const endRow = Math.min(rowCount, startRow + visibleRows);

  const topSpacer = startRow * ROW_HEIGHT;

  return (
    <div className={styles.pane}>
      <div className={styles.searchRow}>
        <input
          ref={searchInputRef}
          type="text"
          className={styles.searchInput}
          placeholder="Search transcript… (Enter jumps)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleSearchKeyDown}
        />
        {filteredIndices && (
          <span className={styles.matchCount}>
            {filteredIndices.length} match{filteredIndices.length === 1 ? "" : "es"}
          </span>
        )}
      </div>
      <div ref={containerRef} className={styles.scroller} onScroll={handleScroll}>
        {loading && <div className={styles.status}>Loading transcript…</div>}
        {!loading && segments.length === 0 && <div className={styles.status}>No transcript for this video.</div>}
        {!loading && segments.length > 0 && (
          <div style={{ height: rowCount * ROW_HEIGHT }}>
            <div style={{ transform: `translateY(${topSpacer}px)` }}>
              {visibleList.slice(startRow, endRow).map((segIndex) => {
                const segment = segments[segIndex];
                const isActive = segIndex === activeIndex;
                return (
                  <button
                    key={segIndex}
                    type="button"
                    className={`${styles.row} ${isActive ? styles.rowActive : ""}`}
                    style={{ height: ROW_HEIGHT }}
                    onClick={() => controller?.seek(segment.start)}
                  >
                    <span className={styles.rowTime}>{formatTimestamp(segment.start)}</span>
                    <span className={styles.rowText}>{segment.text}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
