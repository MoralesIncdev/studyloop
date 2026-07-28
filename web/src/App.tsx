import { useEffect } from "react";
import { useStudyLoopStore } from "./state/store";
import { LibraryView } from "./library/LibraryView";
import { SettingsView } from "./library/SettingsView";
import { StudyView } from "./study/StudyView";
import { ToastHost } from "./components/ToastHost";

export default function App(): JSX.Element {
  const route = useStudyLoopStore((s) => s.route);
  const loadHealth = useStudyLoopStore((s) => s.loadHealth);

  // Checked once per app load (not per-project) — see store.ts loadHealth.
  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  return (
    <>
      {route.view === "library" && <LibraryView />}
      {route.view === "settings" && <SettingsView />}
      {route.view === "study" && <StudyView key={route.projectId} projectId={route.projectId} />}
      <ToastHost />
    </>
  );
}
