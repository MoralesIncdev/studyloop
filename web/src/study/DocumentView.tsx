// Phase 8 "Document mode" (design/EXECUTION-PLAN-post-review-v1.md): the
// read-and-claim document surface — a scrollable, transcript-ordered list of
// the project's units, each rendered through the exact same
// concepts/UnitProposalCard.tsx used by the Study Path rail (lib/
// studyPath.ts's topo order) and the Concepts rail. Same reveal-gate/
// generation-slot/attest/dismiss/safety-quote/cluster-member behavior as
// everywhere else — the binding design intent (adjudication discussion) is
// that document mode is read-and-CLAIM, not read-and-annotate: these are
// deliberately unfinished prenotes the learner attests via the existing
// attest gesture, never a finished study guide to passively read. No new
// pedagogy mechanic lives in this file — it owns transcript ordering,
// chapter grouping, and the progress line only; every interactive behavior
// is UnitProposalCard's, unchanged.
import { useMemo } from "react";
import { useStudyLoopStore } from "../state/store";
import { groupUnitsIntoChapters, orderUnitsForDocument } from "../lib/documentOrder";
import { UnitProposalCard } from "../concepts/UnitProposalCard";
import styles from "./DocumentView.module.css";

export function DocumentView(): JSX.Element | null {
  const currentProject = useStudyLoopStore((s) => s.currentProject);
  const analysis = useStudyLoopStore((s) => s.analysis);
  const attestations = useStudyLoopStore((s) => s.attestations);

  const units = analysis?.version === 3 ? analysis.units : undefined;

  const chapters = useMemo(() => {
    if (!units || units.length === 0) return [];
    // No chapter data model exists in this codebase yet (see
    // lib/documentOrder.ts's ChapterMarker comment) — every call omits the
    // `chapters` argument, so this always returns one untitled group: the
    // "otherwise plain ordered flow" branch of SPEC item 1.
    return groupUnitsIntoChapters(orderUnitsForDocument(units));
  }, [units]);

  if (!currentProject) return null;

  if (!units || units.length === 0) {
    return (
      <div className={styles.wrap} role="region" aria-label="Document">
        <p className={styles.empty}>
          {analysis ? "No typed units in this analysis yet." : "Run analysis to build this project's document."}
        </p>
      </div>
    );
  }

  const attestedCount = units.filter((u) => attestations[u.id]?.status === "attested").length;
  // Mirrors StudyPathSection.tsx's own restated/claimed split (Phase 3
  // "Integrity fixes") — computed the same client-side way, no new endpoint.
  const restatedCount = units.filter(
    (u) => attestations[u.id]?.status === "attested" && Boolean(attestations[u.id]?.userTake?.trim())
  ).length;
  const claimedCount = attestedCount - restatedCount;

  return (
    <div className={styles.wrap} role="region" aria-label="Document">
      <div className={styles.progress}>
        {attestedCount} / {units.length} attested
        {claimedCount > 0 && ` · ${restatedCount} restated · ${claimedCount} claimed`}
      </div>
      <div className={styles.doc}>
        {chapters.map((chapter, i) => (
          <section key={chapter.title ?? `flow-${i}`} className={styles.chapter}>
            {chapter.title && <h2 className={styles.chapterTitle}>{chapter.title}</h2>}
            <div className={styles.list}>
              {chapter.units.map((unit) => (
                <UnitProposalCard key={unit.id} unit={unit} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
