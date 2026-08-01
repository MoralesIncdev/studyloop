// Console slice C (mock lines 616-629): the right cabinet — reverse-chron
// mined captures + pinned notes for this sitting, all sourced from
// store.bubbles (NotePane's pinQuickNote, mineMoment/captureScreenshotOnly,
// and the notation modal all funnel into the same bubbles array — see
// lib/captureCabinet.ts for the mined/screenshot-only classification).
import { useMemo } from "react";
import { useStudyLoopStore } from "../../state/store";
import { buildCaptureCabinetRows } from "../../lib/captureCabinet";
import { formatTimestamp } from "../../lib/time";
import { Icon } from "../../components/icons";
import styles from "./Cabinets.module.css";

const SEEK_BACK_SECONDS = 5;

export function CapturesCabinet(): JSX.Element {
  const open = useStudyLoopStore((s) => s.openCabinet === "captures");
  const closeCabinet = useStudyLoopStore((s) => s.closeCabinet);
  const bubbles = useStudyLoopStore((s) => s.bubbles);
  const controller = useStudyLoopStore((s) => s.controller);

  const rows = useMemo(() => buildCaptureCabinetRows(bubbles), [bubbles]);

  return (
    <aside className={`${styles.panel} ${styles.panelCaptures} ${open ? styles.open : ""}`} aria-hidden={!open}>
      <div className={styles.head}>
        <span className={styles.label}>Capture &middot; this sitting</span>
        <button type="button" className={styles.close} onClick={closeCabinet} aria-label="Close">
          <Icon name="close" size={14} />
        </button>
      </div>
      <div className={styles.body}>
        {rows.length === 0 && <p className={styles.empty}>No captures yet — M mines the moment, S grabs a screenshot.</p>}
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            className={`${styles.capItem} ${row.screenshotOnly ? styles.capShot : ""}`}
            onClick={() => controller?.seek(Math.max(0, row.t - SEEK_BACK_SECONDS))}
          >
            <span className={styles.tc}>{formatTimestamp(row.t)}</span>
            <p>{row.screenshotOnly ? "frame capture" : row.text || "(empty note)"}</p>
          </button>
        ))}
      </div>
    </aside>
  );
}
