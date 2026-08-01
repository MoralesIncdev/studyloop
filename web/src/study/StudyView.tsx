// Console shell (slice A, design/mockups/video-console/index.html): the study
// page is a full-bleed stage now, not a YouTube watch-page clone. `.console`
// fills the viewport edge-to-edge with the player frame stretched inside it —
// ConsoleLayer/CCOverlay/PlayerChrome/resume overlay all still live inside
// that frame, unchanged in behavior. Everything that used to sit beside the
// player (title, channel row, action pills, description, the right rail) now
// scrolls in below the stage as `.belowFold` — same components, same store
// wiring, just relocated out of the old watchGrid two-column layout. The
// global TopBar no longer renders on this route at all (see App.tsx).
// F3 ergonomics (hotkeys, resume prompt, periodic lastPosition persistence) still
// live here since they're session-lifecycle concerns tied to "a project is open".
import { useEffect, useMemo, useRef, useState } from "react";
import { useStudyLoopStore } from "../state/store";
import { useHotkeys } from "../lib/hotkeys";
import { LocalVideoPlayer } from "../player/LocalVideoPlayer";
import { YouTubePlayer } from "../player/YouTubePlayer";
import { PlayerChrome } from "../player/PlayerChrome";
import { CCOverlay } from "../player/CCOverlay";
import { ConsoleLayer } from "../console/ConsoleLayer";
import { RightRail } from "./RightRail";
import { NotationModal } from "../notes/NotationModal";
import { MergeQueuePanel } from "../concepts/MergeQueuePanel";
import { ConceptChipStrip } from "../concepts/ConceptChipStrip";
import { CompileFlow } from "./CompileFlow";
import { AnalyzeButton } from "./AnalyzeButton";
import { DomainRow } from "./DomainRow";
import { ShareFlow } from "./ShareFlow";
import { ImportOverlayFlow } from "./ImportOverlayFlow";
import { OverlaysPill, OverlayLegend } from "./OverlaysToggle";
import { BottomDock } from "./BottomDock";
import { api } from "../lib/api";
import { formatTimestamp } from "../lib/time";
import styles from "./StudyView.module.css";

const RESUME_THRESHOLD_SECONDS = 3;
const PATCH_INTERVAL_MS = 10_000;

interface Props {
  projectId: string;
}

