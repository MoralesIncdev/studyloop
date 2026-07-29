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
import type { ContinuityCandidate, TranscriptSegment } from "../lib/types";
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

// V3-C C1 "Concept Continuity rail" (SPEC/PEDAGOGY.md §6): replaces the raw
// youtube-related-list "Up next" cabinet — candidates now come from
// GET /api/projects/:id/continuity (server/src/lib/continuity.ts's weighted
// scorer), each with human-readable `reasons` rendered as chips ("teaches
// closed guard", "channel ranks for 3 of your topics") so the learner sees
// *why* a video is suggested, never just "YouTube thinks you'll watch this".
function ContinuityCard({
  candidate,
  onOpen,
  opening,
}: {
  candidate: ContinuityCandidate;
  onOpen: () => void;
  opening: boolean;
}): JSX.Element {
  return (
    <button type="button" className={styles.upNextCard} onClick={onOpen} disabled={opening}>
      <span className={styles.upNextThumb}>
        {candidate.thumbnailUrl ? (
          <img src={candidate.thumbnailUrl} alt="" className={styles.upNextThumbImg} loading="lazy" />
        ) : (
          <span className={styles.upNextThumbGlyph} aria-hidden="true">
            <Icon name="play" size={22} />
          </span>
        )}
        {candidate.durationSeconds != null && (
          <span className={styles.upNextDuration}>{formatTimestamp(candidate.durationSeconds)}</span>
        )}
        {opening && <span className={styles.upNextOverlay}>Opening…</span>}
      </span>
      <span className={styles.upNextBody}>
        <span className={styles.upNextTitle}>{candidate.title}</span>
        <span className={styles.upNextAuthor}>{candidate.author}</span>
        {candidate.reasons.length > 0 && (
          <span className={styles.reasonChips}>
            {candidate.reasons.slice(0, 3).map((reason, i) => (
              <span key={i} className={styles.reasonChip}>
                {reason}
              </span>
            ))}
          </span>
        )}
      </span>
    </button>
  );
}

