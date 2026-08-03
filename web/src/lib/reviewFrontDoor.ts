// Phase 7 "Front door" (SPEC move 3, EXECUTION-PLAN-post-review-v1.md): on
// app load, land on Review instead of Library when the review queue has due
// items — the retention loop otherwise "lives a route away". Kept as a pure
// predicate (no window/sessionStorage access here) so the actual decision
// logic is directly unit-testable; App.tsx/ReviewView.tsx own the
// sessionStorage reads/writes (once-per-session guard + the one-shot
// arrival note), the same "pure logic vs. I/O at the call site" split this
// codebase uses elsewhere (lib/review.ts vs routes/review.ts).
import type { Route } from "./router";

/** Once-per-browser-session redirect guard (SPEC: "don't redirect more than once per session"). */
export const FRONT_DOOR_SESSION_GUARD_KEY = "studyloop:reviewFrontDoorRedirected";
/** One-shot "n due" arrival note, consumed (and cleared) the moment ReviewView reads it — see ReviewView.tsx's FrontDoorNote. */
export const FRONT_DOOR_ARRIVAL_NOTE_KEY = "studyloop:reviewFrontDoorArrivalDue";

export interface FrontDoorDecisionInput {
  /** Only the default library landing route redirects — a deep link (e.g. #/study/x, #/review, #/settings) is left alone. */
  routeView: Route["view"];
  due: number;
  /** window.location.search, e.g. "?noredirect" — respected verbatim, no parsing beyond "is the key present" (SPEC: "respect a ?noredirect query param"). */
  search: string;
  /** Whether the session guard was already set this browser session. */
  alreadyRedirected: boolean;
}

/** Pure predicate — no side effects. Callers (App.tsx) set the session guard themselves only when this returns true. */
export function shouldFrontDoorRedirect(input: FrontDoorDecisionInput): boolean {
  if (input.routeView !== "library") return false;
  if (input.due <= 0) return false;
  if (input.alreadyRedirected) return false;
  if (new URLSearchParams(input.search).has("noredirect")) return false;
  return true;
}
