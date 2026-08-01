// Console slice 8 (design/mockups/video-console/BUILD-BRIEF.md): the "active
// concept" pane — the v6 mock's #p-concept over the real <video>. Bare text
// (title + body snippet) floats over the footage; the shared Pane shell owns
// drag/persist/chrome. The park tool hides the pane for the CURRENT concept
// only — the next concept re-materializes it (the mock's park-to-tick,
// minus the flight animation; the concept's seek-bar tick is already there).
import { useMemo, useState, type RefObject } from "react";
import { useStudyLoopStore } from "../state/store";
import { analysisConceptToConceptCard } from "../lib/analysisFormat";
import { activeConceptAt } from "../lib/activeConcept";
import { formatTimestamp } from "../lib/time";
import type { ConceptCard } from "../lib/types";
import { Icon } from "../components/icons";
import { Pane } from "./Pane";
import paneStyles from "./Pane.module.css";
import styles from "./ConceptPane.module.css";

const BODY_PREVIEW_CHARS = 140;

interface Props {
  frameRef: RefObject<HTMLDivElement>;
}

function bodyPreview(body: string): string {
  const trimmed = body.trim();
  if (trimmed.length <= BODY_PREVIEW_CHARS) return trimmed;
  return `${trimmed.slice(0, BODY_PREVIEW_CHARS).trimEnd()}…`;
}

export function ConceptPane({ frameRef }: Props): JSX.Element | null {
  const concepts = useStudyLoopStore((s) => s.concepts);
  const analysis = useStudyLoopStore((s) => s.analysis);
  const currentTime = useStudyLoopStore((s) => s.currentTime);
  const projectId = useStudyLoopStore((s) => s.currentProject?.id ?? null);
  // The parked key ("<conceptId>@<anchorT>") — parking is per concept
  // occurrence, so the pane stays gone for this one and returns for the next.
  const [parkedKey, setParkedKey] = useState<string | null>(null);

  const tickerConcepts = useMemo<ConceptCard[]>(
    () => [...concepts, ...(analysis?.concepts.map(analysisConceptToConceptCard) ?? [])],
    [concepts, analysis]
  );

  const active = useMemo(() => activeConceptAt(tickerConcepts, currentTime), [tickerConcepts, currentTime]);
  // Edit mode materializes the pane even with nothing to show (ElvUI's rule:
  // hidden-until-triggered UI must exist while you're arranging it).
  const editing = useStudyLoopStore((s) => s.consoleEditMode);

  const key = active ? `${active.card.id}@${active.t}` : null;
  const hidden = !active || parkedKey === key;
  if (hidden && !editing) return null;

  return (
    <Pane
      paneId="p-concept"
      projectId={projectId}
      frameRef={frameRef}
      defaultPos={{ fx: 0.62, fy: 0.12 }}
      label={active ? <>CONCEPT &middot; {formatTimestamp(active.t)}</> : "CONCEPT"}
      tools={
        !hidden && key ? (
          <button
            type="button"
            className={paneStyles.tool}
            title="Park until the next concept"
            aria-label="Park pane until the next concept"
            onClick={() => setParkedKey(key)}
          >
            <Icon name="close" size={11} />
          </button>
        ) : undefined
      }
    >
      {hidden || !active ? (
        <p className={paneStyles.ghostText}>Appears while a concept is being taught.</p>
      ) : (
        <>
          <div className={styles.title}>{active.card.title}</div>
          <p className={styles.body}>{bodyPreview(active.card.body)}</p>
        </>
      )}
    </Pane>
  );
}
