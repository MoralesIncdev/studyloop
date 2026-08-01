import { useEffect } from "react";
import { useStudyLoopStore } from "./state/store";
import { LibraryView } from "./library/LibraryView";
import { SettingsView } from "./library/SettingsView";
import { StudyView } from "./study/StudyView";
import { ReviewView } from "./review/ReviewView";
import { ToastHost } from "./components/ToastHost";
import { TopBar } from "./components/TopBar";

export default function App(): JSX.Element {
  const route = useStudyLoopStore((s) => s.route);
  const loadHealth = useStudyLoopStore((s) => s.loadHealth);
  const loadReviewCounts = useStudyLoopStore((s) => s.loadReviewCounts);
  const loadMergeCandidates = useStudyLoopStore((s) => s.loadMergeCandidates);

  // Checked once per app load (not per-project) — see store.ts loadHealth.
  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  // F11: TopBar badge + home banner both read reviewCounts — loaded once on
  // mount (like loadHealth above), refreshed again after every grade.
  useEffect(() => {
    void loadReviewCounts();
  }, [loadReviewCounts]);

  // V3-D D3: Concepts rail badge count — loaded app-wide on mount so it's
  // ready the instant a project opens, regardless of which one; the panel
  // itself refreshes again on open (see MergeQueuePanel.tsx).
  useEffect(() => {
    void loadMergeCandidates();
  }, [loadMergeCandidates]);

  return (
    <>
      {/* Console shell (slice A): the study view is a full-bleed stage, not a
          page under the global chrome — TopBar would eat viewport height the
          console needs and doesn't belong over the footage. */}
      {route.view !== "study" && <TopBar />}
      {route.view === "library" && <LibraryView />}
      {route.view === "settings" && <SettingsView />}
      {route.view === "study" && <StudyView key={route.projectId} projectId={route.projectId} />}
      {route.view === "review" && <ReviewView />}
      <ToastHost />
    </>
  );
}
