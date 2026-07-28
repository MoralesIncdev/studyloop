// SPEC V2 "Player chrome (hover, YouTube-style)": bottom gradient scrim + controls
// that fade in on mouse-move/pause and fade out after 3s idle while playing.
// Owns the progress bar (SeekBar, with the heatmap strip + bubble pins + concept
// ticks) and the control cluster (PlayerControls), and the real Fullscreen API on
// the player frame so CC/overlays/chrome all persist into fullscreen.
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useStudyLoopStore } from "../state/store";
import { api } from "../lib/api";
import { bubbleHeatmap } from "../lib/heatmap";
import { SeekBar } from "./SeekBar";
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

  const heatmap = bubbleHeatmap(bubbles, duration);

  return (
    <div
      className={styles.chromeLayer}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div className={`${styles.scrim} ${visible ? styles.scrimVisible : ""}`}>
        <div className={styles.progressWrap}>
          <SeekBar
            currentTime={currentTime}
            duration={duration}
            loopA={loopA}
            loopB={loopB}
            heatmap={heatmap}
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
            conceptTicks={concepts.flatMap((c) =>
              c.anchors
                .map((a, i) => (a.t != null ? { id: `${c.id}-${i}`, t: a.t, title: c.title } : null))
                .filter((tick): tick is { id: string; t: number; title: string } => tick !== null)
            )}
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
