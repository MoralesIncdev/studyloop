// Console slice D item 8 (mock's ghostTick, index.html lines 1305-1313):
// rewatch resurfacing — when the playhead passes within ~4s of one of your
// own notes' anchors, its text fades back in over the footage (near the note
// pane's home spot), fading out again as you move on. Mined captures are
// excluded (they're clips, not notes — same "[mined " prefix SeekBar keys
// off), and resurfacing is suppressed while a note is being written
// (store.noteEditing, set by NotePane's textarea focus/blur).
import { useMemo } from "react";
import { useStudyLoopStore } from "../state/store";
import { formatTimestamp } from "../lib/time";
import styles from "./GhostNote.module.css";

const GHOST_WINDOW_S = 4;
const MINED_TEXT_PREFIX = "[mined ";

export function GhostNote(): JSX.Element {
  const bubbles = useStudyLoopStore((s) => s.bubbles);
  const currentTime = useStudyLoopStore((s) => s.currentTime);
  const noteEditing = useStudyLoopStore((s) => s.noteEditing);

  const ghost = useMemo(() => {
    if (noteEditing) return null;
    return bubbles.find((b) => !b.text.startsWith(MINED_TEXT_PREFIX) && Math.abs(currentTime - b.t) <= GHOST_WINDOW_S) ?? null;
  }, [bubbles, currentTime, noteEditing]);

  // Always mounted so the opacity transition runs on both fade-in and fade-out.
  return (
    <div className={`${styles.ghost} ${ghost ? styles.on : ""}`} aria-hidden="true">
      {ghost && (
        <>
          <span className={styles.tc}>{formatTimestamp(ghost.t)}</span>
          {ghost.text}
        </>
      )}
    </div>
  );
}
