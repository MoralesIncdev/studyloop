// Console slice 8 (design/mockups/video-console/BUILD-BRIEF.md): the quick-note
// pane — the v6 mock's #p-note over the real <video>. Focusing the textarea
// stamps the anchor and soft-pauses playback (Frame.io choreography, same as
// the notation modal); blurring resumes if the pane caused the pause; Pin
// creates a bubble at the anchor and resumes 3s before it (slice 3's
// note-rewind), with the bubble's seek-bar pin appearing via the normal
// bubbles flow. The modal (N) stays the richer path — this is the zero-modal
// one for console mode.
import { useRef, useState, type RefObject } from "react";
import { useStudyLoopStore } from "../state/store";
import { formatTimestamp } from "../lib/time";
import { Pane } from "./Pane";
import styles from "./NotePane.module.css";

interface Props {
  frameRef: RefObject<HTMLDivElement>;
}

export function NotePane({ frameRef }: Props): JSX.Element | null {
  const projectId = useStudyLoopStore((s) => s.currentProject?.id ?? null);
  const pinQuickNote = useStudyLoopStore((s) => s.pinQuickNote);
  const [text, setText] = useState("");
  const [anchorT, setAnchorT] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const pausedByPaneRef = useRef(false);

  if (!projectId) return null;

  const handleFocus = (): void => {
    const store = useStudyLoopStore.getState();
    const controller = store.controller;
    if (!controller) return;
    if (anchorT == null) setAnchorT(controller.getCurrentTime());
    if (store.isPlaying) {
      pausedByPaneRef.current = true;
      controller.pause();
    }
  };

  const handleBlur = (): void => {
    if (!pausedByPaneRef.current) return;
    pausedByPaneRef.current = false;
    useStudyLoopStore.getState().controller?.play();
  };

  const handlePin = async (): Promise<void> => {
    const trimmed = text.trim();
    if (anchorT == null || !trimmed || saving) return;
    setSaving(true);
    try {
      await pinQuickNote(anchorT, trimmed);
      setText("");
      setAnchorT(null);
      pausedByPaneRef.current = false;
      const controller = useStudyLoopStore.getState().controller;
      if (controller) {
        controller.seek(Math.max(0, anchorT - 3));
        controller.play();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Pane
      paneId="p-note"
      dataPane="note"
      projectId={projectId}
      frameRef={frameRef}
      defaultPos={{ fx: 0.04, fy: 0.6 }}
      width={260}
      label={anchorT != null ? <>NOTE &middot; {formatTimestamp(anchorT)}</> : "NOTE"}
    >
      <textarea
        className={styles.input}
        value={text}
        placeholder="Type over the footage · pauses while you write"
        rows={2}
        onChange={(e) => setText(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void handlePin();
          }
        }}
      />
      <div className={styles.row}>
        <span className={styles.hint}>{anchorT != null ? `anchors at ${formatTimestamp(anchorT)}` : "anchors at playhead"}</span>
        <button type="button" className={styles.pin} disabled={saving || !text.trim()} onClick={() => void handlePin()}>
          Pin
        </button>
      </div>
    </Pane>
  );
}
