// F10 compile UI: the header "Compile" button plus its two-step modal flow —
// an optional "caption these?" pass for uncaptioned shots (SPEC: "the
// compile step offers a 5-second caption these pass"), then the compile
// preview modal (rendered markdown + Copy/Reveal). Network calls (compile,
// reveal) live in the store per the codebase's convention; the caption-pass
// open/close state and drafts are ephemeral UI state kept local here.
import { useEffect, useState } from "react";
import { useStudyLoopStore } from "../state/store";
import { getUncaptionedBubbles } from "../lib/compileFlow";
import { api } from "../lib/api";
import { formatTimestamp } from "../lib/time";
import { Icon } from "../components/icons";
import { ModalShell } from "../components/ModalShell";
import { MarkdownPreview } from "./MarkdownPreview";
import styles from "./CompileFlow.module.css";

/** Matches --duration-modal (280ms), the card's own CSS exit-animation length. */
const EXIT_DURATION_MS = 280;

export function CompileFlow(): JSX.Element | null {
  const currentProject = useStudyLoopStore((s) => s.currentProject);
  const bubbles = useStudyLoopStore((s) => s.bubbles);
  const controller = useStudyLoopStore((s) => s.controller);
  const patchBubble = useStudyLoopStore((s) => s.patchBubble);
  const compiling = useStudyLoopStore((s) => s.compiling);
  const compileResult = useStudyLoopStore((s) => s.compileResult);
  const runCompile = useStudyLoopStore((s) => s.runCompile);
  const clearCompileResult = useStudyLoopStore((s) => s.clearCompileResult);
  const revealExport = useStudyLoopStore((s) => s.revealExport);
  const pushToast = useStudyLoopStore((s) => s.pushToast);

  const [captionPassBubbles, setCaptionPassBubbles] = useState<string[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingCaptions, setSavingCaptions] = useState(false);

  // codex P0-3: buffer the last non-null value so each dialog can keep
  // rendering its content for the full ModalShell exit animation instead of
  // vanishing the instant the driving state is nulled.
  const [displayCaptionBubbles, setDisplayCaptionBubbles] = useState<string[] | null>(captionPassBubbles);
  useEffect(() => {
    if (captionPassBubbles) setDisplayCaptionBubbles(captionPassBubbles);
  }, [captionPassBubbles]);

  const [displayCompileResult, setDisplayCompileResult] = useState(compileResult);
  useEffect(() => {
    if (compileResult) setDisplayCompileResult(compileResult);
  }, [compileResult]);

  if (!currentProject) return null;

  const handleCompileClick = (): void => {
    const uncaptioned = getUncaptionedBubbles(bubbles);
    if (uncaptioned.length > 0) {
      setDrafts(Object.fromEntries(uncaptioned.map((b) => [b.id, ""])));
      setCaptionPassBubbles(uncaptioned.map((b) => b.id));
      return;
    }
    void runCompile();
  };

  const handleCaptionSave = async (): Promise<void> => {
    setSavingCaptions(true);
    try {
      const toSave = Object.entries(drafts).filter(([, text]) => text.trim().length > 0);
      await Promise.all(toSave.map(([id, text]) => patchBubble(id, { text: text.trim() })));
    } finally {
      setSavingCaptions(false);
      setCaptionPassBubbles(null);
      void runCompile();
    }
  };

  const handleCaptionSkip = (): void => {
    setCaptionPassBubbles(null);
    void runCompile();
  };

  const handleCopy = async (): Promise<void> => {
    if (!compileResult) return;
    try {
      await navigator.clipboard.writeText(compileResult.markdown);
      pushToast("Copied markdown to clipboard", "success");
    } catch {
      pushToast("Could not copy to clipboard — your browser may be blocking clipboard access", "error");
    }
  };

  const captionRows = displayCaptionBubbles
    ? displayCaptionBubbles
        .map((id) => bubbles.find((b) => b.id === id))
        .filter((b): b is NonNullable<typeof b> => b != null)
    : [];

  return (
    <>
      <button type="button" className={styles.compileButton} data-ripple onClick={handleCompileClick} disabled={compiling} aria-busy={compiling}>
        <Icon name="bookmark" size={16} />
        {compiling ? "Compiling…" : "Compile"}
      </button>

      <ModalShell
        open={captionPassBubbles != null}
        onClose={handleCaptionSkip}
        closeDisabled={savingCaptions}
        exitDurationMs={EXIT_DURATION_MS}
        ariaLabel="Caption these shots?"
        overlayClassName={styles.overlay}
        cardClassName={styles.card}
      >
        <header className={styles.header}>
          <h2 className={styles.cardTitle}>Caption these before compiling?</h2>
          <button type="button" className={styles.closeButton} onClick={handleCaptionSkip} aria-label="Skip and close" disabled={savingCaptions}>
            <Icon name="close" size={18} />
          </button>
        </header>
        <p className={styles.cardSub}>
          {captionRows.length} screenshot{captionRows.length === 1 ? "" : "s"} {captionRows.length === 1 ? "has" : "have"} no
          caption yet. Add a quick note or skip — compile works either way.
        </p>
        <ul className={styles.captionList}>
          {captionRows.map((b) => (
            <li key={b.id} className={styles.captionRow}>
              <button
                type="button"
                className={styles.captionThumb}
                onClick={() => controller?.seek(Math.max(0, b.t - 5))}
                title={`Seek to ${formatTimestamp(b.t)}`}
              >
                {b.shot ? (
                  <img className={styles.captionThumbImg} src={api.shotUrl(currentProject.id, b.shot)} alt="" />
                ) : (
                  <span>—</span>
                )}
              </button>
              <div className={styles.captionField}>
                <span className={styles.captionTime}>{formatTimestamp(b.t)}</span>
                <input
                  type="text"
                  className={styles.captionInput}
                  placeholder="Add a caption…"
                  value={drafts[b.id] ?? ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [b.id]: e.target.value }))}
                />
              </div>
            </li>
          ))}
        </ul>
        <div className={styles.cardActions}>
          <button type="button" className={styles.secondaryButton} onClick={handleCaptionSkip} disabled={savingCaptions}>
            Skip
          </button>
          <button type="button" className={styles.primaryButton} onClick={() => void handleCaptionSave()} disabled={savingCaptions} aria-busy={savingCaptions}>
            {savingCaptions && <span className={styles.buttonSpinner} aria-hidden="true" />}
            {savingCaptions ? "Saving…" : "Save & compile"}
          </button>
        </div>
      </ModalShell>

      <ModalShell
        open={compileResult != null}
        onClose={clearCompileResult}
        exitDurationMs={EXIT_DURATION_MS}
        ariaLabel="Compiled study document"
        overlayClassName={styles.overlay}
        cardClassName={styles.previewCard}
      >
        {displayCompileResult && (
          <>
            <div className={styles.previewHeader}>
              <h2 className={styles.cardTitle}>Compiled study document</h2>
              <button type="button" className={styles.closeButton} onClick={clearCompileResult} aria-label="Close">
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className={styles.previewPathRow}>
              <span className={styles.previewPath}>{displayCompileResult.path}</span>
              <button type="button" className={styles.copyIconButton} onClick={() => void handleCopy()} aria-label="Copy markdown" title="Copy markdown">
                <Icon name="copy" size={14} />
              </button>
            </div>
            <div className={styles.previewBody}>
              <MarkdownPreview
                markdown={displayCompileResult.markdown}
                projectId={currentProject.id}
                onSeek={(t) => controller?.seek(t)}
              />
            </div>
            <div className={styles.cardActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => void revealExport(displayCompileResult.path)}>
                Reveal in Finder
              </button>
              <button type="button" className={styles.secondaryButton} onClick={() => void handleCopy()}>
                Copy markdown
              </button>
              <button type="button" className={styles.primaryButton} onClick={clearCompileResult}>
                Done
              </button>
            </div>
          </>
        )}
      </ModalShell>
    </>
  );
}
