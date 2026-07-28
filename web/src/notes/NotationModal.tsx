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
import { Icon } from "../components/icons";
import styles from "./NotationModal.module.css";

const SHOT_WAIT_TIMEOUT_MS = 15_000;

export function NotationModal(): JSX.Element | null {
  const modal = useStudyLoopStore((s) => s.notationModal);
  const notationGeneration = useStudyLoopStore((s) => s.notationGeneration);
  const currentProject = useStudyLoopStore((s) => s.currentProject);
  const cancelNotation = useStudyLoopStore((s) => s.cancelNotation);
  const removeNotationQuote = useStudyLoopStore((s) => s.removeNotationQuote);
  const removeNotationConcept = useStudyLoopStore((s) => s.removeNotationConcept);
  const saveNotation = useStudyLoopStore((s) => s.saveNotation);

  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const wasOpenRef = useRef(false);
  const invokerRef = useRef<HTMLElement | null>(null);
  const cardRef = useRef<HTMLFormElement | null>(null);

  // Save must not race the in-flight shot capture: while shotLoading, Save
  // waits on modal.shotPromise (bounded — after 15s it offers "Save without
  // frame" instead of hanging forever) rather than immediately creating a
  // bubble with shot: null out from under a capture that's about to land.
  const [waitingForShot, setWaitingForShot] = useState(false);
  const [offerSaveWithoutFrame, setOfferSaveWithoutFrame] = useState(false);
  const waitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waitTokenRef = useRef(0);

  const clearWait = (): void => {
    if (waitTimerRef.current) {
      clearTimeout(waitTimerRef.current);
      waitTimerRef.current = null;
    }
    waitTokenRef.current += 1; // invalidates any in-flight .finally() from a previous wait
    setWaitingForShot(false);
    setOfferSaveWithoutFrame(false);
  };

  // Reset the draft + autofocus each time the modal transitions closed -> open;
  // remember the invoking control so focus can be restored on close.
  useEffect(() => {
    if (modal && !wasOpenRef.current) {
      setText("");
      invokerRef.current = document.activeElement as HTMLElement | null;
      const raf = requestAnimationFrame(() => textareaRef.current?.focus());
      wasOpenRef.current = true;
      return () => cancelAnimationFrame(raf);
    }
    if (!modal && wasOpenRef.current) {
      wasOpenRef.current = false;
      invokerRef.current?.focus?.();
    }
    return undefined;
  }, [modal]);

  // A new generation (fresh N press, cancel, or a save that just completed)
  // invalidates any pending wait so it can never bleed into the next attempt.
  useEffect(() => {
    clearWait();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notationGeneration]);

  useEffect(() => {
    if (!modal) return undefined;
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelNotation();
        return;
      }
      // Simple focus trap: keep Tab cycling within the card.
      if (e.key === "Tab" && cardRef.current) {
        const focusable = cardRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modal, cancelNotation]);

  if (!modal || !currentProject) return null;

  const busy = modal.saving || waitingForShot;

  const handleSave = (): void => {
    if (modal.shotLoading && modal.shotPromise) {
      const token = waitTokenRef.current;
      setWaitingForShot(true);
      setOfferSaveWithoutFrame(false);
      waitTimerRef.current = setTimeout(() => {
        if (waitTokenRef.current !== token) return;
        setOfferSaveWithoutFrame(true);
      }, SHOT_WAIT_TIMEOUT_MS);
      modal.shotPromise.finally(() => {
        // Superseded (cancelled, timed out into "save without frame", or a
        // new N press) while we were waiting — don't act on stale intent.
        if (waitTokenRef.current !== token) return;
        clearWait();
        void saveNotation(text);
      });
      return;
    }
    void saveNotation(text);
  };

  const handleSaveWithoutFrame = (): void => {
    clearWait();
    void saveNotation(text);
  };

  const handleBackdropClick = (): void => {
    if (busy) return;
    cancelNotation();
  };

  return (
    <div className={styles.overlay} data-state="open" role="presentation" onMouseDown={handleBackdropClick}>
      <form
        className={styles.card}
        ref={cardRef}
        data-state="open"
        role="dialog"
        aria-modal="true"
        aria-label="Add notation"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          handleSave();
        }}
      >
        <header className={styles.header}>
          <div className={styles.headerText}>
            <h2 className={styles.title}>Add notation</h2>
            <span className={styles.timestamp}>{formatTimestamp(modal.t)}</span>
          </div>
          <button type="button" className={styles.closeButton} onClick={cancelNotation} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className={styles.content}>
          <div className={styles.thumb}>
            {modal.shotLoading && <div className={styles.spinner} aria-label="Capturing frame…" />}
            {!modal.shotLoading && modal.shot && (
              <img className={styles.thumbImg} src={api.shotUrl(currentProject.id, modal.shot)} alt="" />
            )}
            {!modal.shotLoading && !modal.shot && <div className={styles.noFrame}>No frame</div>}
          </div>
          <div className={styles.fields}>
            {modal.conceptTitle && (
              <div className={styles.conceptChip}>
                <span className={styles.conceptChipText}>re: {modal.conceptTitle}</span>
                <button
                  type="button"
                  className={styles.quoteRemove}
                  onClick={removeNotationConcept}
                  aria-label="Remove concept reference"
                  title="Remove concept reference"
                >
                  <Icon name="close" size={12} />
                </button>
              </div>
            )}

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
                  <Icon name="close" size={12} />
                </button>
              </div>
            )}

            <textarea
              ref={textareaRef}
              className={styles.textarea}
              placeholder="Add a note…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={waitingForShot}
            />
          </div>
        </div>

        <footer className={styles.actions}>
          <button type="button" className={styles.secondaryButton} onClick={cancelNotation}>
            Cancel (Esc)
          </button>
          {offerSaveWithoutFrame && (
            <button type="button" className={styles.secondaryButton} onClick={handleSaveWithoutFrame}>
              Save without frame
            </button>
          )}
          <button
            type="submit"
            className={styles.primaryButton}
            disabled={busy}
            aria-busy={busy}
          >
            {busy && <span className={styles.buttonSpinner} aria-hidden="true" />}
            {modal.saving ? "Saving…" : waitingForShot ? "Capturing…" : "Save"}
          </button>
        </footer>
      </form>
    </div>
  );
}
