// SPEC V2 "Player chrome (hover, YouTube-style)": bottom gradient scrim + controls
// that fade in on mouse-move/pause and fade out after 3s idle while playing.
// Owns the progress bar (SeekBar, with the heatmap strip + bubble pins + concept
// ticks) and the control cluster (PlayerControls), and the real Fullscreen API on
// the player frame so CC/overlays/chrome all persist into fullscreen.
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useStudyLoopStore } from "../state/store";
import { api } from "../lib/api";
import { analysisConceptToConceptCard, hashHueForHandle } from "../lib/analysisFormat";
import { Icon } from "../components/icons";
import { SeekBar, type SeekBarOverlayMarker } from "./SeekBar";
import { PlayerControls } from "./PlayerControls";
import styles from "./PlayerChrome.module.css";

const IDLE_HIDE_MS = 3000;

interface Props {
  frameRef: RefObject<HTMLDivElement>;
  /** Reported whenever the scrim's visible/hidden state changes — CCOverlay
   *  uses this to nudge itself up above the controls (SPEC "CC overlay"). */
  onVisibleChange?: (visible: boolean) => void;
}

export function PlayerChrome({ frameRef, onVisibleChange }: Props): JSX.Element {
  const currentProject = useStudyLoopStore((s) => s.currentProject);
  const currentTime = useStudyLoopStore((s) => s.currentTime);
  const duration = useStudyLoopStore((s) => s.duration);
  const isPlaying = useStudyLoopStore((s) => s.isPlaying);
  const loopA = useStudyLoopStore((s) => s.loopA);
  const loopB = useStudyLoopStore((s) => s.loopB);
  const controller = useStudyLoopStore((s) => s.controller);
  const bubbles = useStudyLoopStore((s) => s.bubbles);
  const concepts = useStudyLoopStore((s) => s.concepts);
  const analysis = useStudyLoopStore((s) => s.analysis);
  const heatmapOwn = useStudyLoopStore((s) => s.heatmapOwn);
  const heatmapOverlays = useStudyLoopStore((s) => s.heatmapOverlays);
  const heatmapMarks = useStudyLoopStore((s) => s.heatmapMarks);
  const heatmapBucketCount = useStudyLoopStore((s) => s.heatmapBucketCount);
  const loadHeatmap = useStudyLoopStore((s) => s.loadHeatmap);
  const overlays = useStudyLoopStore((s) => s.overlays);
  const overlaysVisible = useStudyLoopStore((s) => s.overlaysVisible);
  const attentionLegendSeen = useStudyLoopStore((s) => s.attentionLegendSeen);
  const dismissAttentionLegend = useStudyLoopStore((s) => s.dismissAttentionLegend);

  const [hovering, setHovering] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Visible whenever paused, the settings menu is open, or the mouse has
  // moved within the last IDLE_HIDE_MS while playing.
  const visible = !isPlaying || settingsOpen || hovering;

  useEffect(() => {
    onVisibleChange?.(visible);
  }, [visible, onVisibleChange]);

  const clearHideTimer = (): void => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => setHovering(false), IDLE_HIDE_MS);
  }, []);

  const handleMouseMove = useCallback(() => {
    setHovering(true);
    scheduleHide();
  }, [scheduleHide]);

  const handleMouseLeave = useCallback(() => {
    clearHideTimer();
    setHovering(false);
  }, []);

  useEffect(() => () => clearHideTimer(), []);

  // V2-C: server-side heatmap (SPEC "refetch after analyze completes / bubble
  // changes, debounced" — the debounce itself lives in the store's
  // loadHeatmap). analyze completion is handled by the store directly
  // (startAnalyze/pollAnalyzeStatus call loadHeatmap on success); this effect
  // covers the other trigger, bubble edits, plus the initial fetch once a
  // real duration is known.
  useEffect(() => {
    if (duration > 0) loadHeatmap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration, bubbles]);

  // Re-arm the idle timer whenever playback starts (so a just-paused->played
  // transition still fades the chrome out after 3s of no movement), and keep
  // it visible immediately on pause.
  useEffect(() => {
    if (isPlaying) scheduleHide();
    else clearHideTimer();
  }, [isPlaying, scheduleHide]);

  useEffect(() => {
    function onFullscreenChange(): void {
      setIsFullscreen(document.fullscreenElement === frameRef.current);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [frameRef]);

  const toggleFullscreen = (): void => {
    const el = frameRef.current;
    if (!el) return;
    if (document.fullscreenElement === el) {
      void document.exitFullscreen();
    } else {
      void el.requestFullscreen?.();
    }
  };

  // V2-C: AI-breakdown concepts join the doc-concept tick pool on the seek
  // bar too (SPEC: "anchored ones join the ticker windows like doc
  // concepts") — same shape, so they render identically, just sourced from
  // analysis.concepts instead of the attached concept doc.
  const tickerConcepts = useMemo(
    () => [...concepts, ...(analysis?.concepts.map(analysisConceptToConceptCard) ?? [])],
    [concepts, analysis]
  );

  const overlayMarkers = useMemo<SeekBarOverlayMarker[]>(() => {
    if (!overlaysVisible) return [];
    return overlays.flatMap((o) => {
      const hue = hashHueForHandle(o.bundle.shareHandle);
      const bubbleMarkers = o.bundle.bubbles.map((b, i) => ({
        id: `ov-${o.fileName}-b${i}`,
        t: b.t,
        handle: o.bundle.shareHandle,
        hue,
        kind: "bubble" as const,
      }));
      const pearlMarkers = o.bundle.pearls.map((p, i) => ({
        id: `ov-${o.fileName}-p${i}`,
        t: p.t,
        handle: o.bundle.shareHandle,
        hue,
        kind: "pearl" as const,
      }));
      return [...bubbleMarkers, ...pearlMarkers];
    });
  }, [overlays, overlaysVisible]);

  return (
    <div
      className={styles.chromeLayer}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div className={`${styles.scrim} ${visible ? styles.scrimVisible : ""}`}>
        {/* V3-C C5 "Attention heatmap" (SPEC): one-time legend line, shown
            above the strip the first time there's anything to see it about. */}
        {!attentionLegendSeen && (heatmapOwn.some((v) => v > 0) || heatmapOverlays.some((v) => v > 0)) && (
          <div className={styles.attentionLegend}>
            <span>Attention = where marks concentrate, not importance.</span>
            <button type="button" className={styles.attentionLegendClose} onClick={dismissAttentionLegend} aria-label="Dismiss">
              <Icon name="close" size={12} />
            </button>
          </div>
        )}
        <div className={styles.progressWrap}>
          <SeekBar
            currentTime={currentTime}
            duration={duration}
            loopA={loopA}
            loopB={loopB}
            attentionOwn={heatmapOwn}
            attentionOverlays={heatmapOverlays}
            attentionMarks={heatmapMarks}
            attentionBucketCount={heatmapBucketCount}
            bubbles={
              currentProject
                ? bubbles.map((b) => ({
                    id: b.id,
                    t: b.t,
                    text: b.text,
                    thumbnailUrl: b.shot ? api.shotUrl(currentProject.id, b.shot) : null,
                  }))
                : []
            }
            conceptTicks={tickerConcepts.flatMap((c) =>
              c.anchors
                .map((a, i) => (a.t != null ? { id: `${c.id}-${i}`, t: a.t, title: c.title } : null))
                .filter((tick): tick is { id: string; t: number; title: string } => tick !== null)
            )}
            pearls={(analysis?.pearls ?? []).map((p) => ({ id: `pearl-${p.t}-${p.label}`, t: p.t, label: p.label, importance: p.importance }))}
            overlayMarkers={overlayMarkers}
            onSeekPearl={(t) => controller?.seek(Math.max(0, t - 5))}
            onSeek={(t) => controller?.seek(t)}
            onSeekBubble={(t) => controller?.seek(Math.max(0, t - 5))}
          />
        </div>
        <PlayerControls
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          onMenuOpenChange={setSettingsOpen}
        />
      </div>
    </div>
  );
}
