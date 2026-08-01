// Console slice B (design/mockups/video-console/index.html lines 260-313,
// 800-889): the mock's minimal cinematic timeline — a 2.5px hairline rail, a
// glowing gradient fill, a circular dot playhead, and a unified tick
// vocabulary (jade attested / amber proposed / faint plain, with an optional
// `.tail` for a real span and a pulsing yellow `.prov` for a note in
// progress) — replacing the old YouTube red-bar look. Marker LOGIC is
// unchanged from the pre-console version: click-to-seek/loop, hover
// previews, the heatmap density strip, click-to-inspect, and zoom all still
// work exactly as before; only the visual language and the concept-tick
// hover treatment (now the mock's `.tick-peek` glass pill) changed.
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
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

/** A concept tick carries its card title for the hover peek pill (F7), plus
 *  the mock's tick vocabulary (Console slice B). */
export interface SeekBarConceptTick extends SeekBarMarker {
  title?: string;
  /** attested (jade) / proposed (amber, awaiting attestation) / plain (faint,
   *  no unit backing at all) — see PlayerChrome's derivation off `attestations`. */
  kind?: "attested" | "proposed" | "plain";
  /** Span end, when known — renders a `.tail` bar from t to end (mock lines
   *  290-291, 864). Anchor data is point-only today (ConceptAnchor/UnitAnchor
   *  carry only `t`), so this is normally undefined; the tail is plumbed
   *  through and ready for whenever a data source actually supplies a span. */
  end?: number;
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

/** Console slice 4: a mined capture's bubble text is always prefixed this way
 *  by lib/mining.ts's buildMinedText — the one existing signal that
 *  distinguishes a mined pin from a hand-typed note, without a schema change. */
const MINED_TEXT_PREFIX = "[mined ";

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
  /** Console slice 7 "timeline zoom" (SURVEY.md), lifted to PlayerChrome
   *  (slice B) so the transport's t-row zoom chip can read/reset it too —
   *  the visible window of the timeline, or null for the whole video. Scroll
   *  on the bar zooms around the cursor; double-click (or the chip) resets. */
  viewport: { s: number; e: number } | null;
  onViewportChange: Dispatch<SetStateAction<{ s: number; e: number } | null>>;
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
  viewport,
  onViewportChange,
}: Props): JSX.Element {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null);
  const [hoverBubble, setHoverBubble] = useState<SeekBarBubbleMarker | null>(null);
  const [hoverPearl, setHoverPearl] = useState<SeekBarPearlMarker | null>(null);
  // Console slice B: the mock's single reused #tickPeek pill (mock lines
  // 307-312, 866-870) — label + time range, positioned at the hovered tick.
  const [hoverTick, setHoverTick] = useState<SeekBarConceptTick | null>(null);
  const [dragging, setDragging] = useState(false);
  // V3-C C5: click-to-inspect popover state — the ratio (0..1) of the click
  // that opened it, or null when closed.
  const [inspectRatio, setInspectRatio] = useState<number | null>(null);

  const vs = viewport?.s ?? 0;
  const ve = viewport?.e ?? duration;

  // A new video (duration change) always starts unzoomed.
  useEffect(() => onViewportChange(null), [duration]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;
    const onWheel = (e: WheelEvent): void => {
      if (duration <= 0) return;
      e.preventDefault();
      const rect = track.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      onViewportChange((cur) => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  /** Width, in percent of the visible window, spanned from `from` to `to` — used for a tick's `.tail`. */
  const pctWidth = (from: number, to: number): number => (span > 0 ? Math.max(0, ((to - from) / span) * 100) : 0);
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
        onDoubleClick={() => onViewportChange(null)}
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
        <div className={styles.rail} />
        {loopA != null && loopB != null && (
          <div
            className={styles.loopRange}
            style={{ left: pct(loopA), width: `calc(${pct(loopB)} - ${pct(loopA)})` }}
          />
        )}
        <div className={styles.fill} style={{ width: pct(currentTime) }} />
        {conceptTicks.filter((tick) => inView(tick.t)).map((tick) => (
          <button
            key={tick.id}
            type="button"
            className={styles.conceptTick}
            data-kind={tick.kind ?? "plain"}
            data-active={activeConceptTickId === tick.id}
            style={{ left: pct(tick.t) }}
            aria-label={`Concept: ${tick.title ?? "untitled"} at ${formatTimestamp(tick.t)}`}
            aria-pressed={activeConceptTickId === tick.id}
            onMouseEnter={() => setHoverTick(tick)}
            onMouseLeave={() => setHoverTick((cur) => (cur?.id === tick.id ? null : cur))}
            onFocus={() => setHoverTick(tick)}
            onBlur={() => setHoverTick((cur) => (cur?.id === tick.id ? null : cur))}
            onClick={(e) => {
              e.stopPropagation();
              if (onConceptTick) onConceptTick(tick);
              else onSeek(tick.t);
            }}
          >
            {tick.end != null && tick.end > tick.t && (
              <span className={styles.tail} style={{ width: `${pctWidth(tick.t, tick.end)}%` }} />
            )}
          </button>
        ))}
        {bubbles.filter((bubble) => inView(bubble.t)).map((bubble) => {
          const mined = bubble.text?.startsWith(MINED_TEXT_PREFIX) ?? false;
          return (
            <button
              key={bubble.id}
              type="button"
              className={mined ? styles.minedTick : styles.bubblePin}
              data-kind={mined ? "mined" : "bubble"}
              style={{ left: pct(bubble.t) }}
              aria-label={`${mined ? "Mined capture" : "Note"}: ${bubble.text || "untitled"} at ${formatTimestamp(bubble.t)}`}
              onMouseEnter={() => setHoverBubble(bubble)}
              onMouseLeave={() => setHoverBubble((cur) => (cur?.id === bubble.id ? null : cur))}
              onFocus={() => setHoverBubble(bubble)}
              onBlur={() => setHoverBubble((cur) => (cur?.id === bubble.id ? null : cur))}
              onClick={(e) => {
                e.stopPropagation();
                (onSeekBubble ?? onSeek)(bubble.t);
              }}
            />
          );
        })}
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
        {hoverTick && (
          <div className={styles.tickPeek} style={{ left: pct(hoverTick.t) }}>
            {hoverTick.title ?? "Untitled"}
            <span className={styles.tickPeekTime}>
              {formatTimestamp(hoverTick.t)}
              {hoverTick.end != null ? `–${formatTimestamp(hoverTick.end)}` : ""}
            </span>
          </div>
        )}
        {!hoverTick && hoverPearl && (
          <div className={styles.bubbleTooltip} style={{ left: `clamp(28px, ${pct(hoverPearl.t)}, calc(100% - 28px))` }}>
            <span className={styles.pearlStars}>
              {Array.from({ length: 3 }, (_, i) => (
                <Icon key={i} name={i < hoverPearl.importance ? "star" : "starOutline"} size={12} />
              ))}
            </span>
            <span className={styles.bubbleTooltipText}>{hoverPearl.label}</span>
          </div>
        )}
        {!hoverTick && !hoverPearl && hoverBubble && (
          <div className={styles.bubbleTooltip} style={{ left: `clamp(28px, ${pct(hoverBubble.t)}, calc(100% - 28px))` }}>
            {hoverBubble.thumbnailUrl && <img className={styles.bubbleTooltipImg} src={hoverBubble.thumbnailUrl} alt="" />}
            <span className={styles.bubbleTooltipText}>{hoverBubble.text || formatTimestamp(hoverBubble.t)}</span>
          </div>
        )}
        {!hoverTick && !hoverPearl && !hoverBubble && hover && (
          <div className={styles.tooltip} style={{ left: `clamp(16px, ${hover.x}px, calc(100% - 16px))` }}>
            {formatTimestamp(hover.t)}
          </div>
        )}
      </div>
      {/* Console slice B: the zoom chip moved into the transport's t-row
          (mock line 687, `#zoomChip` next to chapters/condensed) — PlayerChrome
          reads `viewport` (lifted here so both can see it) and renders it via
          PlayerControls; SeekBar itself no longer floats its own copy. */}
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
