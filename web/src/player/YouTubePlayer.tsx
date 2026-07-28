// Wraps the YouTube IFrame Player API and exposes it as a PlayerHandle (SPEC
// "Player interface"), mirroring LocalVideoPlayer: registers itself with the
// store's `controller` slot so hotkeys/UI never touch the player directly,
// and drives the sync engine with the same ~4Hz poll cadence. The IFrame API
// has no timeupdate-style event, so getCurrentTime() must be polled — same
// rAF-throttled loop as LocalVideoPlayer, including A/B loop enforcement in
// the same tick.
import { useEffect, useRef } from "react";
import { useStudyLoopStore } from "../state/store";
import type { PlayerEvent, PlayerEventPayloads, PlayerHandle } from "./types";
import { loadYouTubeIframeApi, type YTPlayer, type YTPlayerEvent } from "./youtubeApi";
import styles from "./YouTubePlayer.module.css";

const SYNC_INTERVAL_MS = 250; // ~4Hz, same cadence as LocalVideoPlayer

// Numeric player states from the IFrame API (YT.PlayerState.*). Not read off
// `window.YT.PlayerState` because that namespace isn't guaranteed loaded at
// module-eval time — these are stable, documented constants.
const STATE_ENDED = 0;
const STATE_PLAYING = 1;
const STATE_PAUSED = 2;

interface Props {
  videoId: string;
  /** Seconds to seek to once the player is ready (resume support). Applied once. */
  startAt?: number;
}

type Listeners = { [E in PlayerEvent]?: Set<(payload: PlayerEventPayloads[E]) => void> };

export function YouTubePlayer({ videoId, startAt = 0 }: Props): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listenersRef = useRef<Listeners>({});
  const rafRef = useRef<number | null>(null);
  const lastSyncRef = useRef(0);
  const lastReportedTimeRef = useRef(-1);
  const appliedStartRef = useRef(false);
  const playerRef = useRef<YTPlayer | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    let disposed = false;

    const setController = useStudyLoopStore.getState().setController;
    const setCurrentTime = useStudyLoopStore.getState().setCurrentTime;
    const setDuration = useStudyLoopStore.getState().setDuration;
    const setIsPlaying = useStudyLoopStore.getState().setIsPlaying;
    const pushToast = useStudyLoopStore.getState().pushToast;

    function emit<E extends PlayerEvent>(event: E, payload: PlayerEventPayloads[E]): void {
      listenersRef.current[event]?.forEach((cb) => cb(payload));
    }

    function startSync(player: YTPlayer): void {
      const tick = (now: number) => {
        if (now - lastSyncRef.current >= SYNC_INTERVAL_MS) {
          lastSyncRef.current = now;
          let t = player.getCurrentTime();
          const { loopA, loopB } = useStudyLoopStore.getState();
          if (loopA != null && loopB != null && t >= loopB) {
            player.seekTo(loopA, true);
            t = loopA;
          }
          if (Math.abs(t - lastReportedTimeRef.current) > 0.01) {
            lastReportedTimeRef.current = t;
            setCurrentTime(t);
            emit("timeupdate", { currentTime: t });
          }
          // YouTube's duration can read 0 for a beat after onReady fires
          // (metadata still loading) — keep refreshing until it settles,
          // same "reassert on every chance we get" approach LocalVideoPlayer
          // uses for playbackRate.
          const d = player.getDuration();
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    }

    loadYouTubeIframeApi().then(
      (YT) => {
        if (disposed || !containerRef.current) return;
        const player = new YT.Player(containerRef.current, {
          videoId,
          playerVars: { autoplay: 0, playsinline: 1, modestbranding: 1, rel: 0 },
          events: {
            onReady: (e: YTPlayerEvent) => {
              if (disposed) return;
              const ytPlayer = e.target;
              playerRef.current = ytPlayer;

              const handle: PlayerHandle = {
                play: () => {
                  try {
                    ytPlayer.playVideo();
                  } catch (err) {
                    pushToast(`Playback failed: ${err instanceof Error ? err.message : String(err)}`, "error");
                  }
                },
                pause: () => ytPlayer.pauseVideo(),
                seek: (t) => {
                  const duration = ytPlayer.getDuration();
                  const max = Number.isFinite(duration) && duration > 0 ? duration : Infinity;
                  const clamped = Math.max(0, Math.min(t, max));
                  ytPlayer.seekTo(clamped, true);
                  setCurrentTime(clamped);
                  lastReportedTimeRef.current = clamped;
                },
                getCurrentTime: () => ytPlayer.getCurrentTime(),
                getDuration: () => {
                  const d = ytPlayer.getDuration();
                  return Number.isFinite(d) ? d : 0;
                },
                setRate: (r) => ytPlayer.setPlaybackRate(r),
                on: (event, cb) => {
                  const bucket = (listenersRef.current[event] ??= new Set() as NonNullable<Listeners[typeof event]>);
                  bucket.add(cb as never);
                  return () => bucket.delete(cb as never);
                },
              };
              setController(handle);

              ytPlayer.setPlaybackRate(useStudyLoopStore.getState().playbackRate);
              const d = ytPlayer.getDuration();
              if (Number.isFinite(d) && d > 0) {
                setDuration(d);
                emit("durationchange", { duration: d });
              }
              if (!appliedStartRef.current && startAt > 0) {
                appliedStartRef.current = true;
                ytPlayer.seekTo(startAt, true);
              }
              startSync(ytPlayer);
            },
            onStateChange: (e: YTPlayerEvent) => {
              if (disposed) return;
              if (e.data === STATE_PLAYING) {
                setIsPlaying(true);
                emit("play", undefined);
              } else if (e.data === STATE_PAUSED) {
                setIsPlaying(false);
                emit("pause", undefined);
              } else if (e.data === STATE_ENDED) {
                setIsPlaying(false);
                emit("ended", undefined);
              }
            },
            onError: () => {
              if (disposed) return;
              const message =
                "YouTube playback failed. The video may be unavailable, private, or embedding may be disabled by its owner.";
              pushToast(message, "error");
              emit("error", { message });
            },
          },
        });
        playerRef.current = player;
      },
      (err: unknown) => {
        if (disposed) return;
        pushToast(`Could not load the YouTube player: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
    );

    return () => {
      disposed = true;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      setController(null);
      listenersRef.current = {};
      try {
        playerRef.current?.destroy();
      } catch {
        // Player may already be torn down by the API itself on navigation.
      }
      playerRef.current = null;
    };
    // Intentionally run once per mount — StudyView remounts this component
    // (via React `key`) when the project changes, so `videoId`/`startAt` are
    // effectively constant for the lifetime of a given mount (mirrors
    // LocalVideoPlayer's same convention).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={styles.wrap}>
      <div ref={containerRef} className={styles.iframeHost} />
    </div>
  );
}
