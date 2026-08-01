// Console slice B (design/mockups/video-console/index.html lines 897-911,
// "mpv grammar: A → B → clear"): a single button/hotkey cycles the A/B loop
// through three presses instead of separate Set A / Set B / Clear controls.
// Pure state-machine extracted from the store action (state/store.ts
// cycleAbLoop) so the transition table is unit-testable without a player
// controller or zustand store in the loop.

export type AbLoopAction = "setA" | "setB" | "clear";

/**
 * Which action the next cycle press performs, given the current loop points.
 * loopA unset → set it at the playhead. loopA set, loopB unset → set B.
 * Both set → clear (mirrors the mock's abState 0→1→2→0 cycle exactly).
 */
export function nextAbLoopAction(loopA: number | null, loopB: number | null): AbLoopAction {
  if (loopA == null) return "setA";
  if (loopB == null) return "setB";
  return "clear";
}
