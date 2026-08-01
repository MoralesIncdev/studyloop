// Console slice D item 6 (mock's #p-suggest, index.html lines 556-573 +
// acceptSuggest lines 1296-1304): the suggested-cue pane. There is no
// study_cues feature in this codebase — lib/suggestedCues.ts derives the
// nearest real signal: the quoted transcript anchor of the latest
// still-pending unit covering the playhead. "Keep as note" pins the quote as
// a bubble at its anchor via the existing quick-note path (store.pinQuickNote,
// same call NotePane's Pin makes) and flashes the status-chips context line
// (store.flashContext → StatusChips); "Ignore" hides the pane until the NEXT
// cue (a different anchor or unit re-arms it).
import { useMemo, useState, type RefObject } from "react";
import { useStudyLoopStore } from "../state/store";
import { suggestedCueAt } from "../lib/suggestedCues";
import { formatTimestamp } from "../lib/time";
import { Pane } from "./Pane";
import paneStyles from "./Pane.module.css";
import styles from "./SuggestPane.module.css";

interface Props {
  frameRef: RefObject<HTMLDivElement>;
}

export function SuggestPane({ frameRef }: Props): JSX.Element | null {
  const analysis = useStudyLoopStore((s) => s.analysis);
  const attestations = useStudyLoopStore((s) => s.attestations);
  const currentTime = useStudyLoopStore((s) => s.currentTime);
  const projectId = useStudyLoopStore((s) => s.currentProject?.id ?? null);
  const editing = useStudyLoopStore((s) => s.consoleEditMode);
  const pinQuickNote = useStudyLoopStore((s) => s.pinQuickNote);
  const flashContext = useStudyLoopStore((s) => s.flashContext);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const cue = useMemo(
    () => suggestedCueAt(analysis?.units ?? [], attestations, currentTime),
    [analysis, attestations, currentTime]
  );

  const key = cue ? `${cue.unitId}@${cue.t}` : null;
  const hidden = !cue || dismissedKey === key;
  if (hidden && !editing) return null;

  const handleKeep = async (): Promise<void> => {
    if (!cue || !key || saving) return;
    setSaving(true);
    try {
      await pinQuickNote(cue.t, cue.quote);
      flashContext(`Cue kept as note · pinned at ${formatTimestamp(cue.t)}`);
      setDismissedKey(key);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Pane
      paneId="p-suggest"
      dataPane="suggest"
      projectId={projectId}
      frameRef={frameRef}
      defaultPos={{ fx: 0.04, fy: 0.52 }}
      width={300}
      defaultMode="bare"
      chipStatus="quiet"
      label={cue ? <>SUGGESTED CUE &middot; {formatTimestamp(cue.t)}</> : "SUGGESTED CUE"}
    >
      {hidden || !cue ? (
        <p className={paneStyles.ghostText}>Lesson cues from still-open units surface here.</p>
      ) : (
        <>
          <p className={styles.quote}>
            &ldquo;<b>{cue.quote}</b>&rdquo;
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.button} disabled={saving} onClick={() => void handleKeep()}>
              Keep as note
            </button>
            <button type="button" className={styles.button} onClick={() => setDismissedKey(key)}>
              Ignore
            </button>
          </div>
        </>
      )}
    </Pane>
  );
}
