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
  const setPlaybackRate = useStudyLoopStore((s) => s.setPlaybackRate);
  const loopA = useStudyLoopStore((s) => s.loopA);
  const loopB = useStudyLoopStore((s) => s.loopB);
  const clearLoop = useStudyLoopStore((s) => s.clearLoop);

  const togglePlay = () => {
    if (!controller) return;
    if (isPlaying) controller.pause();
    else controller.play();
  };

  const changeRate = (r: number) => {
    const next = clampRate(r);
    controller?.setRate(next);
    setPlaybackRate(next);
  };

  return (
    <div className={styles.controls}>
      <button type="button" className={styles.playButton} onClick={togglePlay} disabled={!controller} aria-label={isPlaying ? "Pause" : "Play"}>
        {isPlaying ? "⏸" : "▶"}
      </button>
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
      <label className={styles.rateLabel}>
        Speed
        <select
          className={styles.rateSelect}
          value={playbackRate}
          onChange={(e) => changeRate(Number(e.target.value))}
        >
          {RATE_STEPS.map((r) => (
            <option key={r} value={r}>
              {r}×
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
