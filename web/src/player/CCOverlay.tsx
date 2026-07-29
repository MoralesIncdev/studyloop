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

  if (!ccEnabled) return null;
  if (isTranscriptVisuallyOpen(railOpenSection, playbackFocus, focusOverride)) return null;
  const idx = activeSegmentIndex(segments, currentTime);
  if (idx < 0) return null;
  const text = segments[idx].text;
  if (!text) return null;

  return (
    <div className={`${styles.wrap} ${chromeVisible ? styles.raised : ""}`}>
      <span className={styles.text}>{text}</span>
    </div>
  );
}
