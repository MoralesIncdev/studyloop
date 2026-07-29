// V3-B B4 "Lapse-to-context pipeline" (SPEC/PEDAGOGY §5): "Again ×2 in-session
// → inline auto-playing 10s clip (local) or timestamp link (YT); ×3 → 'Open
// in player' button (seeds lastPosition, navigates, pauses queue)." Pure
// escalation-tier function over a per-session "again" count — the count
// itself lives in state/store.ts's ReviewSessionState.againCounts, reset
// fresh every session (never persisted, unlike the server's hidden lapses
// counter in review.json).
export type LapseTier = "none" | "clip" | "player";

export function lapseTier(againCountThisSession: number): LapseTier {
  if (againCountThisSession >= 3) return "player";
  if (againCountThisSession >= 2) return "clip";
  return "none";
}
