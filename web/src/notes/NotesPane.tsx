// F6 NotesPane: long-running markdown-lite notes for the open project. Autosaves
// (800ms debounce) to notes.md via store.saveNotes; the local textarea buffer is
// the source of truth while the user is actively typing (see `dirtyRef`) so an
// external notes change (e.g. BubbleRail's "-> Notes") doesn't clobber an
// in-progress edit — it's picked up on the next sync once the user isn't dirty.
import { useEffect, useRef, useState } from "react";
import { useStudyLoopStore } from "../state/store";
import { insertTimestampToken, tokenizeNotes } from "../lib/notesFormat";
import { formatTimestamp } from "../lib/time";
import styles from "./NotesPane.module.css";

const AUTOSAVE_DEBOUNCE_MS = 800;

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function NotesPane(): JSX.Element {
  const notes = useStudyLoopStore((s) => s.notes);
  const notesLoaded = useStudyLoopStore((s) => s.notesLoaded);
  const saveNotes = useStudyLoopStore((s) => s.saveNotes);
  const controller = useStudyLoopStore((s) => s.controller);
  const currentTime = useStudyLoopStore((s) => s.currentTime);

  const [text, setText] = useState("");
  const [preview, setPreview] = useState(false);
  const [status, setStatus] = useState<SaveStatus>("idle");

  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Sync from the store whenever it changes underneath us (initial load, or an
  // external writer like "-> Notes") as long as the user isn't mid-edit.
  useEffect(() => {
    if (!dirtyRef.current) setText(notes);
  }, [notes]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const scheduleSave = (value: string): void => {
    dirtyRef.current = true;
    setStatus("saving");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void saveNotes(value)
        .then(() => setStatus("saved"))
        .catch(() => setStatus("error"))
        .finally(() => {
          dirtyRef.current = false;
        });
    }, AUTOSAVE_DEBOUNCE_MS);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    setText(e.target.value);
    scheduleSave(e.target.value);
  };

  const insertTimestamp = (): void => {
    const el = textareaRef.current;
    const cursor = el ? el.selectionStart : text.length;
    const t = controller ? controller.getCurrentTime() : currentTime;
    const { content, cursor: nextCursor } = insertTimestampToken(text, cursor, t);
    setText(content);
    scheduleSave(content);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const statusLabel: Record<SaveStatus, string> = {
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
        <span className={`${styles.status} ${status === "error" ? styles.statusError : ""}`}>{statusLabel[status]}</span>
      </div>
      {!notesLoaded ? (
        <div className={styles.loading}>Loading notes…</div>
      ) : preview ? (
        <NotesPreview content={text} onSeek={(t) => controller?.seek(t)} />
      ) : (
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          placeholder="Long-running notes… use @ timestamp to drop in a seek link."
          value={text}
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
