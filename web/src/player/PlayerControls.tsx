// Play/pause, elapsed/duration readout, and the speed control (F3 ergonomics).
import { useStudyLoopStore } from "../state/store";
import { clampRate } from "../state/store";
import { formatTimestamp } from "../lib/time";
import styles from "./PlayerControls.module.css";

const RATE_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5];

export function PlayerControls(): JSX.Element {
  const controller = useStudyLoopStore((s) => s.controller);
  const isPlaying = useStudyLoopStore((s) => s.isPlaying);
  const currentTime = useStudyLoopStore((s) => s.currentTime);
  const duration = useStudyLoopStore((s) => s.duration);
  const playbackRate = useStudyLoopStore((s) => s.playbackRate);
  const loopA = useStudyLoopStore((s) => s.loopA);
  const loopB = useStudyLoopStore((s) => s.loopB);
  const clearLoop = useStudyLoopStore((s) => s.clearLoop);
  const openNotation = useStudyLoopStore((s) => s.openNotation);
  const captureScreenshotOnly = useStudyLoopStore((s) => s.captureScreenshotOnly);
  const health = useStudyLoopStore((s) => s.health);

  // `health === null` means the check hasn't resolved yet — don't disable on
  // a guess; only disable once we positively know ffmpeg is missing.
  const ffmpegMissing = health?.ffmpeg === false;

  const togglePlay = () => {
    if (!controller) return;
    if (isPlaying) controller.pause();
    else controller.play();
  };

  const changeRate = (r: number) => {
    const next = clampRate(r);
    // The player itself syncs the store with whatever rate actually ends up
    // in effect (see PlayerHandle.setRate) — YouTube in particular can snap
    // `next` to its own nearest supported value, so we don't also call
    // setPlaybackRate here with the merely-requested value.
    controller?.setRate(next);
  };

  // When the active player is constrained to a discrete set of rates
  // (YouTube's IFrame API), only offer the ones it actually supports —
  // otherwise picking an option YouTube would just silently snap away from
  // is misleading. A player with no such constraint (plain <video>) omits
  // getAvailableRates entirely, so the full default list is used.
  const availableRates = controller?.getAvailableRates?.();
  const filteredRates = availableRates ? RATE_STEPS.filter((r) => availableRates.includes(r)) : RATE_STEPS;
  // Always keep the current rate selectable even if it falls outside the
  // filtered set (e.g. carried over from a differently-constrained player on
  // the previous video) so the <select>'s value is never orphaned.
  const rateOptions = filteredRates.includes(playbackRate)
    ? filteredRates
    : [...filteredRates, playbackRate].sort((a, b) => a - b);

  return (
    <div className={styles.controls}>
      <button type="button" className={styles.playButton} onClick={togglePlay} disabled={!controller} aria-label={isPlaying ? "Pause" : "Play"}>
        {isPlaying ? "⏸" : "▶"}
      </button>
      <span className={styles.time}>
        {formatTimestamp(currentTime)} / {formatTimestamp(duration)}
      </span>
      <button type="button" className={styles.captureButton} onClick={openNotation} disabled={!controller} title="Add notation (N)">
        ✎ Note
      </button>
      <button
        type="button"
        className={styles.captureButton}
        onClick={() => void captureScreenshotOnly()}
        disabled={!controller || ffmpegMissing}
        title={ffmpegMissing ? "ffmpeg not found on PATH — screenshots are disabled" : "Screenshot (S)"}
      >
        📷 Shot
      </button>
      <div className={styles.spacer} />
      {loopA != null && (
        <button type="button" className={styles.loopBadge} onClick={clearLoop} title="Clear A/B loop">
          Loop {formatTimestamp(loopA)}
          {loopB != null ? `–${formatTimestamp(loopB)}` : "–…"} ✕
        </button>
      )}
      <label className={styles.rateLabel}>
        Speed
        <select
          className={styles.rateSelect}
          value={playbackRate}
          onChange={(e) => changeRate(Number(e.target.value))}
        >
          {rateOptions.map((r) => (
            <option key={r} value={r}>
              {r}×
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
