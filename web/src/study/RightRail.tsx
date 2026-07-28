// SPEC V2 layout: right rail (~402px) — Transcript panel (collapsible header
// card, per YouTube's own "Show transcript" affordance), Concepts (existing
// ConceptsDock content restyled as rail cards), and the Up-next cabinet
// (V2-B: real `project.related` data, see SPEC "Fast YouTube layer").
import { useState, type ReactNode } from "react";
import { useStudyLoopStore } from "../state/store";
import { TranscriptPane } from "../transcript/TranscriptPane";
import { ConceptsDock } from "../concepts/ConceptsDock";
import { formatTimestamp } from "../lib/time";
import type { RelatedVideo, TranscriptSegment } from "../lib/types";
import styles from "./RightRail.module.css";

interface Props {
  segments: TranscriptSegment[];
  transcriptLoading: boolean;
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

function UpNextCard({ video, onOpen, opening }: { video: RelatedVideo; onOpen: () => void; opening: boolean }): JSX.Element {
  return (
    <button type="button" className={styles.upNextCard} onClick={onOpen} disabled={opening}>
      <span className={styles.upNextThumb}>
        {video.thumbnailUrl ? (
          <img src={video.thumbnailUrl} alt="" className={styles.upNextThumbImg} loading="lazy" />
        ) : (
          <span className={styles.upNextThumbGlyph} aria-hidden="true">
            ▶
          </span>
        )}
        {video.durationSeconds != null && (
          <span className={styles.upNextDuration}>{formatTimestamp(video.durationSeconds)}</span>
        )}
        {opening && <span className={styles.upNextOverlay}>Opening…</span>}
      </span>
      <span className={styles.upNextBody}>
        <span className={styles.upNextTitle}>{video.title}</span>
        <span className={styles.upNextAuthor}>{video.author}</span>
        {video.viewCountText && <span className={styles.upNextViews}>{video.viewCountText}</span>}
      </span>
    </button>
  );
}

function UpNextCabinet(): JSX.Element | null {
  const currentProject = useStudyLoopStore((s) => s.currentProject);
  const openOrCreateYoutubeProject = useStudyLoopStore((s) => s.openOrCreateYoutubeProject);
  const refreshRelated = useStudyLoopStore((s) => s.refreshRelated);
  const navigate = useStudyLoopStore((s) => s.navigate);
  const [refreshing, setRefreshing] = useState(false);
  const [openingVideoId, setOpeningVideoId] = useState<string | null>(null);

  // SPEC: "Local videos: section hidden entirely (no dead space)" — this is
  // stricter than the V2-A placeholder, which rendered an explanation card
  // for local sources too. A youtube source with no related yet (fresh
  // resolve, or Innertube came back empty) still renders the card shell so
  // the refresh button and empty state are reachable.
  if (!currentProject || currentProject.source.type !== "youtube") return null;

  const related = currentProject.related ?? [];

  const handleOpen = async (video: RelatedVideo): Promise<void> => {
    setOpeningVideoId(video.videoId);
    try {
      const project = await openOrCreateYoutubeProject(video.videoId);
      navigate({ view: "study", projectId: project.id });
    } catch {
      // store already toasted the error
    } finally {
      setOpeningVideoId(null);
    }
  };

  const handleRefresh = async (): Promise<void> => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refreshRelated();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <section className={styles.card}>
      <div className={styles.cardHeaderRow}>
        <div className={styles.cardHeaderStatic}>
          <span className={styles.cardTitle}>Up next</span>
        </div>
        <button
          type="button"
          className={styles.tickerMuteButton}
          onClick={() => void handleRefresh()}
          disabled={refreshing}
          title="Refresh related videos"
          aria-label="Refresh related videos"
        >
          {refreshing ? "…" : "⟳"}
        </button>
      </div>
      {related.length === 0 ? (
        <div className={styles.upNextEmpty}>
          No related videos yet — try the refresh button, or Innertube may be unreachable right now.
        </div>
      ) : (
        <div className={styles.upNextList}>
          {related.map((video) => (
            <UpNextCard
              key={video.videoId}
              video={video}
              opening={openingVideoId === video.videoId}
              onOpen={() => void handleOpen(video)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function RightRail({ segments, transcriptLoading }: Props): JSX.Element {
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

      <UpNextCabinet />
    </div>
  );
}
