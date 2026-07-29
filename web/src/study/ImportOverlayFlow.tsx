// V2-C "Import" (SPEC: "Import-analysis pill (file picker or drop)"). The web
// app drives the {path} import form (see lib/api.ts importAnalysisByPath) —
// a plain text field for the .studyloop.json file's path, since a browser
// file input can't hand the server a filesystem path directly in this
// local-first, no-upload-server architecture. Reuses CompileFlow's modal styling.
import { useState } from "react";
import { useStudyLoopStore } from "../state/store";
import { Icon } from "../components/icons";
import { ModalShell } from "../components/ModalShell";
import styles from "./CompileFlow.module.css";

/** Matches --duration-modal (280ms), the card's own CSS exit-animation length. */
const EXIT_DURATION_MS = 280;

export function ImportOverlayFlow(): JSX.Element | null {
  const currentProject = useStudyLoopStore((s) => s.currentProject);
  const importOverlayByPath = useStudyLoopStore((s) => s.importOverlayByPath);

  const [open, setOpen] = useState(false);
  const [path, setPath] = useState("");
  const [importing, setImporting] = useState(false);

  if (!currentProject) return null;

  const handleImport = async (): Promise<void> => {
    const trimmed = path.trim();
    if (!trimmed) return;
    setImporting(true);
    try {
      await importOverlayByPath(trimmed);
      setOpen(false);
      setPath("");
    } catch {
      // store already toasted the error — keep the modal open so the user can retry/fix the path
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <button type="button" className={styles.compileButton} data-ripple onClick={() => setOpen(true)} title="Import another viewer's analysis bundle">
        <Icon name="download" size={16} />
        Import
      </button>

      <ModalShell
        open={open}
        onClose={() => {
          setOpen(false);
          setPath("");
        }}
        closeDisabled={importing}
        exitDurationMs={EXIT_DURATION_MS}
        ariaLabel="Import analysis"
        overlayClassName={styles.overlay}
        cardClassName={styles.card}
      >
        <header className={styles.header}>
          <h2 className={styles.cardTitle}>Import analysis</h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={() => {
              setOpen(false);
              setPath("");
            }}
            disabled={importing}
            aria-label="Close"
          >
            <Icon name="close" size={18} />
          </button>
        </header>
        <p className={styles.cardSub}>Path to a <code>.studyloop.json</code> bundle exported from another viewer.</p>
        <input
          type="text"
          className={styles.captionInput}
          placeholder="/path/to/bundle.studyloop.json"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleImport();
          }}
          autoFocus
        />
        <div className={styles.cardActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => {
              setOpen(false);
              setPath("");
            }}
            disabled={importing}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => void handleImport()}
            disabled={importing || !path.trim()}
            aria-busy={importing}
          >
            {importing && <span className={styles.buttonSpinner} aria-hidden="true" />}
            {importing ? "Importing…" : "Import"}
          </button>
        </div>
      </ModalShell>
    </>
  );
}
