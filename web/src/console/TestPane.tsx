// Console slice D item 4 (mock's #p-test, index.html lines 510-536 +
// 1142-1151): the blur-to-reveal self-test pane. It surfaces the active
// PROPOSED unit — the same activeUnitAt source DrillPane keys off, filtered
// to units neither attested nor dismissed — as prompt (unit label) + sealed
// answer (unit body). Attempt opens the inline input; Reveal stores the
// attempt through the existing attestation flow (store.saveUnitTake, exactly
// what UnitProposalCard's "your take" + Reveal calls — no parallel path) and
// unseals the answer. In Generate modality the pane re-centers (Pane.module.css's
// :global(.generate) rule) and auto-starts the attempt (mock's setMode,
// line 1204); with no unit under the playhead, Generate falls back to the
// latest still-proposed unit so the spotlight never lands on an empty pane.
import { useEffect, useMemo, useState, type RefObject } from "react";
import { useStudyLoopStore } from "../state/store";
import { activeUnitAt } from "../lib/activeUnit";
import { formatTimestamp } from "../lib/time";
import type { AnalysisUnit } from "../lib/types";
import { Pane } from "./Pane";
import paneStyles from "./Pane.module.css";
import styles from "./TestPane.module.css";

interface Props {
  frameRef: RefObject<HTMLDivElement>;
}

function isProposed(unit: AnalysisUnit, attestations: ReturnType<typeof useStudyLoopStore.getState>["attestations"]): boolean {
  const status = attestations[unit.id]?.status;
  return status !== "attested" && status !== "dismissed";
}

export function TestPane({ frameRef }: Props): JSX.Element | null {
  const analysis = useStudyLoopStore((s) => s.analysis);
  const attestations = useStudyLoopStore((s) => s.attestations);
  const currentTime = useStudyLoopStore((s) => s.currentTime);
  const projectId = useStudyLoopStore((s) => s.currentProject?.id ?? null);
  const modality = useStudyLoopStore((s) => s.modality);
  const editing = useStudyLoopStore((s) => s.consoleEditMode);
  const saveUnitTake = useStudyLoopStore((s) => s.saveUnitTake);

  const active = useMemo(() => {
    const units = analysis?.units ?? [];
    const hit = activeUnitAt(units, currentTime);
    if (hit && isProposed(hit.unit, attestations)) return { unit: hit.unit, t: hit.t };
    if (modality === "generate") {
      const fallback = units
        .filter((u) => isProposed(u, attestations) && u.anchors.length > 0)
        .sort((a, b) => b.anchors[0].t - a.anchors[0].t)[0];
      if (fallback) return { unit: fallback, t: fallback.anchors[0].t };
    }
    return null;
  }, [analysis, attestations, currentTime, modality]);

  const unitId = active?.unit.id ?? null;
  const entry = useStudyLoopStore((s) => (unitId ? s.attestations[unitId] : undefined));
  const [attempting, setAttempting] = useState(false);
  const [attempt, setAttempt] = useState("");
  const [revealed, setRevealed] = useState(false);

  // A new unit resets the flow — a take already saved for it (UnitProposalCard
  // shares the same store field) starts revealed, mirroring the card's rule.
  useEffect(() => {
    setAttempt("");
    setRevealed(Boolean(entry?.userTake?.trim()));
    setAttempting(modality === "generate" && unitId != null && !entry?.userTake?.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId]);

  // Generate modality auto-starts the attempt (mock line 1204: startAttempt()).
  useEffect(() => {
    if (modality === "generate" && unitId != null && !revealed) setAttempting(true);
  }, [modality, unitId, revealed]);

  const hidden = !active;
  if (hidden && !editing) return null;

  const handleReveal = (): void => {
    if (!active) return;
    const trimmed = attempt.trim();
    // Same call UnitProposalCard's Reveal makes — the attempt persists as the
    // unit's "your take" without formally attesting.
    if (trimmed) void saveUnitTake(active.unit.id, trimmed);
    setRevealed(true);
    setAttempting(false);
  };

  return (
    <Pane
      paneId="p-test"
      dataPane="test"
      projectId={projectId}
      frameRef={frameRef}
      defaultPos={{ fx: 0.36, fy: 0.58 }}
      width={260}
      defaultMode="glassy"
      chipStatus="proposed"
      label={active ? <>SELF-TEST &middot; {formatTimestamp(active.t)}</> : "SELF-TEST"}
    >
      {hidden || !active ? (
        <p className={paneStyles.ghostText}>Appears while a proposed unit awaits your attempt.</p>
      ) : (
        <>
          <p className={styles.prompt}>{active.unit.label}</p>
          <div className={`${styles.sealed} ${revealed ? styles.revealed : ""}`}>
            <p className={styles.answer}>{entry?.userBody?.trim() || active.unit.body}</p>
            <span className={styles.sealLabel}>Sealed · attempt first</span>
          </div>
          {attempting && !revealed && (
            <div className={styles.attemptRow}>
              <input
                className={styles.attemptInput}
                value={attempt}
                placeholder="Your answer, in your own words…"
                onChange={(e) => setAttempt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleReveal();
                }}
                // Generate modality is an explicit self-test mode; focus belongs here (mock line 1146).
                autoFocus
              />
              <button type="button" className={styles.button} onClick={handleReveal}>
                Reveal
              </button>
            </div>
          )}
          {!attempting && !revealed && (
            <div className={styles.attemptButtonRow}>
              <button type="button" className={styles.button} onClick={() => setAttempting(true)}>
                Attempt
              </button>
            </div>
          )}
        </>
      )}
    </Pane>
  );
}
