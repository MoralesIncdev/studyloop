// SPEC V2 "description box (YT-style, tabs): [Notes | Bubbles]" — Concepts moved
// out into the right-rail Concepts card (see RightRail.tsx). Both tabs stay
// mounted (hidden via CSS, not unmounted) so an in-progress note edit or the
// bubble list's scroll position survives switching tabs.
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

  return (
    <div className={styles.dock}>
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
