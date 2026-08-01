// SPEC V2 "CC overlay": renders the active transcript segment YouTube-CC style
// (bottom-center, translucent black, max 2 lines) while store.ccEnabled is on.
// Nudged up when the hover chrome is visible so it never sits under the controls.
//
// V3-A A1 "CC/transcript redundancy rule": the CC overlay renders only while
// the transcript rail card is effectively collapsed — never two full text
// streams at once (PEDAGOGY §4), regardless of *why* the transcript is
// expanded (purge-suspended pause, or a manual focusOverride during
// playback — V3-A review finding #2: a prior formula here only accounted
// for the paused case and left CC showing alongside an override-expanded
// transcript during playback).
//
// Console slice 2 "hover-pause" (design/mockups/video-console/SURVEY.md,
// Language Reactor pattern): the cursor entering the caption text soft-pauses
// playback — "reading" and "watching" become states the player manages —
// and leaving resumes ONLY if this hover caused the pause. The hitbox is the
// text span, not the overlay region, so a cursor drifting across the lower
// third never misfires (SURVEY trap list).
import { useEffect, useRef } from "react";
import { useStudyLoopStore } from "../state/store";
import { activeSegmentIndex, isTranscriptVisuallyOpen } from "../lib/selectors";
import styles from "./CCOverlay.module.css";

interface Props {
  chromeVisible: boolean;
}

export function CCOverlay({ chromeVisible }: Props): JSX.Element | null {
  const ccEnabled = useStudyLoopStore((s) => s.ccEnabled);
  const segments = useStudyLoopStore((s) => s.transcriptSegments);
  const currentTime = useStudyLoopStore((s) => s.currentTime);
  const railOpenSection = useStudyLoopStore((s) => s.railOpenSection);
  const playbackFocus = useStudyLoopStore((s) => s.playbackFocus);
  const focusOverride = useStudyLoopStore((s) => s.focusOverride);
  const hoverPausedRef = useRef(false);

  // If the overlay unmounts mid-hover (CC toggled off, segment gap), release
  // the soft-pause rather than leaving the player stuck paused.
  useEffect(
    () => () => {
      if (hoverPausedRef.current) {
        hoverPausedRef.current = false;
        useStudyLoopStore.getState().controller?.play();
        useStudyLoopStore.getState().setAutoPaused(false);
      }
    },
    []
  );

  if (!ccEnabled) return null;
  if (isTranscriptVisuallyOpen(railOpenSection, playbackFocus, focusOverride)) return null;
  const idx = activeSegmentIndex(segments, currentTime);
  if (idx < 0) return null;
  const text = segments[idx].text;
  if (!text) return null;

  const handleEnter = (): void => {
    const store = useStudyLoopStore.getState();
    if (store.isPlaying && store.controller) {
      hoverPausedRef.current = true;
      store.controller.pause();
      // Console slice B: status-chips row (PlayerChrome/StatusChips) shows
      // "Paused · reading" for this pause source instead of the manual-pause
      // context chip (design/mockups/video-console/index.html line 1068).
      store.setAutoPaused(true);
    }
  };
  const handleLeave = (): void => {
    if (!hoverPausedRef.current) return;
    hoverPausedRef.current = false;
    const store = useStudyLoopStore.getState();
    store.controller?.play();
    store.setAutoPaused(false);
  };

  return (
    <div className={`${styles.wrap} ${chromeVisible ? styles.raised : ""}`}>
      <span className={styles.text} onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
        {text}
      </span>
    </div>
  );
}
