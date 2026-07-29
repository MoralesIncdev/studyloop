// SPEC V2 layout: right rail (~402px) — Transcript panel (collapsible header
// card, per YouTube's own "Show transcript" affordance), Concepts (existing
// ConceptsDock content restyled as rail cards), and the Up-next cabinet
// (V2-B: real `project.related` data, see SPEC "Fast YouTube layer").
import { useEffect, useState, type ReactNode } from "react";
import { useStudyLoopStore } from "../state/store";
import { TranscriptPane } from "../transcript/TranscriptPane";
import { ConceptsDock } from "../concepts/ConceptsDock";
import {
  PearlsSection,
  AiBreakdownSection,
  ThemesSection,
  OthersAnalysisSection,
  isAnalysisVisible,
} from "../concepts/AnalysisSections";
import { formatTimestamp } from "../lib/time";
import { Icon } from "../components/icons";
import type { RelatedVideo, TranscriptSegment } from "../lib/types";
import styles from "./RightRail.module.css";

interface Props {
  segments: TranscriptSegment[];
  transcriptLoading: boolean;
}

/** codex P1-5 "rail composure": persists which single large section (Transcript
 * or Concepts) is open, per project, so re-opening a video restores the same
 * layout instead of always defaulting back. */
const RAIL_SECTION_STORAGE_PREFIX = "studyloop:railSection:";

export type RailSectionId = "transcript" | "concepts";

export function loadStoredRailSection(projectId: string): RailSectionId | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(RAIL_SECTION_STORAGE_PREFIX + projectId);
    if (raw === "transcript" || raw === "concepts") return raw;
    if (raw === "none") return null;
    return null;
  } catch {
    return null;
  }
}

function storeRailSection(projectId: string, section: RailSectionId | null): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RAIL_SECTION_STORAGE_PREFIX + projectId, section ?? "none");
  } catch {
    // Storage can throw in private-browsing/quota-exceeded modes — not worth surfacing.
  }
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
  const projectId = useStudyLoopStore((s) => s.currentProject?.id);

  // codex P1-5: Transcript and Concepts are the two "large" sections — only
  // one is open at a time (default: Transcript open, Concepts collapsed),
  // and the choice is remembered per project.
  const [openSection, setOpenSection] = useState<RailSectionId | null>(
    () => loadStoredRailSection(projectId ?? "") ?? "transcript"
  );

  useEffect(() => {
    if (!projectId) return;
    setOpenSection(loadStoredRailSection(projectId) ?? "transcript");
  }, [projectId]);

  const selectSection = (section: RailSectionId): void => {
    setOpenSection((current) => {
      const next = current === section ? null : section;
      if (projectId) storeRailSection(projectId, next);
      return next;
    });
  };

  const analysisVisible = isAnalysisVisible(analysis);

  return (
    <div className={styles.rail}>
      <RailCard
        title="Transcript"
        defaultExpanded
        expanded={openSection === "transcript"}
        onToggle={() => selectSection("transcript")}
      >
        <div className={styles.transcriptViewport}>
          <TranscriptPane segments={segments} loading={transcriptLoading} />
        </div>
      </RailCard>

      <RailCard
        id="concepts-rail"
        title="Concepts"
        defaultExpanded={false}
        expanded={openSection === "concepts"}
        onToggle={() => selectSection("concepts")}
        headerAction={
          <button
            type="button"
            className={styles.tickerMuteButton}
            onClick={(e) => {
              e.stopPropagation();
              setConceptTickerMuted(!conceptTickerMuted);
            }}
            title={conceptTickerMuted ? "Unmute concept pop-ups" : "Mute concept pop-ups"}
            aria-label={conceptTickerMuted ? "Unmute concept pop-ups" : "Mute concept pop-ups"}
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
              <AiBreakdownSection />
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
