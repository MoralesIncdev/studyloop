// Console slice B (design/mockups/video-console/index.html lines 676-699):
// the mock's `.t-row` — play/pause + time on the left, chapters/condensed/
// zoom/speed/A-B/focus/shortcuts on the right. Replaces the old YouTube-style
// settings popover entirely: speed is now an inline click-to-cycle control
// and A-B loop is a single cycle button (state lives in the store — see
// lib/abLoop.ts) instead of a Set A/Set B/Clear menu. Approved deviations
// from the literal mock markup (SPEC): a minimal mute toggle stays (the app
// has no other volume affordance), and the CC/fullscreen buttons stay too.
import { useStudyLoopStore } from "../state/store";
import { formatTimestamp } from "../lib/time";
import { nextPlaybackRate } from "../lib/playbackRate";
import { Icon } from "../components/icons";
import { Tooltip } from "../components/Tooltip";
import styles from "./PlayerControls.module.css";

interface Props {
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  chaptersOpen: boolean;
  onToggleChapters: () => void;
  /** n.n× while the seek bar is zoomed, else null — SeekBar owns the zoom
   *  viewport itself (scroll-to-zoom, double-click to reset); this button
   *  mirrors its state and delegates the reset back to it. */
  zoomFactor: number | null;
  onResetZoom: () => void;
}

export function PlayerControls({
  isFullscreen,
  onToggleFullscreen,
  chaptersOpen,
  onToggleChapters,
  zoomFactor,
  onResetZoom,
}: Props): JSX.Element {
  const controller = useStudyLoopStore((s) => s.controller);
  const isPlaying = useStudyLoopStore((s) => s.isPlaying);
  const currentTime = useStudyLoopStore((s) => s.currentTime);
  const duration = useStudyLoopStore((s) => s.duration);
  const playbackRate = useStudyLoopStore((s) => s.playbackRate);
  const volume = useStudyLoopStore((s) => s.volume);
  const loopA = useStudyLoopStore((s) => s.loopA);
  const loopB = useStudyLoopStore((s) => s.loopB);
  const cycleAbLoop = useStudyLoopStore((s) => s.cycleAbLoop);
  const condensedPlayback = useStudyLoopStore((s) => s.condensedPlayback);
  const toggleCondensedPlayback = useStudyLoopStore((s) => s.toggleCondensedPlayback);
  const focusMode = useStudyLoopStore((s) => s.focusMode);
  const toggleFocusMode = useStudyLoopStore((s) => s.toggleFocusMode);
  const toggleKeymap = useStudyLoopStore((s) => s.toggleKeymap);
  const ccEnabled = useStudyLoopStore((s) => s.ccEnabled);
  const toggleCcEnabled = useStudyLoopStore((s) => s.toggleCcEnabled);

  const togglePlay = (): void => {
    if (!controller) return;
    if (isPlaying) controller.pause();
    else controller.play();
  };

  const cycleRate = (): void => controller?.setRate(nextPlaybackRate(playbackRate));

  const muted = volume === 0;
  const toggleMute = (): void => controller?.setVolume(muted ? 1 : 0);

  // mpv-style A→B→clear (see lib/abLoop.ts) — 0 = nothing set, 1 = A set
  // (waiting on B), 2 = a full loop is active.
  const abStep = loopA == null ? 0 : loopB == null ? 1 : 2;

  return (
    <div className={styles.controls}>
      <button
        type="button"
        className={styles.tBtn}
        onClick={togglePlay}
        disabled={!controller}
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        <Icon name={isPlaying ? "pause" : "play"} size={17} />
      </button>

      <button
        type="button"
        className={styles.tBtn}
        onClick={toggleMute}
        disabled={!controller}
        aria-label={muted ? "Unmute" : "Mute"}
      >
        <Icon name={muted ? "volumeOff" : "volumeHigh"} size={17} />
      </button>

      <span className={styles.time}>
        <b>{formatTimestamp(currentTime)}</b> / {formatTimestamp(duration)}
      </span>

      <button
        type="button"
        className={`${styles.tBtn} ${chaptersOpen ? styles.on : ""}`}
        onClick={onToggleChapters}
        aria-label="Chapters"
        aria-pressed={chaptersOpen}
      >
        <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M2 4h12M2 8h12M2 12h7" />
        </svg>
      </button>

      <Tooltip label="Condensed: play concepts only (C)">
        <button
          type="button"
          className={`${styles.tBtn} ${condensedPlayback ? styles.on : ""}`}
          onClick={toggleCondensedPlayback}
          aria-label="Condensed playback"
          aria-pressed={condensedPlayback}
        >
          <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 8h3M6.5 8h3M11 8h3" />
            <path d="M3.5 4.5L6 8l-2.5 3.5M8.5 4.5L11 8l-2.5 3.5" />
          </svg>
        </button>
      </Tooltip>

      {zoomFactor != null && (
        <Tooltip label="Reset timeline zoom">
          <button type="button" className={styles.zoomChip} onClick={onResetZoom}>
            {zoomFactor.toFixed(1)}×
          </button>
        </Tooltip>
      )}

      <div className={styles.spacer} />

      <Tooltip label="Playback speed — click to cycle">
        <button type="button" className={styles.speed} onClick={cycleRate} disabled={!controller}>
          {playbackRate}×
        </button>
      </Tooltip>

      <Tooltip label="A-B loop: set A → set B → clear (L)">
        <button
          type="button"
          className={`${styles.tBtn} ${abStep > 0 ? styles.on : ""}`}
          onClick={cycleAbLoop}
          disabled={!controller}
          aria-label="A-B loop"
          data-ab-step={abStep}
        >
          <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 5h10a0 0 0 010 6H3" />
            <path d="M5.5 2.5L3 5l2.5 2.5" />
          </svg>
        </button>
      </Tooltip>

      <Tooltip label="Toggle captions (B)">
        <button
          type="button"
          className={`${styles.tBtn} ${ccEnabled ? styles.on : ""}`}
          onClick={toggleCcEnabled}
          aria-label="Toggle captions"
          aria-pressed={ccEnabled}
        >
          <Icon name="closedCaption" size={17} />
        </button>
      </Tooltip>

      <Tooltip label="Focus mode (F)">
        <button
          type="button"
          className={`${styles.tBtn} ${focusMode ? styles.on : ""}`}
          onClick={toggleFocusMode}
          aria-label="Focus mode"
          aria-pressed={focusMode}
        >
          <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="8" cy="8" r="2.4" />
            <path d="M8 1.5V4M8 12v2.5M1.5 8H4M12 8h2.5" />
          </svg>
        </button>
      </Tooltip>

      <Tooltip label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
        <button
          type="button"
          className={styles.tBtn}
          onClick={onToggleFullscreen}
          aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          aria-pressed={isFullscreen}
        >
          <Icon name={isFullscreen ? "fullscreenExit" : "fullscreen"} size={17} />
        </button>
      </Tooltip>

      <Tooltip label="Shortcuts (?)">
        <button type="button" className={styles.tBtn} onClick={toggleKeymap} aria-label="Shortcuts">
          <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="8" cy="8" r="6.5" />
            <path d="M6 6.2c0-1.1.9-2 2-2s2 .8 2 1.8c0 1.4-2 1.6-2 3" />
            <circle cx="8" cy="11.6" r="0.5" fill="currentColor" />
          </svg>
        </button>
      </Tooltip>
    </div>
  );
}