export function StudyView({ projectId }: Props): JSX.Element {
  const currentProject = useStudyLoopStore((s) => s.currentProject);
  const currentProjectLoading = useStudyLoopStore((s) => s.currentProjectLoading);
  const transcriptSegments = useStudyLoopStore((s) => s.transcriptSegments);
  const transcriptLoading = useStudyLoopStore((s) => s.transcriptLoading);
  const loadProjectSession = useStudyLoopStore((s) => s.loadProjectSession);
  const clearProjectSession = useStudyLoopStore((s) => s.clearProjectSession);
  const patchCurrentProject = useStudyLoopStore((s) => s.patchCurrentProject);
  const currentTime = useStudyLoopStore((s) => s.currentTime);
  const libraryItems = useStudyLoopStore((s) => s.libraryItems);
  const consoleMode = useStudyLoopStore((s) => s.consoleMode);
  const consoleEditMode = useStudyLoopStore((s) => s.consoleEditMode);
  const toggleConsoleMode = useStudyLoopStore((s) => s.toggleConsoleMode);
  const toggleConsoleEditMode = useStudyLoopStore((s) => s.toggleConsoleEditMode);
  const resetAllPaneLayouts = useStudyLoopStore((s) => s.resetAllPaneLayouts);
  // Console slice B (mock body.focus, lines 59-62): distraction-free framing —
  // an inset glow border over the stage, and the corner buttons (this view's
  // equivalent of the mock's edge-handles) dim to stay out of the way.
  const focusMode = useStudyLoopStore((s) => s.focusMode);

  // `undefined` = not yet decided (show resume prompt if applicable), a number =
  // the position the player should start at.
  const [startAt, setStartAt] = useState<number | undefined>(undefined);
  const [chromeHovering, setChromeHovering] = useState(false);
  const frameRef = useRef<HTMLDivElement | null>(null);

  const isLocal = currentProject?.source.type === "local";
  const isYoutube = currentProject?.source.type === "youtube";
  // Both source types are fully playable (YouTube via the IFrame API) — kept
  // as its own flag rather than inlined so a future non-playable source type
  // (e.g. a not-yet-resolved project) fails closed instead of falling
  // through to `true`.
  const canPlay = isLocal || isYoutube;
  const isSameProjectLoaded = currentProject?.id === projectId;

  useEffect(() => {
    void loadProjectSession(projectId);
    setStartAt(undefined);
    return () => {
      // Flush pending work for the project we're *leaving* before tearing
      // down its session state. Both reads below happen synchronously, in
      // this order, before clearProjectSession() runs — so they see the
      // still-current project/notes/time regardless of how the resulting
      // promises settle.
      const store = useStudyLoopStore.getState();
      void store.flushNotes();
      if (store.currentProject && store.currentTime > 0) {
        const watchedUpTo = Math.max(store.currentProject.watchedUpTo ?? 0, store.currentTime);
        void store.patchCurrentProject({ lastPosition: store.currentTime, watchedUpTo });
      }
      store.clearProjectSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (!isSameProjectLoaded || !currentProject || !canPlay) return;
    if (startAt !== undefined) return;
    if (currentProject.lastPosition > RESUME_THRESHOLD_SECONDS) return; // wait for user choice
    setStartAt(0);
  }, [isSameProjectLoaded, currentProject, startAt, canPlay]);

  // Persist lastPosition (and the monotonic watchedUpTo high-water mark)
  // every 10s while a playable project is open. Serialized: if a patch is
  // still in flight when the next tick fires, that tick is skipped rather
  // than firing a second overlapping PATCH. The *final* flush on leaving the
  // project is handled once, deterministically, by the session-load effect's
  // cleanup above — this effect only owns the steady-state periodic tick.
  const patchRef = useRef(patchCurrentProject);
  patchRef.current = patchCurrentProject;
  const patchInFlightRef = useRef(false);
  useEffect(() => {
    if (!canPlay || !isSameProjectLoaded) return undefined;
    const doPatch = () => {
      if (patchInFlightRef.current) return;
      const t = useStudyLoopStore.getState().currentTime;
      const prevWatchedUpTo = useStudyLoopStore.getState().currentProject?.watchedUpTo ?? 0;
      const watchedUpTo = Math.max(prevWatchedUpTo, t);
      patchInFlightRef.current = true;
      void patchRef.current({ lastPosition: t, watchedUpTo }).finally(() => {
        patchInFlightRef.current = false;
      });
    };
    const interval = setInterval(doPatch, PATCH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [canPlay, isSameProjectLoaded, projectId]);

  useHotkeys(isSameProjectLoaded && startAt !== undefined);

  // Local videos don't carry an instructor on the Project itself (that's
  // library-scan metadata) — cross-reference the already-loaded library list
  // by path, the same way openOrCreateLocalProject matches an existing
  // project. Falls back to a generic channel label rather than guessing.
  const channelName = useMemo(() => {
    if (!currentProject) return "";
    if (currentProject.source.type === "local") {
      const videoPath = currentProject.source.path;
      const match = libraryItems.find((i) => i.videoPath === videoPath);
      return match?.instructor ?? "Local video";
    }
    // V2-B: real channel/author name, resolved via Innertube at project
    // creation (see lib/innertube.ts, POST /api/youtube/resolve) and
    // persisted on the project. Falls back to a generic label for projects
    // created before this field existed, or when Innertube couldn't resolve
    // an author (yt-dlp fallback path never sets it).
    return currentProject.author ?? "YouTube";
  }, [currentProject, libraryItems]);

  if (currentProjectLoading || !isSameProjectLoaded || !currentProject) {
    return (
      <div className={styles.consoleRoot}>
        <div className={styles.loadingStage}>
          <div className={styles.loadingCard}>Loading project…</div>
        </div>
      </div>
    );
  }

  const showResumePrompt = startAt === undefined && currentProject.lastPosition > RESUME_THRESHOLD_SECONDS;

  return (
    <div className={styles.consoleRoot}>
      <section className={styles.console}>
        <div className={styles.playerFrame} ref={frameRef}>
          {showResumePrompt && (
            <div className={styles.resumeOverlay}>
              <div className={styles.resumeCard}>
                <p>Resume from {formatTimestamp(currentProject.lastPosition)}?</p>
                <div className={styles.resumeActions}>
                  <button type="button" className={styles.primaryButton} onClick={() => setStartAt(currentProject.lastPosition)}>
                    Resume
                  </button>
                  <button type="button" className={styles.secondaryButton} onClick={() => setStartAt(0)}>
                    Start over
                  </button>
                </div>
              </div>
            </div>
          )}
          {startAt !== undefined && currentProject.source.type === "local" && (
            <LocalVideoPlayer key={currentProject.id} src={api.videoStreamUrl(currentProject.source.path)} startAt={startAt} />
          )}
          {startAt !== undefined && currentProject.source.type === "youtube" && (
            <YouTubePlayer key={currentProject.id} videoId={currentProject.source.videoId} startAt={startAt} />
          )}
          {startAt !== undefined && <CCOverlay chromeVisible={chromeHovering} />}
          {startAt !== undefined && <ConsoleLayer frameRef={frameRef} />}
          {startAt !== undefined && <PlayerChrome frameRef={frameRef} onVisibleChange={setChromeHovering} />}
          {/* Console slice B: mock's `.focus-frame` (lines 59-62) — inset
              rounded border + soft glow, pointer-events:none so it never
              intercepts anything underneath. */}
          <div className={`${styles.focusFrame} ${focusMode ? styles.focusFrameOn : ""}`} aria-hidden="true" />
        </div>

        {/* Corner controls (mock lines 426-438): glass circular buttons, blur
            scoped to just these two small buttons — never blur the stage
            itself (perf law, mock comment at line 66). Fades toward the
            player chrome's idle state; never fully hidden/unreachable.
            Console slice B: dims further in focus mode (mock's edge-handle
            equivalent — "dim non-essential floating UI"). */}
        <div
          className={`${styles.cornerButtons} ${chromeHovering ? styles.cornerButtonsVisible : ""} ${focusMode ? styles.cornerButtonsDimmed : ""}`}
        >
          <button
            type="button"
            className={`${styles.cornerBtn} ${consoleEditMode ? styles.cornerBtnOn : ""}`}
            onClick={toggleConsoleEditMode}
            title="Edit layout (E)"
            aria-label="Edit layout"
            aria-pressed={consoleEditMode}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M11.3 2.1l2.6 2.6L5.6 13H3v-2.6z" />
              <path d="M9.6 3.8l2.6 2.6" />
            </svg>
          </button>
          <button
            type="button"
            className={`${styles.cornerBtn} ${consoleMode ? styles.cornerBtnOn : ""}`}
            onClick={toggleConsoleMode}
            onDoubleClick={resetAllPaneLayouts}
            title="Overlay layer (O) · double-click resets pane layout"
            aria-label="Overlay layer"
            aria-pressed={consoleMode}
          >
            <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.4">
              <rect x="1" y="1" width="6.4" height="6.4" rx="1.6" />
              <rect x="9.6" y="1" width="6.4" height="6.4" rx="1.6" />
              <rect x="1" y="9.6" width="6.4" height="6.4" rx="1.6" />
              <rect x="9.6" y="9.6" width="6.4" height="6.4" rx="1.6" />
            </svg>
          </button>
        </div>
      </section>

      <div className={styles.belowFold}>
        {/* V3-A A4: slim chip strip below the player, outside the video frame — replaces the old slide-over ticker. */}
        <ConceptChipStrip />

        <h1 className={styles.title}>{currentProject.title}</h1>

        <div className={styles.channelRow}>
          <div className={styles.channelIdentity}>
            <span className={styles.avatar} aria-hidden="true">
              {channelName.charAt(0).toUpperCase() || "?"}
            </span>
            <div className={styles.channelText}>
              <span className={styles.channelName}>{channelName}</span>
              <span className={styles.channelSource}>
                {currentProject.source.type === "local" ? currentProject.source.path : currentProject.source.url}
              </span>
            </div>
          </div>
          <AnalyzeButton />
        </div>

        <DomainRow />

        <div className={styles.actionPills}>
          <CompileFlow />
          <ShareFlow />
          <ImportOverlayFlow />
          <OverlaysPill />
        </div>
        <OverlayLegend />

        <div className={styles.descriptionBox}>
          <BottomDock />
        </div>

        {/* Slice A: the right rail moves into the below-fold flow full-width
            for now — a later slice relocates it into edge cabinets beside the
            console (see BUILD-BRIEF.md); nothing here loses functionality. */}
        <div className={styles.railWrap}>
          <RightRail segments={transcriptSegments} transcriptLoading={transcriptLoading} />
        </div>
      </div>

      <NotationModal />
      <MergeQueuePanel />
    </div>
  );
}
