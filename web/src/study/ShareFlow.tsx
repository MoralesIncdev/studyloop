// V2-C "Share bundles" (SPEC): the Share action pill — POST
// /api/projects/:id/export-analysis, then a small modal with "Reveal in
// Finder" + "Copy path" (reuses CompileFlow's overlay/card modal pattern).
import { useStudyLoopStore } from "../state/store";
import styles from "./CompileFlow.module.css";

export function ShareFlow(): JSX.Element | null {
  const currentProject = useStudyLoopStore((s) => s.currentProject);
  const exportingAnalysis = useStudyLoopStore((s) => s.exportingAnalysis);
  const shareResult = useStudyLoopStore((s) => s.shareResult);
  const runExportAnalysis = useStudyLoopStore((s) => s.runExportAnalysis);
  const clearShareResult = useStudyLoopStore((s) => s.clearShareResult);
  const revealExport = useStudyLoopStore((s) => s.revealExport);
  const pushToast = useStudyLoopStore((s) => s.pushToast);

  if (!currentProject) return null;

  const handleCopyPath = async (): Promise<void> => {
    if (!shareResult) return;
    try {
      await navigator.clipboard.writeText(shareResult.path);
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
        onClick={() => void runExportAnalysis()}
        disabled={exportingAnalysis}
        title="Export this project's analysis as a shareable .studyloop.json bundle"
      >
        ↗ {exportingAnalysis ? "Exporting…" : "Share"}
      </button>

      {shareResult && (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Exported analysis bundle">
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Analysis bundle exported</h2>
            <p className={styles.cardSub}>
              Notes, captures, and any AI analysis are bundled into a self-contained{" "}
              <code>.studyloop.json</code> file — never the video itself.
            </p>
            <div className={styles.previewPath}>{shareResult.path}</div>
            <div className={styles.cardActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => void revealExport(shareResult.path)}>
                Reveal in Finder
              </button>
              <button type="button" className={styles.secondaryButton} onClick={() => void handleCopyPath()}>
                Copy path
              </button>
              <button type="button" className={styles.primaryButton} onClick={clearShareResult}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
