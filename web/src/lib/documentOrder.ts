// Phase 8 "Document mode" (design/EXECUTION-PLAN-post-review-v1.md): pure
// ordering/grouping logic for the document surface's unit list (see
// study/DocumentView.tsx) — plain transcript (first-anchor-time) order, a
// deliberately different axis from lib/studyPath.ts's topoSortUnits (which
// reorders by REQUIRES/PROCEDURE_STEP prerequisite edges for the Study Path
// rail). Document mode is meant to read like the transcript itself, so it
// never reorders past what the video actually said (SPEC: "a scrollable,
// transcript-ordered list of the project's units").
//
// No React/store dependency — matches this codebase's web/src/lib/*.ts
// convention (studyPath.ts, heatmap.ts, conceptChips.ts) of pulling ordering
// logic out where it's directly unit-testable.
import type { AnalysisUnit } from "./types";

function firstAnchorTime(unit: AnalysisUnit): number {
  if (unit.anchors.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(...unit.anchors.map((a) => a.t));
}

/**
 * Ascending by first anchor time; a unit with no anchors at all sorts last
 * (stable, deterministic), tie-broken by label. A CLUSTER unit sorts (and
 * later renders) as exactly one entry here regardless of its member count —
 * "collapsed to one entry expandable to members" (SPEC item 1) is a
 * rendering concern (UnitProposalCard's member fold), not an ordering one;
 * this function never looks inside `members`.
 */
export function orderUnitsForDocument(units: readonly AnalysisUnit[]): AnalysisUnit[] {
  return [...units].sort((a, b) => {
    const ta = firstAnchorTime(a);
    const tb = firstAnchorTime(b);
    if (ta !== tb) return ta - tb;
    return a.label.localeCompare(b.label);
  });
}

/** A named run of consecutive units under one heading (SPEC item 1: "section
 *  headings from chapters if chapter data exists, otherwise plain ordered
 *  flow"). `title: null` marks the plain-flow group — DocumentView renders
 *  no heading for it. */
export interface DocumentChapter {
  title: string | null;
  units: AnalysisUnit[];
}

/** A chapter boundary — every unit whose first anchor is >= startSec (and
 *  before the next chapter's startSec) belongs to this chapter. No chapter
 *  data model exists anywhere in this codebase yet (Project/Analysis carry
 *  no chapters field) — `chapters` is accepted here so a future field slots
 *  straight into this grouping function without a redesign; until then every
 *  caller omits it and gets the single plain-flow group below. */
export interface ChapterMarker {
  title: string;
  startSec: number;
}

/**
 * Groups already-ordered units into chapters. With no `chapters` supplied
 * (today's only real call site — DocumentView has no chapters source yet),
 * returns one untitled group holding every unit, i.e. "plain ordered flow".
 */
export function groupUnitsIntoChapters(
  orderedUnits: readonly AnalysisUnit[],
  chapters?: readonly ChapterMarker[]
): DocumentChapter[] {
  if (!chapters || chapters.length === 0) {
    return orderedUnits.length > 0 ? [{ title: null, units: [...orderedUnits] }] : [];
  }
  const sortedChapters = [...chapters].sort((a, b) => a.startSec - b.startSec);
  const groups: DocumentChapter[] = sortedChapters.map((c) => ({ title: c.title, units: [] }));
  for (const unit of orderedUnits) {
    const t = firstAnchorTime(unit);
    let idx = 0;
    for (let i = 0; i < sortedChapters.length; i++) {
      if (t >= sortedChapters[i].startSec) idx = i;
    }
    groups[idx].units.push(unit);
  }
  // A chapter with nothing anchored inside its span (e.g. one that starts
  // after every unit's anchor) renders no empty heading.
  return groups.filter((g) => g.units.length > 0);
}
