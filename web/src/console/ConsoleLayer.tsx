// Console slice 8 scaffold (design/mockups/video-console/BUILD-BRIEF.md): the
// pane-engine's mount point over the player frame. Gated entirely behind
// store.consoleMode (off by default, toggled with "O" — see hotkeys.ts) so
// this ships dark until the real engine (registry, drag magnetism, park/undock,
// edit mode) lands. z-index sits above CCOverlay (6) but below PlayerChrome's
// hover-scrim layer (8) — the console pane should read over captions but
// never fight the control chrome for the top.
import { type RefObject } from "react";
import { useStudyLoopStore } from "../state/store";
import { ConceptPane } from "./ConceptPane";
import styles from "./ConsoleLayer.module.css";

interface Props {
  frameRef: RefObject<HTMLDivElement>;
}

export function ConsoleLayer({ frameRef }: Props): JSX.Element | null {
  const consoleMode = useStudyLoopStore((s) => s.consoleMode);
  if (!consoleMode) return null;

  return (
    <div className={styles.layer}>
      <ConceptPane frameRef={frameRef} />
    </div>
  );
}
