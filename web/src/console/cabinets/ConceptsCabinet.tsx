// Console slice C (mock lines 606-614, 1221-1240 "concepts cabinet built from
// data"): the left cabinet — every concept for the video (lib/conceptCabinet.ts,
// the same doc+AI-breakdown merge ConceptPane/PlayerChrome already build; NOT
// store's `mergedConcepts`, the unrelated cross-project echo-pane source —
// see that lib's own header comment). The row containing the playhead gets
// the live "now" highlight, derived straight from currentTime rather than a
// separate tick interval — React already re-renders this on every sync tick.
import { useMemo } from "react";
import { useStudyLoopStore } from "../../state/store";
import { buildConceptCabinetRows } from "../../lib/conceptCabinet";
import { formatTimestamp } from "../../lib/time";
import { Icon } from "../../components/icons";
import styles from "./Cabinets.module.css";

export function ConceptsCabinet(): JSX.Element {
  const open = useStudyLoopStore((s) => s.openCabinet === "concepts");
  const closeCabinet = useStudyLoopStore((s) => s.closeCabinet);
  const concepts = useStudyLoopStore((s) => s.concepts);
  const analysisConcepts = useStudyLoopStore((s) => s.analysis?.concepts);
  const analysisUnits = useStudyLoopStore((s) => s.analysis?.units);
  const attestations = useStudyLoopStore((s) => s.attestations);
  const duration = useStudyLoopStore((s) => s.duration);
  const currentTime = useStudyLoopStore((s) => s.currentTime);
  const controller = useStudyLoopStore((s) => s.controller);

  const rows = useMemo(
    () => buildConceptCabinetRows(concepts, analysisConcepts, analysisUnits, attestations, duration),
    [concepts, analysisConcepts, analysisUnits, attestations, duration]
  );

  return (
    <aside className={`${styles.panel} ${styles.panelConcepts} ${open ? styles.open : ""}`} aria-hidden={!open}>
      <div className={styles.head}>
        <span className={styles.label}>Concepts &middot; this video</span>
        <button type="button" className={styles.close} onClick={closeCabinet} aria-label="Close">
          <Icon name="close" size={14} />
        </button>
      </div>
      <div className={styles.body}>
        {rows.length === 0 && <p className={styles.empty}>No concepts yet — attach a concept doc or run analysis.</p>}
        {rows.map((row) => {
          const now = currentTime >= row.t && currentTime <= row.end;
          const statusClass =
            row.status === "attested" ? styles.attested : row.status === "proposed" ? styles.proposed : styles.upcoming;
          return (
            <button
              key={row.id}
              type="button"
              className={`${styles.conceptRow} ${statusClass} ${now ? styles.now : ""}`}
              onClick={() => controller?.seek(row.t)}
            >
              <span className={styles.mark}>{row.status === "attested" && <Icon name="check" size={9} />}</span>
              <span>
                <span className={styles.rowName}>{row.title}</span>
                <span className={styles.rowMeta}>
                  <span className={styles.tc}>{formatTimestamp(row.t)}</span>
                  {row.meta && <span className={styles.rowMetaLabel}>{row.meta}</span>}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
