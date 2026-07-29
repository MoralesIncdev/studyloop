// V3-C C4 "Overlay diff-on-import" (SPEC): pure set-difference, pre-authored
// by the kimi seat and integrated here unchanged (review found no logic bugs
// — see continuity.ts for the one fix that WAS needed in its sibling module).
// Wired into GET /api/projects/:id/overlays (server/src/routes/share.ts),
// which builds `own`/`imported` Mark[] from the project's real bubbles/pearls
// and an overlay bundle's bubbles/pearls before calling diffMarks().

/**
 * A single overlay mark (bubble or pearl) positioned on a video timeline.
 */
export interface Mark {
  /** Timestamp in seconds. */
  t: number;
  /** Visual kind of the mark. */
  kind: "bubble" | "pearl";
  /** Importance level for pearls; defaults to 1 if omitted. */
  importance?: 1 | 2 | 3;
  /** Display text for the mark. */
  text: string;
  /** Author who created the mark. */
  author: string;
}

/**
 * Compare two marks for the diff output order.
 *
 * Order: pearls before bubbles, pearl importance descending, then time ascending.
 */
function compareMarks(a: Mark, b: Mark): number {
  const aIsPearl = a.kind === "pearl";
  const bIsPearl = b.kind === "pearl";

  if (aIsPearl && bIsPearl) {
    const aImportance = a.importance ?? 1;
    const bImportance = b.importance ?? 1;
    if (bImportance !== aImportance) {
      return bImportance - aImportance;
    }
    return a.t - b.t;
  }

  if (aIsPearl && !bIsPearl) return -1;
  if (!aIsPearl && bIsPearl) return 1;

  return a.t - b.t;
}

/**
 * Return imported marks that have no corresponding "own" mark within the
 * given time tolerance.
 *
 * - Empty arrays are handled safely.
 * - Duplicate timestamps in the own list are deduplicated before matching.
 * - Marks at the exact tolerance boundary are considered matched and excluded.
 * - The result is sorted: pearl importance descending, then bubbles, then t ascending.
 *
 * @param imported - Marks imported from an external source.
 * @param own - Marks owned by the current user.
 * @param toleranceSec - Maximum time difference (in seconds) for a match. Defaults to 15.
 * @returns A new array of unmatched imported marks.
 */
export function diffMarks(
  imported: Mark[],
  own: Mark[],
  toleranceSec = 15,
): Mark[] {
  // Dedupe own marks by exact timestamp, keeping the first occurrence.
  const ownByTime = new Map<number, Mark>();
  for (const mark of own) {
    if (!ownByTime.has(mark.t)) {
      ownByTime.set(mark.t, mark);
    }
  }
  const ownTimes = Array.from(ownByTime.keys());

  const unmatched = imported.filter((importedMark) => {
    return !ownTimes.some(
      (ownTime) => Math.abs(importedMark.t - ownTime) <= toleranceSec,
    );
  });

  return unmatched.sort(compareMarks);
}
