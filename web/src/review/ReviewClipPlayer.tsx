// F11 Review Mode "Clip loop" (SPEC): a self-contained, muted-by-default mini
// player for a local-video bubble card's back. Deliberately not wired into
// the global store's `controller`/A-B-loop machinery (LocalVideoPlayer) —
// review mode isn't a study session, and this only ever needs a fixed
// [t-5, t+5] loop with no seek bar, hotkeys, or sync-engine involvement.
// Lazy by construction: the caller only mounts this once "Play 10s clip" is
// pressed (SPEC: "Clip is lazy — no video element until pressed").
import { useEffect, useRef } from "react";
import { clipBounds } from "../lib/reviewClip";
import styles from "./ReviewClipPlayer.module.css";

interface Props {
  src: string;
  t: number;
}

export function ReviewClipPlayer({ src, t }: Props): JSX.Element {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const { start, end } = clipBounds(t);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    const onLoadedMetadata = (): void => {
      video.currentTime = start;
      video.play().catch(() => {
        // Autoplay can still be blocked even when muted in some browser
        // configurations — the native controls let the user press play.
      });
    };
    const onTimeUpdate = (): void => {
      if (video.currentTime >= end) video.currentTime = start;
    };

    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("timeupdate", onTimeUpdate);
    return () => {
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("timeupdate", onTimeUpdate);
    };
  }, [start, end]);

  return (
    <video
      ref={videoRef}
      className={styles.clip}
      src={src}
      muted
      controls
      playsInline
      preload="metadata"
      aria-label="10 second clip loop"
    />
  );
}
