// Console slice C (design/mockups/video-console/index.html lines 200-258,
// 596-658): edge-handle cabinets — mounted once per player frame, alongside
// ConsoleLayer/PlayerChrome. Unlike the pane-engine overlay (store.consoleMode),
// these are a permanent fixture of the console stage, not an opt-in layer, so
// they're always mounted once a video is playable — no consoleMode gate.
import { EdgeHandles } from "./EdgeHandles";
import { ConceptsCabinet } from "./ConceptsCabinet";
import { CapturesCabinet } from "./CapturesCabinet";
import { SessionCabinet } from "./SessionCabinet";
import styles from "./Cabinets.module.css";

export function Cabinets(): JSX.Element {
  return (
    <div className={styles.wrap}>
      <EdgeHandles />
      <ConceptsCabinet />
      <CapturesCabinet />
      <SessionCabinet />
    </div>
  );
}
