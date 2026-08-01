// YouTube-style progress bar: red played-portion, hover time tooltip, click-to-seek,
// and marker layers rendered purely from props — bubble pins and concept ticks —
// plus an optional heatmap density strip (SPEC "Player chrome" — see HeatmapStrip).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatTimestamp } from "../lib/time";
import { marksForClickRatio } from "../lib/attentionHeatmap";
import type { HeatmapMark } from "../lib/types";
import { Icon } from "../components/icons";
import { Tooltip } from "../components/Tooltip";
import { AttentionPopover } from "./AttentionPopover";
import { HeatmapStrip } from "./HeatmapStrip";
import styles from "./SeekBar.module.css";

export interface SeekBarMarker {
  id: string;
  t: number;
}

/** A bubble pin also carries enough to render a hover preview (text snippet + thumbnail). */
export interface SeekBarBubbleMarker extends SeekBarMarker {
  text?: string;
  thumbnailUrl?: string | null;
}

/** A concept tick carries its card title for a hover tooltip (F7). */
export interface SeekBarConceptTick extends SeekBarMarker {
  title?: string;
}

/** V2-C: a pearl diamond — distinct from bubble pins/concept ticks (SPEC "Analysis engine"). */
export interface SeekBarPearlMarker extends SeekBarMarker {
  label: string;
  importance: 1 | 2 | 3;
}

/** V2-C: one marker from an imported overlay bundle — colored per author handle (SPEC "Overlays"). */
export interface SeekBarOverlayMarker extends SeekBarMarker {
  handle: string;
  hue: number;
  kind: "bubble" | "pearl";
}

interface Props {
  currentTime: number;
  duration: number;
  bubbles?: SeekBarBubbleMarker[];
  conceptTicks?: SeekBarConceptTick[];
  pearls?: SeekBarPearlMarker[];
  overlayMarkers?: SeekBarOverlayMarker[];
  loopA?: number | null;
  loopB?: number | null;
  /** Console slice 3: the timestamp a note-in-progress is anchored to — rendered
   *  as a provisional (yellow, pulsing) tick while the notation modal is open,
   *  solidifying into a real bubble pin on save (Frame.io's yellow selector). */
  provisionalT?: number | null;
  onSeek: (t: number) => void;
  /** Console slice 1: called when a concept tick is clicked, instead of onSeek —
   *  PlayerChrome uses it to scope playback to the concept's span. */
  onConceptTick?: (tick: SeekBarConceptTick) => void;
  /** The tick whose span is currently the playback window (renders amber). */
  activeConceptTickId?: string | null;
  /** Called when a bubble pin is clicked, instead of onSeek. Defaults to onSeek. */
  onSeekBubble?: (t: number) => void;
  /** Called when a pearl diamond is clicked, instead of onSeek. Defaults to onSeek. */
  onSeekPearl?: (t: number) => void;
  /** V3-C C5 "Attention heatmap": own-marks layer, density buckets in [0,1] (SPEC "Player chrome"). */
  attentionOwn?: number[];
  /** Overlays layer (all imported bundles combined), independently normalized — never merged with `attentionOwn`. */
  attentionOverlays?: number[];
  /** Raw marks behind both layers, resolved locally on click (lib/attentionHeatmap.ts) — omit to render the strip decoratively (no click-to-inspect). */
  attentionMarks?: { own: HeatmapMark[]; overlays: HeatmapMark[] };
  attentionBucketCount?: number;
}

