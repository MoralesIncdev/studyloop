// F4/F5 BubbleRail: chronological list of captured bubbles (notation + screenshot-
// only) for the open project. Click the time chip or the thumbnail to seek t-5s,
// click the text to edit inline (PATCH on blur), delete with confirm, or push a
// bubble into the long-running notes with the "Add to notes" action.
import { useState } from "react";
import { useStudyLoopStore } from "../state/store";
import { api } from "../lib/api";
import { formatTimestamp } from "../lib/time";
import { Icon } from "../components/icons";
import type { Bubble } from "../lib/types";
import styles from "./BubbleRail.module.css";

const SEEK_BACK_SECONDS = 5;

export function BubbleRail(): JSX.Element {
  const bubbles = useStudyLoopStore((s) => s.bubbles);
  const bubblesLoading = useStudyLoopStore((s) => s.bubblesLoading);
  const currentProject = useStudyLoopStore((s) => s.currentProject);
  const controller = useStudyLoopStore((s) => s.controller);
  const patchBubble = useStudyLoopStore((s) => s.patchBubble);
  const deleteBubble = useStudyLoopStore((s) => s.deleteBubble);
  const appendBubbleToNotes = useStudyLoopStore((s) => s.appendBubbleToNotes);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);

  const seekTo = (t: number): void => controller?.seek(Math.max(0, t - SEEK_BACK_SECONDS));

  const startEdit = (bubble: Bubble): void => {
    setEditingId(bubble.id);
    setDraft(bubble.text);
  };

  const commitEdit = (bubble: Bubble): void => {
    if (draft !== bubble.text) void patchBubble(bubble.id, { text: draft });
    setEditingId(null);
  };

  const handleDelete = (bubble: Bubble): void => {
    if (!window.confirm(`Delete the capture at ${formatTimestamp(bubble.t)}?`)) return;
    setRemovingId(bubble.id);
    window.setTimeout(() => void deleteBubble(bubble.id), 180);
  };

  if (bubblesLoading && bubbles.length === 0) {
    return <p className={styles.status}>Loading captures…</p>;
  }
  if (bubbles.length === 0) {
    return <p className={styles.status}>No captures yet. Press N (notation) or S (screenshot) while watching.</p>;
  }

  return (
    <ul className={styles.list}>
      {bubbles.map((bubble) => {
        const noCaption = !bubble.text && !!bubble.shot;
        const isEditing = editingId === bubble.id;
        return (
          <li key={bubble.id} className={styles.item} data-removing={removingId === bubble.id}>
            <button
              type="button"
              className={styles.thumb}
              onClick={() => seekTo(bubble.t)}
              aria-label={`Seek to ${formatTimestamp(bubble.t)}`}
            >
              {bubble.shot && currentProject ? (
                <img className={styles.thumbImg} src={api.shotUrl(currentProject.id, bubble.shot)} alt="" />
              ) : (
                <span className={styles.thumbPlaceholder}>—</span>
              )}
            </button>
            <div className={styles.body}>
              <div className={styles.metaRow}>
                <button type="button" className={styles.chip} onClick={() => seekTo(bubble.t)}>
                  {formatTimestamp(bubble.t)}
                </button>
                {noCaption && !isEditing && <span className={styles.badge}>no caption</span>}
              </div>
              {isEditing ? (
                <textarea
                  className={styles.editText}
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => commitEdit(bubble)}
                />
              ) : (
                <button type="button" className={styles.textButton} onClick={() => startEdit(bubble)}>
                  {bubble.text || "Add caption"}
                </button>
              )}
            </div>
            <div className={styles.itemActions}>
              <button
                type="button"
                className={styles.iconButton}
                title="Add to notes"
                aria-label="Add to notes"
                onClick={() => void appendBubbleToNotes(bubble.id)}
              >
                <Icon name="noteAdd" size={18} />
              </button>
              <button
                type="button"
                className={styles.deleteButton}
                title="Delete capture"
                aria-label="Delete capture"
                onClick={() => handleDelete(bubble)}
              >
                <Icon name="delete" size={18} />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
