// F4 Notation flow. Rendered by StudyView whenever store.notationModal is set
// (opened by the N hotkey or the "Note" button in PlayerControls — see
// state/store.ts openNotation/cancelNotation/saveNotation). Playback is already
// paused by the time this mounts; Esc cancels + resumes, Save creates the bubble
// + resumes. The frame shot was fired off async by the store before the modal
// appeared, so this only ever renders its current (loading/ready/failed) state.
import { useEffect, useRef, useState } from "react";
import { useStudyLoopStore } from "../state/store";
import { api } from "../lib/api";
import { formatTimestamp } from "../lib/time";
import styles from "./NotationModal.module.css";

export function NotationModal(): JSX.Element | null {
  const modal = useStudyLoopStore((s) => s.notationModal);
  const currentProject = useStudyLoopStore((s) => s.currentProject);
  const cancelNotation = useStudyLoopStore((s) => s.cancelNotation);
  const removeNotationQuote = useStudyLoopStore((s) => s.removeNotationQuote);
  const saveNotation = useStudyLoopStore((s) => s.saveNotation);

  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const wasOpenRef = useRef(false);

  // Reset the draft + autofocus each time the modal transitions closed -> open.
  useEffect(() => {
    if (modal && !wasOpenRef.current) {
      setText("");
      const raf = requestAnimationFrame(() => textareaRef.current?.focus());
      wasOpenRef.current = true;
      return () => cancelAnimationFrame(raf);
    }
    if (!modal) wasOpenRef.current = false;
    return undefined;
  }, [modal]);

  useEffect(() => {
    if (!modal) return undefined;
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelNotation();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modal, cancelNotation]);

  if (!modal || !currentProject) return null;

  const handleSave = (): void => {
    void saveNotation(text);
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Add notation">
      <div className={styles.card}>
        <div className={styles.thumb}>
          {modal.shotLoading && <div className={styles.spinner} aria-label="Capturing frame…" />}
          {!modal.shotLoading && modal.shot && (
            <img className={styles.thumbImg} src={api.shotUrl(currentProject.id, modal.shot)} alt="" />
          )}
          {!modal.shotLoading && !modal.shot && <div className={styles.noFrame}>No frame</div>}
        </div>
        <div className={styles.fields}>
          <div className={styles.timestamp}>{formatTimestamp(modal.t)}</div>

          {modal.quote && (
            <div className={styles.quote}>
              <span className={styles.quoteText}>&ldquo;{modal.quote}&rdquo;</span>
              <button
                type="button"
                className={styles.quoteRemove}
                onClick={removeNotationQuote}
                aria-label="Remove quoted transcript"
                title="Remove quote"
              >
                ✕
              </button>
            </div>
          )}

          <textarea
            ref={textareaRef}
            className={styles.textarea}
            placeholder="Add a note…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />

          <div className={styles.actions}>
            <button type="button" className={styles.secondaryButton} onClick={cancelNotation}>
              Cancel (Esc)
            </button>
            <button type="button" className={styles.primaryButton} onClick={handleSave} disabled={modal.saving}>
              {modal.saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
