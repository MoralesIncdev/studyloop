// SPEC V2 layout: right rail (~402px) — Transcript panel (collapsible header
// card, per YouTube's own "Show transcript" affordance), Concepts (existing
// ConceptsDock content restyled as rail cards), and a static Up-next cabinet
// empty state (real related-video data is server work for a later chunk).
import { useState, type ReactNode } from "react";
import { useStudyLoopStore } from "../state/store";
import { TranscriptPane } from "../transcript/TranscriptPane";
import { ConceptsDock } from "../concepts/ConceptsDock";
import type { TranscriptSegment } from "../lib/types";
import styles from "./RightRail.module.css";

interface Props {
  segments: TranscriptSegment[];
  transcriptLoading: boolean;
  isYoutube: boolean;
}

function RailCard({
  id,
  title,
  defaultExpanded,
  headerAction,
  children,
}: {
  id?: string;
  title: string;
  defaultExpanded: boolean;
  headerAction?: ReactNode;
  children: ReactNode;
}): JSX.Element {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <section id={id} className={styles.card}>
      <div className={styles.cardHeaderRow}>
        <button
          type="button"
          className={styles.cardHeader}
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          <span className={styles.cardTitle}>{title}</span>
          <span className={styles.chevron}>{expanded ? "▲" : "▼"}</span>
        </button>
        {headerAction}
      </div>
      {expanded && <div className={styles.cardBody}>{children}</div>}
    </section>
  );
}

export function RightRail({ segments, transcriptLoading, isYoutube }: Props): JSX.Element {
  const conceptTickerMuted = useStudyLoopStore((s) => s.conceptTickerMuted);
  const setConceptTickerMuted = useStudyLoopStore((s) => s.setConceptTickerMuted);

  return (
    <div className={styles.rail}>
      <RailCard title="Transcript" defaultExpanded>
        <div className={styles.transcriptViewport}>
          <TranscriptPane segments={segments} loading={transcriptLoading} />
        </div>
      </RailCard>

      <RailCard
        id="concepts-rail"
        title="Concepts"
        defaultExpanded
        headerAction={
          <button
            type="button"
            className={styles.tickerMuteButton}
            onClick={(e) => {
              e.stopPropagation();
              setConceptTickerMuted(!conceptTickerMuted);
            }}
            title={conceptTickerMuted ? "Unmute concept pop-ups" : "Mute concept pop-ups"}
            aria-pressed={conceptTickerMuted}
          >
            {conceptTickerMuted ? "🔕" : "🔔"}
          </button>
        }
      >
        <div className={styles.conceptsViewport}>
          <ConceptsDock />
        </div>
      </RailCard>

      <section className={styles.card}>
        <div className={styles.cardHeaderStatic}>
          <span className={styles.cardTitle}>Up next</span>
        </div>
        <div className={styles.upNextEmpty}>
          {isYoutube
            ? "Related videos appear for YouTube sources — next build."
            : "Up next is for YouTube sources — this is a local video."}
        </div>
      </section>
    </div>
  );
}
