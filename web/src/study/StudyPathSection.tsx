// V3-B B3 "Study Path rail tab" (SPEC): a linear, prerequisite-ordered walk
// of the video's typed units — topological order over REQUIRES/
// PROCEDURE_STEP edges, falling back to anchor time order (see
// lib/studyPath.ts's topoSortUnits, fully unit-tested there). Each step
// reuses UnitProposalCard (same generation-slot + attest/edit/dismiss UI as
// the Concepts rail's proposal list) — this component only owns the
// ordering and the "n/m attested" progress line. Explicitly NO graph
// visualization (SPEC: "No graph visualization").
//
// V3-D D2: buildStudyPathSteps (not the bare topoSortUnits) now drives this
// list — it interleaves a lightweight REINFORCE step 2 positions after every
// threshold-flagged unit (SPEC: "repeat slot").
import { useMemo, useState } from "react";
import { useStudyLoopStore } from "../state/store";
import { buildStudyPathSteps } from "../lib/studyPath";
import { UnitProposalCard } from "../concepts/UnitProposalCard";
import { Icon } from "../components/icons";
import { formatTimestamp } from "../lib/time";
import { pickPrompt, promptPoolFor } from "../lib/notationPrompts";
import type { AnalysisUnit } from "../lib/types";
import styles from "./StudyPathSection.module.css";

/** V3-D D2 "REINFORCE step (repeat slot)": a quick recall nudge for the threshold unit 2 positions back — domain-routed prompt (same pool as UnitProposalCard/NotationModal), acknowledged locally (session-only; the underlying unit's own attestation is the durable record). */
function ReinforceStep({ unit }: { unit: AnalysisUnit }): JSX.Element {
  const controller = useStudyLoopStore((s) => s.controller);
  const domain = useStudyLoopStore((s) => s.currentProject?.domain);
  const [acknowledged, setAcknowledged] = useState(false);
  const prompt = useMemo(() => pickPrompt(promptPoolFor(domain)), [unit.id, domain]);
  const t = unit.anchors[0]?.t;

  return (
    <div className={styles.reinforceCard} data-done={acknowledged}>
      <div className={styles.reinforceHead}>
        <Icon name="key" size={13} />
        <span>Reinforce — {unit.label}</span>
        {t != null && (
          <button type="button" className={styles.reinforceSeek} onClick={() => controller?.seek(Math.max(0, t - 3))}>
            {formatTimestamp(t)}
          </button>
        )}
      </div>
      <p className={styles.reinforcePrompt}>{prompt}</p>
      <button type="button" className={styles.reinforceAck} onClick={() => setAcknowledged(true)} disabled={acknowledged}>
        {acknowledged ? "Reinforced" : "Quick recall done"}
      </button>
    </div>
  );
}

export function StudyPathSection(): JSX.Element | null {
  const analysis = useStudyLoopStore((s) => s.analysis);
  const attestations = useStudyLoopStore((s) => s.attestations);

  const units = analysis?.version === 3 ? analysis.units : undefined;
  const edges = analysis?.version === 3 ? (analysis.edges ?? []) : [];

  const steps = useMemo(() => (units && units.length > 0 ? buildStudyPathSteps(units, edges) : []), [units, edges]);

  if (!units || units.length === 0) return null;

  const attestedCount = units.filter((u) => attestations[u.id]?.status === "attested").length;

  return (
    <div className={styles.pane}>
      <div className={styles.progress}>
        {attestedCount} / {units.length} attested
      </div>
      <div className={styles.list}>
        {steps.map((step) =>
          step.kind === "unit" ? (
            <UnitProposalCard key={step.unit.id} unit={step.unit} />
          ) : (
            <ReinforceStep key={step.id} unit={step.afterUnit} />
          )
        )}
      </div>
    </div>
  );
}
