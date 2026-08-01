// Wraps a plain <video> element and exposes it as a PlayerHandle (SPEC "Player
// interface"), registering itself with the store's `controller` slot so hotkeys and
// UI controls never touch the DOM node directly. Also drives the sync engine: an
// rAF loop reads currentTime at ~4Hz and pushes it into the store, enforcing an
// A/B loop in the same tick (per SPEC: "enforcement in the sync loop").
import { useEffect, useRef } from "react";
import { useStudyLoopStore } from "../state/store";
import type { PlayerEvent, PlayerEventPayloads, PlayerHandle } from "./types";
import styles from "./LocalVideoPlayer.module.css";

const SYNC_INTERVAL_MS = 250; // ~4Hz, per SPEC sync engine contract

interface Props {
  src: string;
  /** Seconds to seek to once metadata is ready (resume support). Applied once. */
  startAt?: number;
}

type Listeners = { [E in PlayerEvent]?: Set<(payload: PlayerEventPayloads[E]) => void> };

export function LocalVideoPlayer({ src, startAt = 0 }: Props): JSX.Element {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const listenersRef = useRef<Listeners>({});
  const rafRef = useRef<number | null>(null);
  const lastSyncRef = useRef(0);
  const lastReportedTimeRef = useRef(-1);
  const appliedStartRef = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    const setController = useStudyLoopStore.getState().setController;
    const setCurrentTime = useStudyLoopStore.getState().setCurrentTime;
    const setDuration = useStudyLoopStore.getState().setDuration;
    const setIsPlaying = useStudyLoopStore.getState().setIsPlaying;
    const pushToast = useStudyLoopStore.getState().pushToast;

    function emit<E extends PlayerEvent>(event: E, payload: PlayerEventPayloads[E]): void {
      listenersRef.current[event]?.forEach((cb) => cb(payload));
    }

    const handle: PlayerHandle = {
      play: () => {
        video.play().catch((err: unknown) => {
          pushToast(`Playback failed: ${err instanceof Error ? err.message : String(err)}`, "error");
        });
      },
      pause: () => video.pause(),
      seek: (t) => {
        const max = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : Infinity;
        const clamped = Math.max(0, Math.min(t, max));
        video.currentTime = clamped;
        setCurrentTime(clamped);
        lastReportedTimeRef.current = clamped;
      },
      getCurrentTime: () => video.currentTime,
      getDuration: () => (Number.isFinite(video.duration) ? video.duration : 0),
      setRate: (r) => {
        video.playbackRate = r;
        // A plain <video> element applies whatever rate it's given (no
        // snapping to a discrete set, unlike YouTube's IFrame API) — but the
        // store is still updated from here, not by the caller, so both
        // player implementations follow the same "the player is the source
        // of truth for what rate actually ended up in effect" contract.
        useStudyLoopStore.getState().setPlaybackRate(video.playbackRate);
      },
      getVolume: () => (video.muted ? 0 : video.volume),
      setVolume: (v) => {
        const clamped = Math.min(1, Math.max(0, v));
        video.volume = clamped;
        video.muted = clamped === 0;
        useStudyLoopStore.getState().setVolume(clamped);
      },
      on: (event, cb) => {
        const bucket = (listenersRef.current[event] ??= new Set() as NonNullable<Listeners[typeof event]>);
        bucket.add(cb as never);
        return () => bucket.delete(cb as never);
      },
    };
    setController(handle);

    // Apply the persisted playback rate immediately — a fresh <video> element
    // always starts at 1x regardless of what the store (and the visible
    // speed control) says, so without this a rate set on a previous
    // video/mount silently stopped applying to the next one.
    video.playbackRate = useStudyLoopStore.getState().playbackRate;
    video.volume = useStudyLoopStore.getState().volume;

    const onLoadedMetadata = () => {
      const d = Number.isFinite(video.duration) ? video.duration : 0;
      setDuration(d);
      emit("durationchange", { duration: d });
      // V3-C review finding #6: persist the real duration onto the project
      // the moment the player learns it, so the server's heatmap bucket
      // mapping (and any future consumer) prefers this over ffprobe/
      // transcript/watchedUpTo estimates. No-ops once already stored.
      useStudyLoopStore.getState().reportLearnedDuration(d);
      if (!appliedStartRef.current && startAt > 0) {
        appliedStartRef.current = true;
        video.currentTime = Math.min(startAt, d || startAt);
      }
      // Some browsers reset playbackRate once real metadata/source info loads
      // (or a new <source> resolves); reassert it here too.
      video.playbackRate = useStudyLoopStore.getState().playbackRate;
      video.volume = useStudyLoopStore.getState().volume;
    };
    const onPlay = () => {
      setIsPlaying(true);
      emit("play", undefined);
    };
    const onPause = () => {
      setIsPlaying(false);
      emit("pause", undefined);
    };
    const onEnded = () => {
      setIsPlaying(false);
      emit("ended", undefined);
    };
    const onError = () => {
      const message = video.error?.message || "Video failed to load. Check the file still exists at its path.";
      pushToast(message, "error");
      emit("error", { message });
    };

    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onEnded);
    video.addEventListener("error", onError);

    const tick = (now: number) => {
      if (now - lastSyncRef.current >= SYNC_INTERVAL_MS) {
        lastSyncRef.current = now;
        let t = video.currentTime;
        const { loopA, loopB } = useStudyLoopStore.getState();
        if (loopA != null && loopB != null && t >= loopB) {
          video.currentTime = loopA;
          t = loopA;
        }
        if (Math.abs(t - lastReportedTimeRef.current) > 0.01) {
          lastReportedTimeRef.current = t;
          setCurrentTime(t);
          emit("timeupdate", { currentTime: t });
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("error", onError);
      setController(null);
      listenersRef.current = {};
    };
    // Intentionally run once per mount — StudyView remounts this component (via
    // React `key`) when the project changes, so `src`/`startAt` are effectively
    // constant for the lifetime of a given mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Standard player behavior (Ryan's live-use ask, 2026-08-01): clicking the
  // footage toggles play/pause. Routed through the registered controller so
  // the play-failure toast and store state follow the same path as hotkeys.
  const handleClick = (): void => {
    const video = videoRef.current;
    const controller = useStudyLoopStore.getState().controller;
    if (!video || !controller) return;
    if (video.paused) controller.play();
    else controller.pause();
  };

  return (
    <video
      ref={videoRef}
      className={styles.video}
      src={src}
      controls={false}
      preload="metadata"
      playsInline
      onClick={handleClick}
    />
  );
}