export function SeekBar({
  currentTime,
  duration,
  bubbles = [],
  conceptTicks = [],
  pearls = [],
  overlayMarkers = [],
  loopA = null,
  loopB = null,
  provisionalT = null,
  onSeek,
  onConceptTick,
  activeConceptTickId = null,
  onSeekBubble,
  onSeekPearl,
  attentionOwn,
  attentionOverlays,
  attentionMarks,
  attentionBucketCount,
}: Props): JSX.Element {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null);
  const [hoverBubble, setHoverBubble] = useState<SeekBarBubbleMarker | null>(null);
  const [hoverPearl, setHoverPearl] = useState<SeekBarPearlMarker | null>(null);
  const [dragging, setDragging] = useState(false);
  // V3-C C5: click-to-inspect popover state — the ratio (0..1) of the click
  // that opened it, or null when closed.
  const [inspectRatio, setInspectRatio] = useState<number | null>(null);
  // Console slice 7 "timeline zoom" (SURVEY.md): the visible window of the
  // timeline, or null for the whole video. Scroll on the bar zooms around the
  // cursor; double-click (or the chip) resets. Required for 7-hour footage,
  // where a full-width bar gives seconds per pixel and ticks pile into mud.
  const [viewport, setViewport] = useState<{ s: number; e: number } | null>(null);

  const vs = viewport?.s ?? 0;
  const ve = viewport?.e ?? duration;

  // A new video (duration change) always starts unzoomed.
  useEffect(() => setViewport(null), [duration]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;
    const onWheel = (e: WheelEvent): void => {
      if (duration <= 0) return;
      e.preventDefault();
      const rect = track.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      setViewport((cur) => {
        const s0 = cur?.s ?? 0;
        const e0 = cur?.e ?? duration;
        const anchor = s0 + ratio * (e0 - s0);
        const factor = e.deltaY < 0 ? 1 / 1.3 : 1.3;
        const span = Math.min(duration, Math.max(30, (e0 - s0) * factor));
        if (span >= duration) return null;
        const s = Math.max(0, Math.min(duration - span, anchor - ratio * span));
        return { s, e: s + span };
      });
    };
    // Native non-passive listener: React's synthetic wheel can't preventDefault.
    track.addEventListener("wheel", onWheel, { passive: false });
    return () => track.removeEventListener("wheel", onWheel);
  }, [duration]);

  const inspectMarks = useMemo<HeatmapMark[]>(() => {
    if (inspectRatio === null || !attentionMarks || !attentionBucketCount || duration <= 0) return [];
    return marksForClickRatio(inspectRatio, duration, attentionBucketCount, attentionMarks.own, attentionMarks.overlays);
  }, [inspectRatio, attentionMarks, attentionBucketCount, duration]);

  const timeAtClientX = useCallback(
    (clientX: number): number => {
      const track = trackRef.current;
      if (!track || duration <= 0) return 0;
      const rect = track.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return vs + ratio * (ve - vs);
    },
    [duration, vs, ve]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const x = Math.min(rect.width, Math.max(0, e.clientX - rect.left));
      setHover({ x, t: timeAtClientX(e.clientX) });
      if (dragging) onSeek(timeAtClientX(e.clientX));
    },
    [timeAtClientX, dragging, onSeek]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      setInspectRatio(null); // any plain-track click (not the strip itself, which stopPropagation()s) closes an open popover
      onSeek(timeAtClientX(e.clientX));
    },
    [onSeek, timeAtClientX]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      setDragging(true);
      onSeek(timeAtClientX(e.clientX));
    },
    [onSeek, timeAtClientX]
  );

  useEffect(() => {
    if (inspectRatio === null) return undefined;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setInspectRatio(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [inspectRatio]);

  useEffect(() => {
    if (!dragging) return undefined;
    const stop = (): void => setDragging(false);
    window.addEventListener("mouseup", stop);
    return () => window.removeEventListener("mouseup", stop);
  }, [dragging]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        onSeek(Math.min(duration, currentTime + 5));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        onSeek(Math.max(0, currentTime - 5));
      }
    },
    [onSeek, currentTime, duration]
  );

  const span = ve - vs;
  const pct = (t: number): string => `${span > 0 ? Math.min(100, Math.max(0, ((t - vs) / span) * 100)) : 0}%`;
  /** Whether a marker at `t` falls inside the visible window (zoomed views hide
   *  out-of-window markers instead of piling them at the edges). */
  const inView = (t: number): boolean => !viewport || (t >= vs - span * 0.01 && t <= ve + span * 0.01);

  return (
    <div className={styles.wrapper}>
      <div
        ref={trackRef}
        className={styles.track}
        data-dragging={dragging}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHover(null)}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        onDoubleClick={() => setViewport(null)}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.max(0, Math.round(duration))}
        aria-valuenow={Math.round(currentTime)}
        aria-valuetext={formatTimestamp(currentTime)}
      >
        {(attentionOwn || attentionOverlays) && (
          <HeatmapStrip
            own={attentionOwn ?? []}
            overlays={attentionOverlays}
            duration={duration}
            onSeekPeak={onSeek}
            onInspect={
              attentionMarks
                ? (ratio) => setInspectRatio((cur) => (cur === ratio ? null : ratio))
                : undefined
            }
          />
        )}
        {loopA != null && loopB != null && (
          <div
            className={styles.loopRange}
            style={{ left: pct(loopA), width: `calc(${pct(loopB)} - ${pct(loopA)})` }}
          />
        )}
        <div className={styles.fill} style={{ width: pct(currentTime) }} />
        {conceptTicks.filter((tick) => inView(tick.t)).map((tick) => (
          <Tooltip key={tick.id} label={tick.title ? `${tick.title} — ${formatTimestamp(tick.t)}` : formatTimestamp(tick.t)}>
            <button
              type="button"
              className={styles.conceptTick}
              data-kind="concept"
              data-active={activeConceptTickId === tick.id}
              style={{ left: pct(tick.t) }}
              aria-label={`Concept: ${tick.title ?? "untitled"} at ${formatTimestamp(tick.t)}`}
              aria-pressed={activeConceptTickId === tick.id}
              onClick={(e) => {
                e.stopPropagation();
                if (onConceptTick) onConceptTick(tick);
                else onSeek(tick.t);
              }}
            />
          </Tooltip>
        ))}
        {bubbles.filter((bubble) => inView(bubble.t)).map((bubble) => (
          <button
            key={bubble.id}
            type="button"
            className={styles.bubblePin}
            data-kind="bubble"
            style={{ left: pct(bubble.t) }}
            aria-label={`Note: ${bubble.text || "untitled"} at ${formatTimestamp(bubble.t)}`}
            onMouseEnter={() => setHoverBubble(bubble)}
            onMouseLeave={() => setHoverBubble((cur) => (cur?.id === bubble.id ? null : cur))}
            onFocus={() => setHoverBubble(bubble)}
            onBlur={() => setHoverBubble((cur) => (cur?.id === bubble.id ? null : cur))}
            onClick={(e) => {
              e.stopPropagation();
              (onSeekBubble ?? onSeek)(bubble.t);
            }}
          />
        ))}
        {/* V2-C: pearl diamonds — visually distinct from bubble pins (dots above)
            and concept ticks (bars below); size scales with importance. */}
        {pearls.filter((pearl) => inView(pearl.t)).map((pearl) => (
          <button
            key={pearl.id}
            type="button"
            className={styles.pearlMarker}
            data-kind="pearl"
            style={{ left: pct(pearl.t) }}
            data-importance={pearl.importance}
            aria-label={`Pearl: ${pearl.label} at ${formatTimestamp(pearl.t)}`}
            onMouseEnter={() => setHoverPearl(pearl)}
            onMouseLeave={() => setHoverPearl((cur) => (cur?.id === pearl.id ? null : cur))}
            onFocus={() => setHoverPearl(pearl)}
            onBlur={() => setHoverPearl((cur) => (cur?.id === pearl.id ? null : cur))}
            onClick={(e) => {
              e.stopPropagation();
              (onSeekPearl ?? onSeek)(pearl.t);
            }}
          />
        ))}
        {/* V2-C: imported overlay markers — one colored dot per author handle. */}
        {overlayMarkers.filter((marker) => inView(marker.t)).map((marker) => (
          <Tooltip key={marker.id} label={`${marker.handle} — ${formatTimestamp(marker.t)}`}>
            <button
              type="button"
              className={marker.kind === "pearl" ? styles.overlayPearlMarker : styles.overlayBubbleMarker}
              data-kind={`overlay-${marker.kind}`}
              style={{ left: pct(marker.t), background: `hsl(${marker.hue}, 70%, 55%)` }}
              aria-label={`${marker.handle} — ${formatTimestamp(marker.t)}`}
              onClick={(e) => {
                e.stopPropagation();
                onSeek(Math.max(0, marker.t - 5));
              }}
            />
          </Tooltip>
        ))}
        {/* Decorative — `.loopMarker` is `pointer-events: none` (mouse events pass
            through to the track underneath for its own seek-preview tooltip), so
            these were never independently hoverable; no tooltip to attach. */}
        {loopA != null && inView(loopA) && <div className={styles.loopMarker} style={{ left: pct(loopA) }} />}
        {loopB != null && inView(loopB) && <div className={styles.loopMarker} style={{ left: pct(loopB) }} />}
        {provisionalT != null && inView(provisionalT) && (
          <div className={styles.provisionalTick} style={{ left: pct(provisionalT) }} />
        )}
        <div className={styles.playhead} style={{ left: pct(currentTime) }} />
        {hoverPearl && (
          <div className={styles.bubbleTooltip} style={{ left: `clamp(28px, ${pct(hoverPearl.t)}, calc(100% - 28px))` }}>
            <span className={styles.pearlStars}>
              {Array.from({ length: 3 }, (_, i) => (
                <Icon key={i} name={i < hoverPearl.importance ? "star" : "starOutline"} size={12} />
              ))}
            </span>
            <span className={styles.bubbleTooltipText}>{hoverPearl.label}</span>
          </div>
        )}
        {!hoverPearl && hoverBubble && (
          <div className={styles.bubbleTooltip} style={{ left: `clamp(28px, ${pct(hoverBubble.t)}, calc(100% - 28px))` }}>
            {hoverBubble.thumbnailUrl && <img className={styles.bubbleTooltipImg} src={hoverBubble.thumbnailUrl} alt="" />}
            <span className={styles.bubbleTooltipText}>{hoverBubble.text || formatTimestamp(hoverBubble.t)}</span>
          </div>
        )}
        {!hoverPearl && !hoverBubble && hover && (
          <div className={styles.tooltip} style={{ left: `clamp(16px, ${hover.x}px, calc(100% - 16px))` }}>
            {formatTimestamp(hover.t)}
          </div>
        )}
      </div>
      {viewport && duration > 0 && (
        <button
          type="button"
          className={styles.zoomChip}
          onClick={() => setViewport(null)}
          aria-label="Reset timeline zoom"
        >
          {(duration / (viewport.e - viewport.s)).toFixed(1)}× · reset
        </button>
      )}
      {inspectRatio !== null && (
        <AttentionPopover
          marks={inspectMarks}
          anchorRatio={inspectRatio}
          onSeek={onSeek}
          onClose={() => setInspectRatio(null)}
        />
      )}
    </div>
  );
}
