// SPEC V2 layout: right rail (~402px) — Transcript panel (collapsible header
// card, per YouTube's own "Show transcript" affordance), Concepts (existing
// ConceptsDock content restyled as rail cards), and the Up-next cabinet
// (V2-B: real `project.related` data, see SPEC "Fast YouTube layer").
//
// V3-A A1 "state-aware surface purge": the Transcript/Concepts accordion
// choice itself now lives in the store (`railOpenSection`, moved out of local
// component state) so CCOverlay — a sibling under StudyView, not a rail
// descendant — can read "is the transcript expanded" for the CC/transcript
// redundancy rule. During playbackFocus (and no user override), the
// Transcript card is visually forced collapsed on top of whatever the user's
// persisted preference is; Concepts is never purged.
import { useState, type ReactNode } from "react";
import { useStudyLoopStore, type RailSectionId } from "../state/store";
import { TranscriptPane } from "../transcript/TranscriptPane";
import { ConceptsDock } from "../concepts/ConceptsDock";
import {
  PearlsSection,
  AiBreakdownSection,
  UnitsProposalsSection,
  ThemesSection,
  OthersAnalysisSection,
  isAnalysisVisible,
} from "../concepts/AnalysisSections";
import { StudyPathSection } from "./StudyPathSection";
import { isTranscriptVisuallyOpen } from "../lib/selectors";
import { formatTimestamp } from "../lib/time";
import { Icon } from "../components/icons";
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
  expanded: controlledExpanded,
  onToggle,
  headerAction,
  children,
}: {
  id?: string;
  title: string;
  defaultExpanded: boolean;
  /** When provided (with `onToggle`), the card is controlled by the parent — used for the Transcript/Concepts accordion. */
  expanded?: boolean;
  onToggle?: () => void;
  headerAction?: ReactNode;
  children: ReactNode;
}): JSX.Element {
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState(defaultExpanded);
  const expanded = controlledExpanded ?? uncontrolledExpanded;
  const toggle = onToggle ?? (() => setUncontrolledExpanded((v) => !v));
  return (
    <section id={id} className={styles.card}>
      <div className={styles.cardHeaderRow}>
        <button
          type="button"
          className={styles.cardHeader}
          onClick={toggle}
          aria-expanded={expanded}
        >
          <span className={styles.cardTitle}>{title}</span>
          <span className={styles.chevron} data-open={expanded}>
            <Icon name="chevronDown" size={16} />
          </span>
        </button>
        {headerAction}
      </div>
      <div className={styles.expandRegion} data-open={expanded}>
        <div className={styles.expandInner}>
          <div className={styles.cardBody}>{children}</div>
        </div>
      </div>
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
            <Icon name="play" size={22} />
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
          className={`${styles.tickerMuteButton} ${refreshing ? styles.spinning : ""}`}
          onClick={() => void handleRefresh()}
          disabled={refreshing}
          title="Refresh related videos"
          aria-label="Refresh related videos"
        >
          <Icon name="refresh" size={16} />
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
  const analysis = useStudyLoopStore((s) => s.analysis);
  const railOpenSection = useStudyLoopStore((s) => s.railOpenSection);
  const setRailOpenSection = useStudyLoopStore((s) => s.setRailOpenSection);
  const isPlaying = useStudyLoopStore((s) => s.isPlaying);
  const playbackFocus = useStudyLoopStore((s) => s.playbackFocus);
  const focusOverride = useStudyLoopStore((s) => s.focusOverride);
  const setFocusOverride = useStudyLoopStore((s) => s.setFocusOverride);

  // V3-A A1: the purge visually forces Transcript collapsed on top of the
  // user's persisted `railOpenSection` — Concepts is never purged. Shared
  // with CCOverlay.tsx (lib/selectors.ts) so both agree on what "expanded"
  // means (V3-A review finding #2).
  const transcriptVisuallyOpen = isTranscriptVisuallyOpen(railOpenSection, playbackFocus, focusOverride);
  const conceptsVisuallyOpen = railOpenSection === "concepts";

  // codex P1-5: Transcript and Concepts are the two "large" sections — only
  // one is open at a time, and the choice is remembered per project. Toggling
  // is based on the *visually rendered* open state (accounting for the
  // purge), not the raw stored preference — otherwise clicking a
  // purge-collapsed Transcript header while `railOpenSection` still says
  // "transcript" internally would toggle it further shut instead of
  // re-opening it. Any manual toggle while playing sets focusOverride
  // (A1 "the user always wins"), suspending the purge for the rest of this
  // playing stretch.
  const selectSection = (section: RailSectionId, currentlyVisuallyOpen: boolean): void => {
    if (isPlaying) setFocusOverride();
    setRailOpenSection(currentlyVisuallyOpen ? null : section);
  };

  const analysisVisible = isAnalysisVisible(analysis);
  // V3-B B1: v3's typed units replace the flat AI-breakdown concept list
  // with attestable proposals (UnitsProposalsSection) — v2 analyses (or
  // none at all) keep the pre-existing AiBreakdownSection unchanged.
  const isV3 = analysis?.version === 3 && !!analysis.units;
  // V3-B B3: the Path rail tab only exists once there's a typed spine to
  // walk — hidden entirely for v2/no-analysis projects (no dead-end tab).
  const hasPath = isV3 && (analysis!.units?.length ?? 0) > 0;
  const pathVisuallyOpen = railOpenSection === "path";

  return (
    <div className={styles.rail}>
      <RailCard
        title="Transcript"
        defaultExpanded
        expanded={transcriptVisuallyOpen}
        onToggle={() => selectSection("transcript", transcriptVisuallyOpen)}
      >
        <div className={styles.transcriptViewport}>
          <TranscriptPane segments={segments} loading={transcriptLoading} />
        </div>
      </RailCard>

      <RailCard
        id="concepts-rail"
        title="Concepts"
        defaultExpanded={false}
        expanded={conceptsVisuallyOpen}
        onToggle={() => selectSection("concepts", conceptsVisuallyOpen)}
        headerAction={
          <button
            type="button"
            className={styles.tickerMuteButton}
            onClick={(e) => {
              e.stopPropagation();
              setConceptTickerMuted(!conceptTickerMuted);
            }}
            title={conceptTickerMuted ? "Unmute concept chips" : "Mute concept chips"}
            aria-label={conceptTickerMuted ? "Unmute concept chips" : "Mute concept chips"}
            aria-pressed={conceptTickerMuted}
          >
            <Icon name={conceptTickerMuted ? "notificationsOff" : "notifications"} size={16} />
          </button>
        }
      >
        <div className={styles.conceptsViewport}>
          {analysisVisible ? (
            <>
              <PearlsSection />
              <ConceptsDock />
              {isV3 ? <UnitsProposalsSection /> : <AiBreakdownSection />}
              <ThemesSection />
            </>
          ) : (
            <>
              <p className={styles.analysisEmptyState}>Run analysis to generate insights.</p>
              <ConceptsDock />
            </>
          )}
        </div>
      </RailCard>

      {hasPath && (
        <RailCard
          id="path-rail"
          title="Path"
          defaultExpanded={false}
          expanded={pathVisuallyOpen}
          onToggle={() => selectSection("path", pathVisuallyOpen)}
        >
          <div className={styles.conceptsViewport}>
            <StudyPathSection />
          </div>
        </RailCard>
      )}

      <OthersAnalysisCard />

      <UpNextCabinet />
    </div>
  );
}

/** Only renders a card shell at all once there's an overlay to show — otherwise an empty "Others' analysis" header with nothing under it. */
function OthersAnalysisCard(): JSX.Element | null {
  const overlays = useStudyLoopStore((s) => s.overlays);
  const overlaysVisible = useStudyLoopStore((s) => s.overlaysVisible);
  if (!overlaysVisible || overlays.length === 0) return null;
  return (
    <RailCard title="Others' analysis" defaultExpanded>
      <OthersAnalysisSection />
    </RailCard>
  );
}
