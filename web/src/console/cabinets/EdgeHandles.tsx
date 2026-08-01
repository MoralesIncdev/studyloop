// Console slice C (mock lines 200-213, 596-604): three thin glow-on-hover
// edge tabs directly on the console stage — left opens Concepts, top opens
// Session, right opens Captures. Clicking the handle for the already-open
// cabinet closes it (store.toggleCabinet); Esc also closes (hotkeys.ts).
import { useStudyLoopStore } from "../../state/store";
import styles from "./Cabinets.module.css";

export function EdgeHandles(): JSX.Element {
  const openCabinet = useStudyLoopStore((s) => s.openCabinet);
  const toggleCabinet = useStudyLoopStore((s) => s.toggleCabinet);

  return (
    <>
      <button
        type="button"
        className={`${styles.handle} ${styles.handleLeft}`}
        onClick={() => toggleCabinet("concepts")}
        aria-pressed={openCabinet === "concepts"}
        aria-label="Concepts cabinet"
      >
        <span className={styles.bar} aria-hidden="true" />
        <span className={styles.hint}>Concepts</span>
      </button>
      <button
        type="button"
        className={`${styles.handle} ${styles.handleTop}`}
        onClick={() => toggleCabinet("session")}
        aria-pressed={openCabinet === "session"}
        aria-label="Session cabinet"
      >
        <span className={styles.bar} aria-hidden="true" />
        <span className={styles.hint}>Session</span>
      </button>
      <button
        type="button"
        className={`${styles.handle} ${styles.handleRight}`}
        onClick={() => toggleCabinet("captures")}
        aria-pressed={openCabinet === "captures"}
        aria-label="Captures cabinet"
      >
        <span className={styles.bar} aria-hidden="true" />
        <span className={styles.hint}>Captures</span>
      </button>
    </>
  );
}
