// Console slice B (design/mockups/video-console/index.html lines 324-333,
// 660-665, 937-947): a floating pill row above the transport — "Paused ·
// reading" while a hover-pause source holds playback, "Looping · <label> ✕"
// while a loop is active, and (600ms after a *manual* pause, mirroring the
// mock's showCtx()) a dismissible "At <t> · <nearest concept> · <n> notes
// near here" context chip. Glass pills, pointer-events only on the chips
// themselves — the row sits above the seek bar, never blocking it.
import { useEffect, useState } from "react";
import { formatTimestamp } from "../lib/time";
import { Icon } from "../components/icons";
import styles from "./StatusChips.module.css";

interface Props {
  isPlaying: boolean;
  autoPaused: boolean;
  currentTime: number;
  /** Fully formatted loop label ("Looping · <concept>" or "A–B loop · L to clear"), or null when no loop is active. */
  loopText: string | null;
  onClearLoop: () => void;
  nearestConceptTitle: string | null;
  nearbyNoteCount: number;
  /** Focus mode dims the whole row (mock body.focus lineage — see PlayerChrome). */
  dimmed?: boolean;
}

const CONTEXT_DELAY_MS = 600;

export function StatusChips({
  isPlaying,
  autoPaused,
  currentTime,
  loopText,
  onClearLoop,
  nearestConceptTitle,
  nearbyNoteCount,
  dimmed = false,
}: Props): JSX.Element {
  const [showContext, setShowContext] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // A fresh pause (not a hover-pause) flashes the context chip after a beat —
  // mirrors the mock's `ctxTimer = setTimeout(showCtx, 600)` inside
  // togglePlay(manual). Playing again, or the pause being a hover-pause
  // instead, cancels/hides it and clears any earlier dismissal.
  useEffect(() => {
    if (isPlaying || autoPaused) {
      setShowContext(false);
      setDismissed(false);
      return undefined;
    }
    const timer = setTimeout(() => setShowContext(true), CONTEXT_DELAY_MS);
    return () => clearTimeout(timer);
    // currentTime deliberately excluded: a scrub while paused shouldn't
    // restart the delay, only re-render the text underneath it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, autoPaused]);

  const contextOn = showContext && !dismissed;
  const contextText = nearestConceptTitle
    ? `At ${formatTimestamp(currentTime)} · ${nearestConceptTitle} · ${nearbyNoteCount} notes near here`
    : `At ${formatTimestamp(currentTime)} · between concepts`;

  return (
    <div className={`${styles.row} ${dimmed ? styles.dimmed : ""}`}>
      <span className={`${styles.chip} ${autoPaused ? styles.chipOn : ""}`}>
        <span className={styles.dotQuiet} />
        Paused · reading
      </span>
      {loopText != null && (
        <span className={`${styles.chip} ${styles.chipOn}`}>
          <span className={styles.dot} />
          {loopText}
          <button type="button" onClick={onClearLoop} aria-label="Clear loop">
            <Icon name="close" size={11} />
          </button>
        </span>
      )}
      <span className={`${styles.chip} ${contextOn ? styles.chipOn : ""}`}>
        <span className={styles.dot} />
        {contextText}
        <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss">
          <Icon name="close" size={11} />
        </button>
      </span>
    </div>
  );
}
