// V2-C "Share bundles" (SPEC): the Share action pill — POST
// /api/projects/:id/export-analysis, then a small modal with "Reveal in
// Finder" + "Copy path" (reuses CompileFlow's overlay/card modal pattern).
// V3-C C6 "Bundle narrative fields" adds a step BEFORE export: a small
// "why this grouping" input per own concept (SPEC: "author-editable in the
// rail before export"), sent as `conceptRationales` on the export call.
import { useEffect, useState } from "react";
import { useStudyLoopStore } from "../state/store";
import { Icon } from "../components/icons";
import { ModalShell } from "../components/ModalShell";
import styles from "./CompileFlow.module.css";

/** Matches --duration-modal (280ms), the card's own CSS exit-animation length. */
const EXIT_DURATION_MS = 280;

export function ShareFlow(): JSX.Element | null {
  const currentProject = useStudyLoopStore((s) => s.currentProject);
  const analysis = useStudyLoopStore((s) => s.analysis);
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

  // V3-C C6: the rationale step's own open/draft state — ephemeral, not
  // persisted anywhere until the export call actually fires (see SPEC C6:
  // entered "in the rail before export", not stored on the concept itself).
  const [rationaleStepOpen, setRationaleStepOpen] = useState(false);
  const [rationaleDrafts, setRationaleDrafts] = useState<Record<string, string>>({});

  if (!currentProject) return null;

  const ownConcepts = analysis?.concepts ?? [];

  const handleShareClick = (): void => {
    // Nothing to annotate — skip straight to export, same as before C6.
    if (ownConcepts.length === 0) {
      void runExportAnalysis();
      return;
    }
    setRationaleDrafts(Object.fromEntries(ownConcepts.map((c) => [c.id, ""])));
    setRationaleStepOpen(true);
  };

  const proceedToExport = (): void => {
    void runExportAnalysis(rationaleDrafts);
  };

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
        onClick={handleShareClick}
        disabled={exportingAnalysis}
        aria-busy={exportingAnalysis}
        title="Export this project's analysis as a shareable .studyloop.json bundle"
      >
        <Icon name="share" size={16} />
        {exportingAnalysis ? "Exporting…" : "Share"}
      </button>

      <ModalShell
        open={rationaleStepOpen}
        onClose={() => setRationaleStepOpen(false)}
        exitDurationMs={EXIT_DURATION_MS}
        ariaLabel="Why this grouping?"
        overlayClassName={styles.overlay}
        cardClassName={styles.card}
        // Skippable, per PEDAGOGY §9 "no mandatory friction" — closing any
        // way (Skip, X, Escape, backdrop click) still proceeds to export
        // once the exit animation finishes, same handoff pattern
        // CompileFlow's synthesis step uses.
        onExited={proceedToExport}
      >
        <header className={styles.header}>
          <h2 className={styles.cardTitle}>Why this grouping?</h2>
          <button type="button" className={styles.closeButton} onClick={() => setRationaleStepOpen(false)} aria-label="Skip and close">
            <Icon name="close" size={18} />
          </button>
        </header>
        <p className={styles.cardSub}>
          Optional — a short note on why you grouped each concept this way. Travels with the bundle as the
          &ldquo;why&rdquo; behind your organization (skippable, per concept).
        </p>
        <ul className={styles.captionList}>
          {ownConcepts.map((concept) => (
            <li key={concept.id} className={styles.captionRow}>
              <div className={styles.captionField}>
                <span className={styles.captionTime}>{concept.title}</span>
                <input
                  type="text"
                  className={styles.captionInput}
                  placeholder="Why this grouping…"
                  value={rationaleDrafts[concept.id] ?? ""}
                  onChange={(e) => setRationaleDrafts((d) => ({ ...d, [concept.id]: e.target.value }))}
                />
              </div>
            </li>
          ))}
        </ul>
        <div className={styles.cardActions}>
          <button type="button" className={styles.secondaryButton} onClick={() => setRationaleStepOpen(false)}>
            Skip
          </button>
          <button type="button" className={styles.primaryButton} onClick={() => setRationaleStepOpen(false)}>
            Continue to export
          </button>
        </div>
      </ModalShell>

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
