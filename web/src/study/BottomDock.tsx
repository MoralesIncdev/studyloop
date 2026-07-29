// SPEC V2 "description box (YT-style, tabs): [Notes | Bubbles]" — Concepts moved
// out into the right-rail Concepts card (see RightRail.tsx). Both tabs stay
// mounted (hidden via CSS, not unmounted) so an in-progress note edit or the
// bubble list's scroll position survives switching tabs.
//
// V3-A A1 "state-aware surface purge": dims to 45% opacity during playbackFocus
// (still fully interactive — clicks/typing work at any opacity); CSS restores
// full opacity on hover/focus-within so a stray click doesn't fight the dim.
// A real :focus-within (tabbing/clicking into the dock) also counts as the
// user's own "expand a rail section or focus the dock" override signal (A1).
import { useStudyLoopStore, type DockTab } from "../state/store";
import { NotesPane } from "../notes/NotesPane";
import { BubbleRail } from "../notes/BubbleRail";
import styles from "./BottomDock.module.css";

const TABS: { id: DockTab; label: string }[] = [
  { id: "notes", label: "Notes" },
  { id: "bubbles", label: "Bubbles" },
];

export function BottomDock(): JSX.Element {
  const activeDockTab = useStudyLoopStore((s) => s.activeDockTab);
  const setActiveDockTab = useStudyLoopStore((s) => s.setActiveDockTab);
  const playbackFocus = useStudyLoopStore((s) => s.playbackFocus);
  const focusOverride = useStudyLoopStore((s) => s.focusOverride);
  const isPlaying = useStudyLoopStore((s) => s.isPlaying);
  const setFocusOverride = useStudyLoopStore((s) => s.setFocusOverride);

  const dimmed = playbackFocus && !focusOverride;

  return (
    <div
      className={styles.dock}
      data-dimmed={dimmed}
      onFocus={() => {
        if (isPlaying) setFocusOverride();
      }}
    >
      <div className={styles.tabBar} role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeDockTab === tab.id}
            className={`${styles.tab} ${activeDockTab === tab.id ? styles.tabActive : ""}`}
            onClick={() => setActiveDockTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className={styles.panel}>
        <div className={styles.tabPanel} hidden={activeDockTab !== "notes"}>
          <NotesPane />
        </div>
        <div className={styles.tabPanel} hidden={activeDockTab !== "bubbles"}>
          <BubbleRail />
        </div>
      </div>
    </div>
  );
}
