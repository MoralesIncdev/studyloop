// F2 study view: header, video (60%) / transcript (40%) main row, bottom dock.
// F3: hotkeys, resume prompt, and periodic lastPosition persistence live here too
// since they're all session-lifecycle concerns tied to "a project is open".
import { useEffect, useRef, useState } from "react";
import { useStudyLoopStore } from "../state/store";
import { useHotkeys } from "../lib/hotkeys";
import { LocalVideoPlayer } from "../player/LocalVideoPlayer";
import { YouTubePlayer } from "../player/YouTubePlayer";
import { SeekBar } from "../player/SeekBar";
import { PlayerControls } from "../player/PlayerControls";
import { TranscriptPane } from "../transcript/TranscriptPane";
import { BottomDock } from "./BottomDock";
import { NotationModal } from "../notes/NotationModal";
import { ConceptTicker } from "../concepts/ConceptTicker";
import { CompileFlow } from "./CompileFlow";
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
  const navigate = useStudyLoopStore((s) => s.navigate);
  const currentTime = useStudyLoopStore((s) => s.currentTime);
  const duration = useStudyLoopStore((s) => s.duration);
  const loopA = useStudyLoopStore((s) => s.loopA);
  const loopB = useStudyLoopStore((s) => s.loopB);
  const controller = useStudyLoopStore((s) => s.controller);
  const bubbles = useStudyLoopStore((s) => s.bubbles);
  const concepts = useStudyLoopStore((s) => s.concepts);
  const conceptTickerMuted = useStudyLoopStore((s) => s.conceptTickerMuted);
  const setConceptTickerMuted = useStudyLoopStore((s) => s.setConceptTickerMuted);

  // `undefined` = not yet decided (show resume prompt if applicable), a number =
  // the position the player should start at.
  const [startAt, setStartAt] = useState<number | undefined>(undefined);

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
      // promises settle. (Previously this depended on React running two
      // separate effects' cleanups in a particular order: clearProjectSession
      // zeroed currentTime/currentProject before the *other* effect's cleanup
      // got a chance to read them, silently dropping the final progress PATCH
      // — consolidating into one cleanup removes that ordering hazard
      // entirely.)
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
  // than firing a second overlapping PATCH — an out-of-order response to an
  // earlier request could otherwise stomp a later position. The *final*
  // flush on leaving the project is handled once, deterministically, by the
  // session-load effect's cleanup above — this effect only owns the
  // steady-state periodic tick.
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
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={() => navigate({ view: "library" })}>
          ← Library
        </button>
        <div className={styles.headerTitles}>
          <h1 className={styles.title}>{currentProject.title}</h1>
          <span className={styles.subtitle}>
            {currentProject.source.type === "local" ? currentProject.source.path : currentProject.source.url}
          </span>
        </div>
        <CompileFlow />
        <button
          type="button"
          className={styles.tickerMuteButton}
          onClick={() => setConceptTickerMuted(!conceptTickerMuted)}
          title={conceptTickerMuted ? "Unmute concept ticker" : "Mute concept ticker"}
          aria-pressed={conceptTickerMuted}
        >
          {conceptTickerMuted ? "🔕 Ticker muted" : "🔔 Ticker"}
        </button>
      </header>

      <div className={styles.main}>
        <div className={styles.videoColumn}>
          <div className={styles.videoArea}>
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
            {startAt !== undefined && <ConceptTicker />}
          </div>
          <SeekBar
            currentTime={currentTime}
            duration={duration}
            loopA={loopA}
            loopB={loopB}
            bubbles={bubbles.map((b) => ({
              id: b.id,
              t: b.t,
              text: b.text,
              thumbnailUrl: b.shot ? api.shotUrl(currentProject.id, b.shot) : null,
            }))}
            conceptTicks={concepts.flatMap((c) =>
              c.anchors
                .map((a, i) => (a.t != null ? { id: `${c.id}-${i}`, t: a.t, title: c.title } : null))
                .filter((tick): tick is { id: string; t: number; title: string } => tick !== null)
            )}
            onSeek={(t) => controller?.seek(t)}
            onSeekBubble={(t) => controller?.seek(Math.max(0, t - 5))}
          />
          <PlayerControls />
        </div>
        <div className={styles.transcriptColumn}>
          <TranscriptPane segments={transcriptSegments} loading={transcriptLoading} />
        </div>
      </div>

      <div className={styles.dockRow}>
        <BottomDock />
      </div>

      <NotationModal />
    </div>
  );
}
