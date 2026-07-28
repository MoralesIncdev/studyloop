// YouTube-style progress bar: red played-portion, hover time tooltip, click-to-seek,
// and marker layers rendered purely from props — bubble pins and concept ticks —
// plus an optional heatmap density strip (SPEC "Player chrome" — see HeatmapStrip).
import { useCallback, useEffect, useRef, useState } from "react";
import { formatTimestamp } from "../lib/time";
import { Icon } from "../components/icons";
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
  onSeek: (t: number) => void;
  /** Called when a bubble pin is clicked, instead of onSeek. Defaults to onSeek. */
  onSeekBubble?: (t: number) => void;
  /** Called when a pearl diamond is clicked, instead of onSeek. Defaults to onSeek. */
  onSeekPearl?: (t: number) => void;
  /** Density buckets in [0,1] for the heatmap strip above the bar (SPEC "Player chrome"). */
  heatmap?: number[];
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
  onSeek,
  onSeekBubble,
  onSeekPearl,
  heatmap,
}: Props): JSX.Element {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null);
  const [hoverBubble, setHoverBubble] = useState<SeekBarBubbleMarker | null>(null);
  const [hoverPearl, setHoverPearl] = useState<SeekBarPearlMarker | null>(null);
  const [dragging, setDragging] = useState(false);

  const timeAtClientX = useCallback(
    (clientX: number): number => {
      const track = trackRef.current;
      if (!track || duration <= 0) return 0;
      const rect = track.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return ratio * duration;
    },
    [duration]
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

  const pct = (t: number): string => `${duration > 0 ? Math.min(100, Math.max(0, (t / duration) * 100)) : 0}%`;

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
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.max(0, Math.round(duration))}
        aria-valuenow={Math.round(currentTime)}
        aria-valuetext={formatTimestamp(currentTime)}
      >
        {heatmap && <HeatmapStrip buckets={heatmap} />}
        {loopA != null && loopB != null && (
          <div
            className={styles.loopRange}
            style={{ left: pct(loopA), width: `calc(${pct(loopB)} - ${pct(loopA)})` }}
          />
        )}
        <div className={styles.fill} style={{ width: pct(currentTime) }} />
        {conceptTicks.map((tick) => (
          <button
            key={tick.id}
            type="button"
            className={styles.conceptTick}
            data-kind="concept"
            style={{ left: pct(tick.t) }}
            aria-label={`Concept: ${tick.title ?? "untitled"} at ${formatTimestamp(tick.t)}`}
            title={tick.title ? `${tick.title} — ${formatTimestamp(tick.t)}` : formatTimestamp(tick.t)}
            onClick={(e) => {
              e.stopPropagation();
              onSeek(tick.t);
            }}
          />
        ))}
        {bubbles.map((bubble) => (
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
        {pearls.map((pearl) => (
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
        {overlayMarkers.map((marker) => (
          <button
            key={marker.id}
            type="button"
            className={marker.kind === "pearl" ? styles.overlayPearlMarker : styles.overlayBubbleMarker}
            data-kind={`overlay-${marker.kind}`}
            style={{ left: pct(marker.t), background: `hsl(${marker.hue}, 70%, 55%)` }}
            aria-label={`${marker.handle} — ${formatTimestamp(marker.t)}`}
            title={`${marker.handle} — ${formatTimestamp(marker.t)}`}
            onClick={(e) => {
              e.stopPropagation();
              onSeek(Math.max(0, marker.t - 5));
            }}
          />
        ))}
        {loopA != null && (
          <div className={styles.loopMarker} style={{ left: pct(loopA) }} title={`A: ${formatTimestamp(loopA)}`} />
        )}
        {loopB != null && (
          <div className={styles.loopMarker} style={{ left: pct(loopB) }} title={`B: ${formatTimestamp(loopB)}`} />
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
    </div>
  );
}