function ContinuityCabinet(): JSX.Element | null {
  const currentProject = useStudyLoopStore((s) => s.currentProject);
  const candidates = useStudyLoopStore((s) => s.continuityCandidates);
  const continuityLoading = useStudyLoopStore((s) => s.continuityLoading);
  const loadContinuity = useStudyLoopStore((s) => s.loadContinuity);
  const openOrCreateYoutubeProject = useStudyLoopStore((s) => s.openOrCreateYoutubeProject);
  const openOrCreateLocalProject = useStudyLoopStore((s) => s.openOrCreateLocalProject);
  const navigate = useStudyLoopStore((s) => s.navigate);
  const [openingVideoId, setOpeningVideoId] = useState<string | null>(null);

  if (!currentProject) return null;
  // SPEC: "local-video projects: section shows library-based suggestions
  // only... hide when empty" — a youtube source still renders the shell
  // (with a refresh button) even with zero candidates, same as the old
  // Up-next cabinet's empty state; local hides entirely rather than showing
  // dead space.
  if (currentProject.source.type === "local" && candidates.length === 0 && !continuityLoading) return null;

  const handleOpen = async (candidate: ContinuityCandidate): Promise<void> => {
    setOpeningVideoId(candidate.videoId);
    try {
      const project =
        candidate.kind === "youtube"
          ? await openOrCreateYoutubeProject(candidate.videoId)
          : await openOrCreateLocalProject({
              videoPath: candidate.videoPath ?? candidate.videoId,
              title: candidate.title,
              transcriptPath: candidate.transcriptPath,
              durationSeconds: candidate.durationSeconds,
            });
      navigate({ view: "study", projectId: project.id });
    } catch {
      // store already toasted the error
    } finally {
      setOpeningVideoId(null);
    }
  };

  const handleRefresh = (): void => {
    if (continuityLoading) return;
    void loadContinuity();
  };

  return (
    <section className={styles.card}>
      <div className={styles.cardHeaderRow}>
        <div className={styles.cardHeaderStatic}>
          <span className={styles.cardTitle}>Up next</span>
        </div>
        <button
          type="button"
          className={`${styles.tickerMuteButton} ${continuityLoading ? styles.spinning : ""}`}
          onClick={handleRefresh}
          disabled={continuityLoading}
          title="Refresh suggestions"
          aria-label="Refresh suggestions"
        >
          <Icon name="refresh" size={16} />
        </button>
      </div>
      {candidates.length === 0 ? (
        <div className={styles.upNextEmpty}>
          {continuityLoading
            ? "Finding what to watch next…"
            : "No suggestions yet — try the refresh button, or Innertube may be unreachable right now."}
        </div>
      ) : (
        <div className={styles.upNextList}>
          {candidates.map((candidate) => (
            <ContinuityCard
              key={`${candidate.kind}-${candidate.videoId}`}
              candidate={candidate}
              opening={openingVideoId === candidate.videoId}
              onOpen={() => void handleOpen(candidate)}
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
  // V3-D D3: "badge on the Concepts rail header ('Review merges · N')".
  const mergeCandidateCount = useStudyLoopStore((s) => s.mergeCandidates.length);
  const setMergeQueueOpen = useStudyLoopStore((s) => s.setMergeQueueOpen);

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
          <>
            {mergeCandidateCount > 0 && (
              <button
                type="button"
                className={styles.mergeQueueBadge}
                onClick={(e) => {
                  e.stopPropagation();
                  setMergeQueueOpen(true);
                }}
                title="Concepts that look like the same idea across your projects"
              >
                <Icon name="copy" size={13} />
                Review merges · {mergeCandidateCount}
              </button>
            )}
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
          </>
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

      <OverlayDiffCabinet />

      <ContinuityCabinet />
    </div>
  );
}

/**
 * V3-C C4 "Overlay diff-on-import" (SPEC: "what they marked that you didn't"
 * — "the gap is the lesson"). Server computes the set-difference
 * (lib/overlayDiff.ts, ±15s tolerance) fresh on every GET /overlays against
 * the project's CURRENT bubbles/pearls — see routes/share.ts — so a row
 * disappears naturally once the learner adds their own mark near it, on top
 * of the explicit per-row dismiss below.
 */
function OverlayDiffCabinet(): JSX.Element | null {
  const overlays = useStudyLoopStore((s) => s.overlays);
  const overlaysVisible = useStudyLoopStore((s) => s.overlaysVisible);
  const dismissedKeys = useStudyLoopStore((s) => s.dismissedOverlayDiffKeys);
  const dismissRow = useStudyLoopStore((s) => s.dismissOverlayDiffRow);
  const controller = useStudyLoopStore((s) => s.controller);

  if (!overlaysVisible) return null;

  const groups = overlays
    .map((o) => ({
      fileName: o.fileName,
      handle: o.bundle.shareHandle,
      rows: o.diff.filter((m) => !dismissedKeys.has(`${o.fileName}:${m.kind}:${m.t}`)),
    }))
    .filter((g) => g.rows.length > 0);

  if (groups.length === 0) return null;

  return (
    <section className={styles.card}>
      <div className={styles.cardHeaderRow}>
        <div className={styles.cardHeaderStatic}>
          <span className={styles.cardTitle}>What they marked</span>
        </div>
      </div>
      <div className={styles.diffGroups}>
        {groups.map((group) => (
          <div key={group.fileName} className={styles.diffGroup}>
            <div className={styles.diffGroupHeader}>
              From {group.handle} — {group.rows.length} moment{group.rows.length === 1 ? "" : "s"} you haven&rsquo;t marked
            </div>
            <ul className={styles.diffList}>
              {group.rows.map((mark, i) => (
                <li key={`${mark.kind}-${mark.t}-${i}`} className={styles.diffRow}>
                  <button
                    type="button"
                    className={styles.diffSeekButton}
                    onClick={() => controller?.seek(Math.max(0, mark.t - 5))}
                  >
                    <span className={styles.diffTime}>{formatTimestamp(mark.t)}</span>
                    <span className={styles.diffKind} data-kind={mark.kind}>
                      {mark.kind === "pearl" ? "pearl" : "note"}
                    </span>
                    <span className={styles.diffText}>{mark.text || "(no caption)"}</span>
                  </button>
                  <button
                    type="button"
                    className={styles.diffDismiss}
                    onClick={() => dismissRow(group.fileName, mark)}
                    aria-label="Dismiss this suggestion"
                    title="Dismiss"
                  >
                    <Icon name="close" size={12} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
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
