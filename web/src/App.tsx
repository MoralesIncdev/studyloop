import { useStudyLoopStore } from "./state/store";
import { LibraryView } from "./library/LibraryView";
import { SettingsView } from "./library/SettingsView";
import { StudyView } from "./study/StudyView";
import { ToastHost } from "./components/ToastHost";

export default function App(): JSX.Element {
  const route = useStudyLoopStore((s) => s.route);

  return (
    <>
      {route.view === "library" && <LibraryView />}
      {route.view === "settings" && <SettingsView />}
      {route.view === "study" && <StudyView key={route.projectId} projectId={route.projectId} />}
      <ToastHost />
    </>
  );
}
