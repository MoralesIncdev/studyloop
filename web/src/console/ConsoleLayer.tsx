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
import { DrillPane } from "./DrillPane";
import { EchoPane } from "./EchoPane";
import { ExhaleOverlay } from "./ExhaleOverlay";
import { NotePane } from "./NotePane";
import styles from "./ConsoleLayer.module.css";

interface Props {
  frameRef: RefObject<HTMLDivElement>;
}

export function ConsoleLayer({ frameRef }: Props): JSX.Element | null {
  const consoleMode = useStudyLoopStore((s) => s.consoleMode);
  const editing = useStudyLoopStore((s) => s.consoleEditMode);
  // Bumped by store.resetAllPaneLayouts() (bento button double-click) — keying
  // the panes off it forces a remount, which is how they notice their
  // just-cleared localStorage entry and fall back to defaultPos.
  const paneLayoutVersion = useStudyLoopStore((s) => s.paneLayoutVersion);
  if (!consoleMode) return null;

  return (
    <div className={`${styles.layer} ${editing ? styles.editing : ""}`}>
      {editing && <div className={styles.editBadge}>Edit layout · drag panes · E or Esc exits</div>}
      <ConceptPane key={`concept-${paneLayoutVersion}`} frameRef={frameRef} />
      <DrillPane key={`drill-${paneLayoutVersion}`} frameRef={frameRef} />
      <EchoPane key={`echo-${paneLayoutVersion}`} frameRef={frameRef} />
      <NotePane key={`note-${paneLayoutVersion}`} frameRef={frameRef} />
      <ExhaleOverlay />
    </div>
  );
}
