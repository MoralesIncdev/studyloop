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
import { ModalShell } from "../components/ModalShell";
import type { NotationModalState } from "../state/store";
import styles from "./NotationModal.module.css";

const SHOT_WAIT_TIMEOUT_MS = 15_000;
/** Matches --duration-modal (280ms), the card's own CSS exit-animation length. */
const EXIT_DURATION_MS = 280;

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

  // codex P0-3: the store nulls `notationModal` synchronously on cancel/save,
  // but the dialog needs its content for the whole closing animation — keep
  // the last non-null value around and render that while ModalShell plays
  // the exit transition.
  const [displayModal, setDisplayModal] = useState<NotationModalState | null>(modal);
  useEffect(() => {
    if (modal) setDisplayModal(modal);
  }, [modal]);

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

  // Reset the draft each time the modal transitions closed -> open (autofocus
  // is now ModalShell's job, via initialFocusRef).
  useEffect(() => {
    if (modal && !wasOpenRef.current) {
      setText("");
      wasOpenRef.current = true;
    } else if (!modal && wasOpenRef.current) {
      wasOpenRef.current = false;
    }
  }, [modal]);

  // A new generation (fresh N press, cancel, or a save that just completed)
  // invalidates any pending wait so it can never bleed into the next attempt.
  useEffect(() => {
    clearWait();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notationGeneration]);

  if (!currentProject) return null;

  const busy = Boolean(modal?.saving) || waitingForShot;

  const handleSave = (): void => {
    if (!modal) return;
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

  if (!displayModal) return null;

  return (
    <ModalShell
      open={modal != null}
      onClose={cancelNotation}
      closeDisabled={busy}
      exitDurationMs={EXIT_DURATION_MS}
      ariaLabel="Add notation"
      overlayClassName={styles.overlay}
      cardClassName={styles.card}
      cardAs="form"
      initialFocusRef={textareaRef}
      onSubmit={(e) => {
        e.preventDefault();
        handleSave();
      }}
    >
        <header className={styles.header}>
          <div className={styles.headerText}>
            <h2 className={styles.title}>Add notation</h2>
            <span className={styles.timestamp}>{formatTimestamp(displayModal.t)}</span>
          </div>
          <button type="button" className={styles.closeButton} onClick={cancelNotation} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className={styles.content}>
          <div className={styles.thumb}>
            {displayModal.shotLoading && <div className={styles.spinner} aria-label="Capturing frame…" />}
            {!displayModal.shotLoading && displayModal.shot && (
              <img className={styles.thumbImg} src={api.shotUrl(currentProject.id, displayModal.shot)} alt="" />
            )}
            {!displayModal.shotLoading && !displayModal.shot && <div className={styles.noFrame}>No frame</div>}
          </div>
          <div className={styles.fields}>
            {/* V3-A A2: the learner's own words come first (PEDAGOGY §1
                generate-first) — the ghost prompt rotates one-per-open (see
                lib/notationPrompts.ts), never cycling while typing. */}
            <textarea
              ref={textareaRef}
              className={styles.textarea}
              placeholder={displayModal.ghostPrompt}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={waitingForShot}
            />

            {(displayModal.conceptTitle || displayModal.quote) && (
              <div className={styles.referenceBlock}>
                <span className={styles.referenceLabel}>Reference</span>
                {displayModal.conceptTitle && (
                  <div className={styles.conceptChip}>
                    <span className={styles.conceptChipText}>re: {displayModal.conceptTitle}</span>
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

                {displayModal.quote && (
                  <div className={styles.quote}>
                    <span className={styles.quoteText}>&ldquo;{displayModal.quote}&rdquo;</span>
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
              </div>
            )}
          </div>
        </div>

        <footer className={styles.actions}>
          <button type="button" className={styles.secondaryButton} onClick={cancelNotation} title="Cancel (Esc)" aria-keyshortcuts="Escape">
            Cancel
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
            {displayModal.saving ? "Saving…" : waitingForShot ? "Capturing…" : "Save"}
          </button>
        </footer>
      </ModalShell>
  );
}
