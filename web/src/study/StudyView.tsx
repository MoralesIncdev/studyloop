// V2-A: YouTube watch-page layout (SPEC "V2 layout"). Player + hover chrome left,
// right rail (Transcript / Concepts / Up next); below the player: title, channel
// row, action pills, description box (Notes | Bubbles). The global TopBar (see
// App.tsx) replaces the old per-view header entirely.
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
      <div className={styles.page}>
        <div className={styles.status}>Loading project…</div>
      </div>
    );
  }

  const showResumePrompt = startAt === undefined && currentProject.lastPosition > RESUME_THRESHOLD_SECONDS;

  return (
    <div className={styles.page}>
      <div className={styles.watchGrid}>
        <div className={styles.leftCol}>
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
          </div>

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
        </div>

        <div className={styles.rightCol}>
          <RightRail segments={transcriptSegments} transcriptLoading={transcriptLoading} />
        </div>
      </div>

      <NotationModal />
      <MergeQueuePanel />
    </div>
  );
}
