// Console slice C (mock lines 631-658): the top cabinet — session identity,
// the Scaffold/Pressure sliders, the Watch/Generate/Review modality switch,
// and the real attested/notes counts. PEDAGOGY invariant: real counts only,
// never a score or a streak — see project_video_study_app learnings.
import { useStudyLoopStore } from "../../state/store";
import { formatTimestamp } from "../../lib/time";
import { Icon } from "../../components/icons";
import type { Modality } from "../../state/store";
import styles from "./Cabinets.module.css";

const MODES: { id: Modality; label: string }[] = [
  { id: "watch", label: "Watch" },
  { id: "generate", label: "Generate" },
  { id: "review", label: "Review" },
];

export function SessionCabinet(): JSX.Element {
  const open = useStudyLoopStore((s) => s.openCabinet === "session");
  const closeCabinet = useStudyLoopStore((s) => s.closeCabinet);
  const project = useStudyLoopStore((s) => s.currentProject);
  const duration = useStudyLoopStore((s) => s.duration);
  const scaffold = useStudyLoopStore((s) => s.scaffold);
  const setScaffold = useStudyLoopStore((s) => s.setScaffold);
  const pressure = useStudyLoopStore((s) => s.pressure);
  const setPressure = useStudyLoopStore((s) => s.setPressure);
  const modality = useStudyLoopStore((s) => s.modality);
  const setModality = useStudyLoopStore((s) => s.setModality);
  const unitCount = useStudyLoopStore((s) => s.analysis?.units?.length ?? 0);
  const attestedCount = useStudyLoopStore(
    (s) => Object.values(s.attestations).filter((a) => a.status === "attested").length
  );
  const noteCount = useStudyLoopStore((s) => s.bubbles.length);

  return (
    <aside className={`${styles.panel} ${styles.panelSession} ${open ? styles.open : ""}`} aria-hidden={!open}>
      <div className={styles.sess}>
        <div>
          <div className={styles.sessTitle}>{project?.title ?? ""}</div>
          <div className={styles.sessSub}>{duration > 0 ? formatTimestamp(duration) : "—"}</div>
        </div>
        <label className={styles.scaffold} title="Scaffold: fade the AI layer as your recall improves">
          <span className={styles.smallLabel}>Scaffold</span>
          <input
            type="range"
            min={0}
            max={100}
            value={scaffold}
            onChange={(e) => setScaffold(Number(e.target.value))}
          />
        </label>
        <label className={styles.scaffold} title="Overlay pressure: how much the frame annotations may claim">
          <span className={styles.smallLabel}>Pressure</span>
          <input
            type="range"
            min={0}
            max={100}
            value={pressure}
            onChange={(e) => setPressure(Number(e.target.value))}
          />
        </label>
        <div className={styles.modality} role="group" aria-label="Modality">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={modality === m.id ? styles.modalityOn : undefined}
              aria-pressed={modality === m.id}
              onClick={() => setModality(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className={styles.sessCounts}>
          <div>
            <div className={styles.countN}>
              {attestedCount}
              <span className={styles.countOf}>/{unitCount}</span>
            </div>
            <div className={styles.countLabel}>Attested</div>
          </div>
          <div>
            <div className={styles.countN}>{noteCount}</div>
            <div className={styles.countLabel}>Notes</div>
          </div>
        </div>
        <button type="button" className={`${styles.close} ${styles.sessClose}`} onClick={closeCabinet} aria-label="Close">
          <Icon name="close" size={14} />
        </button>
      </div>
    </aside>
  );
}
