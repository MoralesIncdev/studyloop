// V3-B B3 "Study Path rail tab" (SPEC): a linear, prerequisite-ordered walk
// of the video's typed units — topological order over REQUIRES/
// PROCEDURE_STEP edges, falling back to anchor time order (see
// lib/studyPath.ts's topoSortUnits, fully unit-tested there). Each step
// reuses UnitProposalCard (same generation-slot + attest/edit/dismiss UI as
// the Concepts rail's proposal list) — this component only owns the
// ordering and the "n/m attested" progress line. Explicitly NO graph
// visualization (SPEC: "No graph visualization").
import { useMemo } from "react";
import { useStudyLoopStore } from "../state/store";
import { topoSortUnits } from "../lib/studyPath";
import { UnitProposalCard } from "../concepts/UnitProposalCard";
import styles from "./StudyPathSection.module.css";

export function StudyPathSection(): JSX.Element | null {
  const analysis = useStudyLoopStore((s) => s.analysis);
  const attestations = useStudyLoopStore((s) => s.attestations);

  const units = analysis?.version === 3 ? analysis.units : undefined;
  const edges = analysis?.version === 3 ? (analysis.edges ?? []) : [];

  const ordered = useMemo(() => (units && units.length > 0 ? topoSortUnits(units, edges) : []), [units, edges]);

  if (!units || units.length === 0) return null;

  const attestedCount = units.filter((u) => attestations[u.id]?.status === "attested").length;

  return (
    <div className={styles.pane}>
      <div className={styles.progress}>
        {attestedCount} / {units.length} attested
      </div>
      <div className={styles.list}>
        {ordered.map((unit) => (
          <UnitProposalCard key={unit.id} unit={unit} />
        ))}
      </div>
    </div>
  );
}
