// Bottom dock: tabs Notes | Bubbles | Concepts. Content is an empty placeholder in
// this chunk — NotesPane, BubbleRail, and ConceptTicker land in a later build.
import { useStudyLoopStore, type DockTab } from "../state/store";
import styles from "./BottomDock.module.css";

const TABS: { id: DockTab; label: string }[] = [
  { id: "notes", label: "Notes" },
  { id: "bubbles", label: "Bubbles" },
  { id: "concepts", label: "Concepts" },
];

const PLACEHOLDER_COPY: Record<DockTab, string> = {
  notes: "Long-running notes with timestamp links arrive in a later build.",
  bubbles: "Time-anchored notation bubbles arrive in a later build.",
  concepts: "The concept ticker and cards arrive in a later build.",
};

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
        <p className={styles.placeholder}>{PLACEHOLDER_COPY[activeDockTab]}</p>
      </div>
    </div>
  );
}
