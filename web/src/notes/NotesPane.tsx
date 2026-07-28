// F6 NotesPane: long-running markdown-lite notes for the open project. The
// textarea is bound directly to the store's `notes` field (updated
// optimistically on every keystroke via setNotesDraft) rather than keeping
// its own local buffer — the store, not this component, owns the debounce
// timer (see state/store.ts setNotesDraft/flushNotes), so a `flushNotes()`
// call from anywhere (CompileFlow, StudyView unmount) always sees the very
// latest edit, and an external writer like BubbleRail's "-> Notes" is simply
// the same field being written from elsewhere — nothing to reconcile.
import { useRef, useState } from "react";
import { useStudyLoopStore } from "../state/store";
import { insertTimestampToken, tokenizeNotes } from "../lib/notesFormat";
import { formatTimestamp } from "../lib/time";
import styles from "./NotesPane.module.css";

export function NotesPane(): JSX.Element {
  const notes = useStudyLoopStore((s) => s.notes);
  const notesLoaded = useStudyLoopStore((s) => s.notesLoaded);
  const notesSaveStatus = useStudyLoopStore((s) => s.notesSaveStatus);
  const setNotesDraft = useStudyLoopStore((s) => s.setNotesDraft);
  const controller = useStudyLoopStore((s) => s.controller);
  const currentTime = useStudyLoopStore((s) => s.currentTime);

  const [preview, setPreview] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    setNotesDraft(e.target.value);
  };

  const insertTimestamp = (): void => {
    const el = textareaRef.current;
    const cursor = el ? el.selectionStart : notes.length;
    const t = controller ? controller.getCurrentTime() : currentTime;
    const { content, cursor: nextCursor } = insertTimestampToken(notes, cursor, t);
    setNotesDraft(content);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const statusLabel: Record<typeof notesSaveStatus, string> = {
    idle: "",
    saving: "Saving…",
    saved: "Saved",
    error: "Save failed",
  };

  return (
    <div className={styles.pane}>
      <div className={styles.toolbar}>
        <button type="button" className={styles.toolButton} onClick={insertTimestamp} disabled={!controller} title="Insert current timestamp">
          @ timestamp
        </button>
        <button type="button" className={styles.toolButton} onClick={() => setPreview((p) => !p)}>
          {preview ? "Edit" : "Preview"}
        </button>
        <span className={styles.spacer} />
        <span className={`${styles.status} ${notesSaveStatus === "error" ? styles.statusError : ""}`}>
          {statusLabel[notesSaveStatus]}
        </span>
      </div>
      {!notesLoaded ? (
        <div className={styles.loading}>Loading notes…</div>
      ) : preview ? (
        <NotesPreview content={notes} onSeek={(t) => controller?.seek(t)} />
      ) : (
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          placeholder="Long-running notes… use @ timestamp to drop in a seek link."
          value={notes}
          onChange={handleChange}
        />
      )}
    </div>
  );
}

function NotesPreview({ content, onSeek }: { content: string; onSeek: (t: number) => void }): JSX.Element {
  const tokens = tokenizeNotes(content);
  if (tokens.length === 0 || (tokens.length === 1 && tokens[0].type === "text" && tokens[0].value === "")) {
    return <div className={styles.previewEmpty}>Nothing here yet.</div>;
  }
  return (
    <div className={styles.preview}>
      {tokens.map((token, i) => {
        if (token.type === "break") return <br key={i} />;
        if (token.type === "timestamp") {
          return (
            <button type="button" key={i} className={styles.timestampLink} onClick={() => onSeek(token.t)}>
              {formatTimestamp(token.t)}
            </button>
          );
        }
        return <span key={i}>{token.value}</span>;
      })}
    </div>
  );
}
