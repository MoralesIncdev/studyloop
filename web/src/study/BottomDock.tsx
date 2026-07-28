// Bottom dock: tabs Notes | Bubbles | Concepts. Notes and Bubbles stay mounted
// under both tabs (hidden via CSS rather than unmounted) so an in-progress note
// edit or the bubble list's scroll position survives switching tabs; Concepts
// is mounted lazily (only while active) since its content depends on
// currentTime and there's no persisted UI state worth keeping warm.
import { useStudyLoopStore, type DockTab } from "../state/store";
import { NotesPane } from "../notes/NotesPane";
import { BubbleRail } from "../notes/BubbleRail";
import { ConceptsDock } from "../concepts/ConceptsDock";
import styles from "./BottomDock.module.css";

const TABS: { id: DockTab; label: string }[] = [
  { id: "notes", label: "Notes" },
  { id: "bubbles", label: "Bubbles" },
  { id: "concepts", label: "Concepts" },
];

export function BottomDock(): JSX.Element {
  const activeDockTab = useStudyLoopStore((s) => s.activeDockTab);
  const setActiveDockTab = useStudyLoopStore((s) => s.setActiveDockTab);

  return (
    <div className={styles.dock}>
      <div className={styles.tabBar}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
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
        {activeDockTab === "concepts" && (
          <div className={styles.tabPanel}>
            <ConceptsDock />
          </div>
        )}
      </div>
    </div>
  );
}
