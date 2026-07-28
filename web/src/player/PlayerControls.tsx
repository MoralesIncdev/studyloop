// YouTube-style control cluster, rendered inside PlayerChrome's hover scrim (SPEC
// V2 "Player chrome": "left group ▶/⏸, volume, time … right cluster: ✎ Note ·
// 📷 Shot · ✨ Analyze · CC · ⚙(speed/loop) · ⛶ fullscreen"). Play/pause, volume,
// and the settings (speed + A/B loop) menu live here; the progress bar itself is
// SeekBar, rendered by PlayerChrome above this row.
import { useEffect, useRef, useState } from "react";
import { useStudyLoopStore } from "../state/store";
import { clampRate } from "../state/store";
import { formatTimestamp } from "../lib/time";
import styles from "./PlayerControls.module.css";

const RATE_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5];

interface Props {
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onMenuOpenChange: (open: boolean) => void;
}

export function PlayerControls({ isFullscreen, onToggleFullscreen, onMenuOpenChange }: Props): JSX.Element {
  const controller = useStudyLoopStore((s) => s.controller);
  const isPlaying = useStudyLoopStore((s) => s.isPlaying);
  const currentTime = useStudyLoopStore((s) => s.currentTime);
  const duration = useStudyLoopStore((s) => s.duration);
  const playbackRate = useStudyLoopStore((s) => s.playbackRate);
  const volume = useStudyLoopStore((s) => s.volume);
  const loopA = useStudyLoopStore((s) => s.loopA);
  const loopB = useStudyLoopStore((s) => s.loopB);
  const setLoopA = useStudyLoopStore((s) => s.setLoopA);
  const setLoopB = useStudyLoopStore((s) => s.setLoopB);
  const clearLoop = useStudyLoopStore((s) => s.clearLoop);
  const openNotation = useStudyLoopStore((s) => s.openNotation);
  const captureScreenshotOnly = useStudyLoopStore((s) => s.captureScreenshotOnly);
  const health = useStudyLoopStore((s) => s.health);
  const ccEnabled = useStudyLoopStore((s) => s.ccEnabled);
  const toggleCcEnabled = useStudyLoopStore((s) => s.toggleCcEnabled);

  const [menuOpen, setMenuOpenState] = useState(false);
  const menuWrapRef = useRef<HTMLDivElement | null>(null);

  const setMenuOpen = (open: boolean): void => {
    setMenuOpenState(open);
    onMenuOpenChange(open);
  };

  useEffect(() => {
    if (!menuOpen) return undefined;
    function onPointerDown(e: MouseEvent): void {
      if (menuWrapRef.current && !menuWrapRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuOpen]);

  // `health === null` means the check hasn't resolved yet — don't disable on
  // a guess; only disable once we positively know ffmpeg is missing.
  const ffmpegMissing = health?.ffmpeg === false;

  const togglePlay = (): void => {
    if (!controller) return;
    if (isPlaying) controller.pause();
    else controller.play();
  };

  const changeRate = (r: number): void => {
    const next = clampRate(r);
    // The player itself syncs the store with whatever rate actually ends up
    // in effect (see PlayerHandle.setRate) — YouTube in particular can snap
    // `next` to its own nearest supported value.
    controller?.setRate(next);
  };

  const availableRates = controller?.getAvailableRates?.();
  const filteredRates = availableRates ? RATE_STEPS.filter((r) => availableRates.includes(r)) : RATE_STEPS;
  const rateOptions = filteredRates.includes(playbackRate)
    ? filteredRates
    : [...filteredRates, playbackRate].sort((a, b) => a - b);

  const muted = volume === 0;
  const toggleMute = (): void => controller?.setVolume(muted ? 1 : 0);

  return (
    <div className={styles.controls}>
      <button
        type="button"
        className={styles.iconButton}
        onClick={togglePlay}
        disabled={!controller}
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? "⏸" : "▶"}
      </button>

      <button type="button" className={styles.iconButton} onClick={toggleMute} disabled={!controller} aria-label={muted ? "Unmute" : "Mute"}>
        {muted ? "🔇" : "🔊"}
      </button>
      <input
        type="range"
        className={styles.volumeSlider}
        min={0}
        max={1}
        step={0.05}
        value={volume}
        disabled={!controller}
        onChange={(e) => controller?.setVolume(Number(e.target.value))}
        aria-label="Volume"
      />

      <span className={styles.time}>
        {formatTimestamp(currentTime)} / {formatTimestamp(duration)}
      </span>

      <div className={styles.spacer} />

      {loopA != null && (
        <button type="button" className={styles.loopBadge} onClick={clearLoop} title="Clear A/B loop">
          Loop {formatTimestamp(loopA)}
          {loopB != null ? `–${formatTimestamp(loopB)}` : "–…"} ✕
        </button>
      )}

      <button type="button" className={styles.iconButton} onClick={openNotation} disabled={!controller} title="Add notation (N)">
        ✎
      </button>
      <button
        type="button"
        className={styles.iconButton}
        onClick={() => void captureScreenshotOnly()}
        disabled={!controller || ffmpegMissing}
        title={ffmpegMissing ? "ffmpeg not found on PATH — screenshots are disabled" : "Screenshot (S)"}
      >
        📷
      </button>
      <button type="button" className={styles.iconButton} disabled title="Arrives in next build">
        ✨
      </button>
      <button
        type="button"
        className={`${styles.iconButton} ${ccEnabled ? styles.iconButtonActive : ""}`}
        onClick={toggleCcEnabled}
        title="Toggle captions (C)"
        aria-pressed={ccEnabled}
      >
        CC
      </button>

      <div className={styles.menuWrap} ref={menuWrapRef}>
        <button
          type="button"
          className={styles.iconButton}
          onClick={() => setMenuOpen(!menuOpen)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title="Settings"
        >
          ⚙
        </button>
        {menuOpen && (
          <div className={styles.settingsMenu} role="menu">
            <div className={styles.menuSectionLabel}>Speed</div>
            <div className={styles.rateGrid}>
              {rateOptions.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`${styles.rateOption} ${r === playbackRate ? styles.rateOptionActive : ""}`}
                  onClick={() => changeRate(r)}
                >
                  {r}×
                </button>
              ))}
            </div>
            <div className={styles.menuDivider} />
            <div className={styles.menuSectionLabel}>A–B loop</div>
            <div className={styles.loopRow}>
              <button
                type="button"
                className={styles.menuButton}
                onClick={() => controller && setLoopA(controller.getCurrentTime())}
                disabled={!controller}
              >
                Set A{loopA != null ? ` (${formatTimestamp(loopA)})` : ""}
              </button>
              <button
                type="button"
                className={styles.menuButton}
                onClick={() => controller && setLoopB(controller.getCurrentTime())}
                disabled={!controller}
              >
                Set B{loopB != null ? ` (${formatTimestamp(loopB)})` : ""}
              </button>
              {(loopA != null || loopB != null) && (
                <button type="button" className={styles.menuButton} onClick={clearLoop}>
                  Clear
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        className={styles.iconButton}
        onClick={onToggleFullscreen}
        title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        aria-pressed={isFullscreen}
      >
        {isFullscreen ? "⛶" : "⛶"}
      </button>
    </div>
  );
}
