import { useEffect } from "react";
import { useStudyLoopStore } from "./state/store";
import { LibraryView } from "./library/LibraryView";
import { SettingsView } from "./library/SettingsView";
import { StudyView } from "./study/StudyView";
import { ReviewView } from "./review/ReviewView";
import { ToastHost } from "./components/ToastHost";
import { TopBar } from "./components/TopBar";
import { FRONT_DOOR_ARRIVAL_NOTE_KEY, FRONT_DOOR_SESSION_GUARD_KEY, shouldFrontDoorRedirect } from "./lib/reviewFrontDoor";

export default function App(): JSX.Element {
  const route = useStudyLoopStore((s) => s.route);
  const navigate = useStudyLoopStore((s) => s.navigate);
  const loadHealth = useStudyLoopStore((s) => s.loadHealth);
  const loadReviewCounts = useStudyLoopStore((s) => s.loadReviewCounts);
  const loadMergeCandidates = useStudyLoopStore((s) => s.loadMergeCandidates);
  const reviewCounts = useStudyLoopStore((s) => s.reviewCounts);

  // Checked once per app load (not per-project) — see store.ts loadHealth.
  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  // F11: TopBar badge + home banner both read reviewCounts — loaded once on
  // mount (like loadHealth above), refreshed again after every grade.
  useEffect(() => {
    void loadReviewCounts();
  }, [loadReviewCounts]);

  // Phase 7 "Front door" (SPEC move 3): the instant reviewCounts first
  // arrives after mount, redirect the default library landing straight into
  // Review when there's due work — at most once per browser session
  // (sessionStorage guard) and never when ?noredirect is present (see
  // lib/reviewFrontDoor.ts's shouldFrontDoorRedirect for the actual rule).
  // Gated on route.view === "library" inside the predicate so a deep link
  // (#/study/x, #/settings, #/review itself) is never hijacked — only the
  // bare default entry point redirects.
  useEffect(() => {
    if (!reviewCounts || typeof window === "undefined") return;
    const decision = shouldFrontDoorRedirect({
      routeView: route.view,
      due: reviewCounts.due,
      search: window.location.search,
      alreadyRedirected: window.sessionStorage.getItem(FRONT_DOOR_SESSION_GUARD_KEY) === "1",
    });
    if (!decision) return;
    window.sessionStorage.setItem(FRONT_DOOR_SESSION_GUARD_KEY, "1");
    window.sessionStorage.setItem(FRONT_DOOR_ARRIVAL_NOTE_KEY, String(reviewCounts.due));
    navigate({ view: "review" });
    // Runs once per reviewCounts arrival (route.view/navigate are stable/
    // read-at-call-time) — matches the mount-only pattern the effects above use.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewCounts]);

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
