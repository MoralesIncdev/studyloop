// F2 study view: header, video (60%) / transcript (40%) main row, bottom dock.
// F3: hotkeys, resume prompt, and periodic lastPosition persistence live here too
// since they're all session-lifecycle concerns tied to "a project is open".
import { useEffect, useRef, useState } from "react";
import { useStudyLoopStore } from "../state/store";
import { useHotkeys } from "../lib/hotkeys";
import { LocalVideoPlayer } from "../player/LocalVideoPlayer";
import { SeekBar } from "../player/SeekBar";
import { PlayerControls } from "../player/PlayerControls";
import { TranscriptPane } from "../transcript/TranscriptPane";
import { BottomDock } from "./BottomDock";
import { NotationModal } from "../notes/NotationModal";
import { ConceptTicker } from "../concepts/ConceptTicker";
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
  const isSameProjectLoaded = currentProject?.id === projectId;

  useEffect(() => {
    void loadProjectSession(projectId);
    setStartAt(undefined);
    return () => clearProjectSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (!isSameProjectLoaded || !currentProject) return;
    if (currentProject.source.type !== "local") return;
    if (startAt !== undefined) return;
    if (currentProject.lastPosition > RESUME_THRESHOLD_SECONDS) return; // wait for user choice
    setStartAt(0);
  }, [isSameProjectLoaded, currentProject, startAt]);

  // Persist lastPosition (and the monotonic watchedUpTo high-water mark)
  // every 10s while a local project is open. Serialized: if a patch is still
  // in flight when the next tick (or unmount) fires, that tick is skipped
  // rather than firing a second overlapping PATCH — an out-of-order response
  // to an earlier request could otherwise stomp a later position.
  const patchRef = useRef(patchCurrentProject);
  patchRef.current = patchCurrentProject;
  const patchInFlightRef = useRef(false);
  useEffect(() => {
    if (!isLocal || !isSameProjectLoaded) return undefined;
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
    return () => {
      clearInterval(interval);
      const t = useStudyLoopStore.getState().currentTime;
      if (t > 0) doPatch();
    };
  }, [isLocal, isSameProjectLoaded, projectId]);

  useHotkeys(isSameProjectLoaded && startAt !== undefined);

  if (currentProjectLoading || !isSameProjectLoaded || !currentProject) {
    return (
      <div className={styles.page}>
        <div className={styles.status}>Loading project…</div>
      </div>
    );
  }

  if (currentProject.source.type === "youtube") {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <button type="button" className={styles.backButton} onClick={() => navigate({ view: "library" })}>
            ← Library
          </button>
          <h1 className={styles.title}>{currentProject.title}</h1>
        </header>
        <div className={styles.youtubePlaceholder}>
          <p>YouTube playback arrives in the next build.</p>
          <p className={styles.youtubePlaceholderSub}>
            This project was created from{" "}
            <a href={currentProject.source.url} target="_blank" rel="noreferrer">
              {currentProject.source.url}
            </a>
            .
          </p>
        </div>
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
          <span className={styles.subtitle}>{currentProject.source.path}</span>
        </div>
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
            {startAt !== undefined && (
              <LocalVideoPlayer key={currentProject.id} src={api.videoStreamUrl(currentProject.source.path)} startAt={startAt} />
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
