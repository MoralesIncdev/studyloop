// Console slice 8 (design/mockups/video-console/BUILD-BRIEF.md): the drill
// pane — the v6 mock's #p-drill over the real <video>, fed by data that
// already exists: V3-D D1 physical_skill overlay fields (triggers /
// failureModes / drillPairing) on the typed units. When the playhead is
// inside a unit that the analysis equipped with drill content, it floats as
// bare rows: trigger → failure check → drill. Park hides it for this unit
// occurrence only, like the concept pane.
import { useMemo, useState, type RefObject } from "react";
import { useStudyLoopStore } from "../state/store";
import { activeUnitAt, drillFor, type DrillContent } from "../lib/activeUnit";
import { formatTimestamp } from "../lib/time";
import { Icon } from "../components/icons";
import { Pane } from "./Pane";
import paneStyles from "./Pane.module.css";
import styles from "./DrillPane.module.css";

interface Props {
  frameRef: RefObject<HTMLDivElement>;
}

export function DrillPane({ frameRef }: Props): JSX.Element | null {
  const analysis = useStudyLoopStore((s) => s.analysis);
  const currentTime = useStudyLoopStore((s) => s.currentTime);
  const projectId = useStudyLoopStore((s) => s.currentProject?.id ?? null);
  const [parkedKey, setParkedKey] = useState<string | null>(null);

  const active = useMemo<{ key: string; t: number; label: string; drill: DrillContent } | null>(() => {
    const hit = activeUnitAt(analysis?.units ?? [], currentTime);
    if (!hit) return null;
    const drill = drillFor(hit.unit);
    if (!drill) return null;
    return { key: `${hit.unit.id}@${hit.t}`, t: hit.t, label: hit.unit.label, drill };
  }, [analysis, currentTime]);

  const editing = useStudyLoopStore((s) => s.consoleEditMode);
  const hidden = !active || parkedKey === active.key;
  if (hidden && !editing) return null;

  return (
    <Pane
      paneId="p-drill"
      projectId={projectId}
      frameRef={frameRef}
      defaultPos={{ fx: 0.04, fy: 0.12 }}
      width={300}
      label={active ? <>DRILL &middot; {formatTimestamp(active.t)}</> : "DRILL"}
      tools={
        !hidden && active ? (
          <button
            type="button"
            className={paneStyles.tool}
            title="Park until the next drillable unit"
            aria-label="Park drill pane"
            onClick={() => setParkedKey(active.key)}
          >
            <Icon name="close" size={11} />
          </button>
        ) : undefined
      }
    >
      {hidden || !active ? (
        <p className={paneStyles.ghostText}>Appears when a unit carries drill content.</p>
      ) : (
        <>
          <div className={styles.label}>{active.label}</div>
          {active.drill.triggers.length > 0 && (
            <p className={styles.row}>
              <b>Trigger:</b> {active.drill.triggers.join("; ")}
            </p>
          )}
          {active.drill.failureModes.length > 0 && (
            <p className={styles.row}>
              <b>Failure check:</b> {active.drill.failureModes.join("; ")}
            </p>
          )}
          {active.drill.drillPairing && (
            <p className={styles.row}>
              <b>Drill:</b> {active.drill.drillPairing}
            </p>
          )}
        </>
      )}
    </Pane>
  );
}
