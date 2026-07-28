// SPEC V2 "CC overlay": renders the active transcript segment YouTube-CC style
// (bottom-center, translucent black, max 2 lines) while store.ccEnabled is on.
// Nudged up when the hover chrome is visible so it never sits under the controls.
import { useStudyLoopStore } from "../state/store";
import { activeSegmentIndex } from "../lib/selectors";
import styles from "./CCOverlay.module.css";

interface Props {
  chromeVisible: boolean;
}

export function CCOverlay({ chromeVisible }: Props): JSX.Element | null {
  const ccEnabled = useStudyLoopStore((s) => s.ccEnabled);
  const segments = useStudyLoopStore((s) => s.transcriptSegments);
  const currentTime = useStudyLoopStore((s) => s.currentTime);

  if (!ccEnabled) return null;
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
