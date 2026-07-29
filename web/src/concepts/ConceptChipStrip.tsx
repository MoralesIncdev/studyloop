// V3-A A4 "Concept ticker demotion": replaces the old slide-over ticker
// (ConceptCard stack over the video) with a slim chip row directly below the
// player — signaling, not decoration (PEDAGOGY §4). Reuses the same
// activeConcepts([anchor, anchor+90s]) selector the old ticker used. Chips
// fade in/out with the active window; clicking one opens the Concepts rail
// section with that card highlighted (no seek — full card on demand).
// Empty strip renders nothing at all (zero height, no dead space). The
// existing ticker-mute toggle (RightRail's Concepts header button) now
// gates this strip instead of the old ticker.
import { useMemo } from "react";
import { useStudyLoopStore } from "../state/store";
import { activeConcepts } from "../lib/selectors";
import { selectConceptChips } from "../lib/conceptChips";
import { analysisConceptToConceptCard } from "../lib/analysisFormat";
import styles from "./ConceptChipStrip.module.css";

const MAX_VISIBLE = 2;

function scrollToConceptsRail(): void {
  document.getElementById("concepts-rail")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

export function ConceptChipStrip(): JSX.Element | null {
  const concepts = useStudyLoopStore((s) => s.concepts);
  const analysis = useStudyLoopStore((s) => s.analysis);
  const currentTime = useStudyLoopStore((s) => s.currentTime);
  const muted = useStudyLoopStore((s) => s.conceptTickerMuted);
  const focusConceptInRail = useStudyLoopStore((s) => s.focusConceptInRail);

  // V2-C: AI-breakdown concepts join the same active-window pool doc
  // concepts use (SPEC: "anchored ones join the ticker windows like doc concepts").
  const allConcepts = useMemo(
    () => [...concepts, ...(analysis?.concepts.map(analysisConceptToConceptCard) ?? [])],
    [concepts, analysis]
  );
  const active = useMemo(() => activeConcepts(allConcepts, currentTime), [allConcepts, currentTime]);

  if (muted || active.length === 0) return null;

  const { visible, overflowCount } = selectConceptChips(active, MAX_VISIBLE);

  const openCard = (conceptId: string): void => {
    focusConceptInRail(conceptId);
    scrollToConceptsRail();
  };
  const openOverflow = (): void => {
    focusConceptInRail();
    scrollToConceptsRail();
  };

  return (
    <div className={styles.strip} role="list" aria-label="Active concepts">
      {visible.map((entry) => (
        <button
          key={entry.card.id}
          type="button"
          role="listitem"
          className={styles.chip}
          onClick={() => openCard(entry.card.id)}
          title={entry.card.title}
        >
          {entry.card.title}
        </button>
      ))}
      {overflowCount > 0 && (
        <button type="button" className={styles.overflowChip} onClick={openOverflow}>
          +{overflowCount}
        </button>
      )}
    </div>
  );
}
