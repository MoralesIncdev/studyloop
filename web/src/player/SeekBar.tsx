// Custom seek bar: progress fill, hover time tooltip, click-to-seek, and marker
// layers rendered purely from props — bubble pins and concept ticks are wired up
// here so a later chunk can pass real data without touching this component.
import { useCallback, useRef, useState } from "react";
import { formatTimestamp } from "../lib/time";
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

interface Props {
  currentTime: number;
  duration: number;
  bubbles?: SeekBarBubbleMarker[];
  conceptTicks?: SeekBarConceptTick[];
  loopA?: number | null;
  loopB?: number | null;
  onSeek: (t: number) => void;
  /** Called when a bubble pin is clicked, instead of onSeek. Defaults to onSeek. */
  onSeekBubble?: (t: number) => void;
}

export function SeekBar({
  currentTime,
  duration,
  bubbles = [],
  conceptTicks = [],
  loopA = null,
  loopB = null,
  onSeek,
  onSeekBubble,
}: Props): JSX.Element {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null);
  const [hoverBubble, setHoverBubble] = useState<SeekBarBubbleMarker | null>(null);

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
    },
    [timeAtClientX]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      onSeek(timeAtClientX(e.clientX));
    },
    [onSeek, timeAtClientX]
  );

  const pct = (t: number): string => `${duration > 0 ? Math.min(100, Math.max(0, (t / duration) * 100)) : 0}%`;

  return (
    <div className={styles.wrapper}>
      <div
        ref={trackRef}
        className={styles.track}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHover(null)}
        onClick={handleClick}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.max(0, Math.round(duration))}
        aria-valuenow={Math.round(currentTime)}
      >
        {loopA != null && loopB != null && (
          <div
            className={styles.loopRange}
            style={{ left: pct(loopA), width: `calc(${pct(loopB)} - ${pct(loopA)})` }}
          />
        )}
        <div className={styles.fill} style={{ width: pct(currentTime) }} />
        {conceptTicks.map((tick) => (
          <div
            key={tick.id}
            className={styles.conceptTick}
            style={{ left: pct(tick.t) }}
            title={tick.title ? `${tick.title} — ${formatTimestamp(tick.t)}` : formatTimestamp(tick.t)}
            onClick={(e) => {
              e.stopPropagation();
              onSeek(tick.t);
            }}
          />
        ))}
        {bubbles.map((bubble) => (
          <div
            key={bubble.id}
            className={styles.bubblePin}
            style={{ left: pct(bubble.t) }}
            onMouseEnter={() => setHoverBubble(bubble)}
            onMouseLeave={() => setHoverBubble((cur) => (cur?.id === bubble.id ? null : cur))}
            onClick={(e) => {
              e.stopPropagation();
              (onSeekBubble ?? onSeek)(bubble.t);
            }}
          />
        ))}
        {loopA != null && <div className={styles.loopMarker} style={{ left: pct(loopA) }} title={`A: ${formatTimestamp(loopA)}`} />}
        {loopB != null && <div className={styles.loopMarker} style={{ left: pct(loopB) }} title={`B: ${formatTimestamp(loopB)}`} />}
        <div className={styles.playhead} style={{ left: pct(currentTime) }} />
        {hoverBubble && (
          <div className={styles.bubbleTooltip} style={{ left: pct(hoverBubble.t) }}>
            {hoverBubble.thumbnailUrl && <img className={styles.bubbleTooltipImg} src={hoverBubble.thumbnailUrl} alt="" />}
            <span className={styles.bubbleTooltipText}>{hoverBubble.text || formatTimestamp(hoverBubble.t)}</span>
          </div>
        )}
        {!hoverBubble && hover && (
          <div className={styles.tooltip} style={{ left: hover.x }}>
            {formatTimestamp(hover.t)}
          </div>
        )}
      </div>
    </div>
  );
}
