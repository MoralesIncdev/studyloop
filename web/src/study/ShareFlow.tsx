// V2-C "Share bundles" (SPEC): the Share action pill — POST
// /api/projects/:id/export-analysis, then a small modal with "Reveal in
// Finder" + "Copy path" (reuses CompileFlow's overlay/card modal pattern).
import { useEffect, useState } from "react";
import { useStudyLoopStore } from "../state/store";
import { Icon } from "../components/icons";
import { ModalShell } from "../components/ModalShell";
import styles from "./CompileFlow.module.css";

/** Matches --duration-modal (280ms), the card's own CSS exit-animation length. */
const EXIT_DURATION_MS = 280;

export function ShareFlow(): JSX.Element | null {
  const currentProject = useStudyLoopStore((s) => s.currentProject);
  const exportingAnalysis = useStudyLoopStore((s) => s.exportingAnalysis);
  const shareResult = useStudyLoopStore((s) => s.shareResult);
  const runExportAnalysis = useStudyLoopStore((s) => s.runExportAnalysis);
  const clearShareResult = useStudyLoopStore((s) => s.clearShareResult);
  const revealExport = useStudyLoopStore((s) => s.revealExport);
  const pushToast = useStudyLoopStore((s) => s.pushToast);

  // codex P0-3: keep the last result around through the exit animation (the
  // store nulls shareResult synchronously on close).
  const [displayShareResult, setDisplayShareResult] = useState(shareResult);
  useEffect(() => {
    if (shareResult) setDisplayShareResult(shareResult);
  }, [shareResult]);

  if (!currentProject) return null;

  const handleCopyPath = async (): Promise<void> => {
    if (!displayShareResult) return;
    try {
      await navigator.clipboard.writeText(displayShareResult.path);
      pushToast("Copied path to clipboard", "success");
    } catch {
      pushToast("Could not copy to clipboard — your browser may be blocking clipboard access", "error");
    }
  };

  return (
    <>
      <button
        type="button"
        className={styles.compileButton}
        data-ripple
        onClick={() => void runExportAnalysis()}
        disabled={exportingAnalysis}
        aria-busy={exportingAnalysis}
        title="Export this project's analysis as a shareable .studyloop.json bundle"
      >
        <Icon name="share" size={16} />
        {exportingAnalysis ? "Exporting…" : "Share"}
      </button>

      <ModalShell
        open={shareResult != null}
        onClose={clearShareResult}
        exitDurationMs={EXIT_DURATION_MS}
        ariaLabel="Exported analysis bundle"
        overlayClassName={styles.overlay}
        cardClassName={styles.card}
      >
        {displayShareResult && (
          <>
            <header className={styles.header}>
              <h2 className={styles.cardTitle}>Analysis bundle exported</h2>
              <button type="button" className={styles.closeButton} onClick={clearShareResult} aria-label="Close">
                <Icon name="close" size={18} />
              </button>
            </header>
            <p className={styles.cardSub}>
              Notes, captures, and any AI analysis are bundled into a self-contained{" "}
              <code>.studyloop.json</code> file — never the video itself.
            </p>
            <div className={styles.previewPathRow}>
              <span className={styles.previewPath}>{displayShareResult.path}</span>
              <button type="button" className={styles.copyIconButton} onClick={() => void handleCopyPath()} aria-label="Copy path" title="Copy path">
                <Icon name="copy" size={14} />
              </button>
            </div>
            <div className={styles.cardActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => void revealExport(displayShareResult.path)}>
                Reveal in Finder
              </button>
              <button type="button" className={styles.secondaryButton} onClick={() => void handleCopyPath()}>
                Copy path
              </button>
              <button type="button" className={styles.primaryButton} onClick={clearShareResult}>
                Done
              </button>
            </div>
          </>
        )}
      </ModalShell>
    </>
  );
}
