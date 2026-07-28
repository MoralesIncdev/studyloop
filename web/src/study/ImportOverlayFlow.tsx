// V2-C "Import" (SPEC: "Import-analysis pill (file picker or drop)"). The web
// app drives the {path} import form (see lib/api.ts importAnalysisByPath) —
// a plain text field for the .studyloop.json file's path, since a browser
// file input can't hand the server a filesystem path directly in this
// local-first, no-upload-server architecture. Reuses CompileFlow's modal styling.
import { useState } from "react";
import { useStudyLoopStore } from "../state/store";
import { Icon } from "../components/icons";
import styles from "./CompileFlow.module.css";

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

      {open && (
        <div
          className={styles.overlay}
          data-state="open"
          role="presentation"
          onMouseDown={() => {
            if (!importing) {
              setOpen(false);
              setPath("");
            }
          }}
        >
          <div
            className={styles.card}
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Import analysis"
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
          </div>
        </div>
      )}
    </>
  );
}
