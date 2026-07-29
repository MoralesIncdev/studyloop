// F11 "Review Mode" (SPEC "F11 — Review Mode (spaced resurfacing)"): pure
// scheduling math (hidden SM-2-lite) + card derivation, kept dependency-free
// and side-effect-free (no fs/network) so it's directly unit-testable —
// matches this codebase's "routes stay thin, lib/ holds the logic + tests"
// convention (see lib/heatmap.ts, lib/analysisJobs.ts). routes/review.ts is
// the only place that reads real project/bubble/analysis data off disk and
// calls into here.
//
// Every function that needs "now" takes it as an explicit `nowMs` parameter
// (an injectable clock) rather than calling Date.now() itself — the whole
// point being that the scheduling ladder, the daily new-card cap, and the
// streak counter are all deterministically testable against a fake clock.
import { z } from "zod";
import type { Bubble, Project } from "./models.js";
import type { Analysis } from "./analysis.js";
import { isUnitFeedable, type AttestationsFile } from "./attestation.js";

// --- Scheduling constants (SPEC "Scheduling (hidden SM-2-lite)") -----------

/** Fixed ladder, in days — no configurable knobs (SPEC non-goal). */
export const REVIEW_LADDER_DAYS = [1, 3, 7, 14, 30, 60] as const;

/** SPEC: "New cards: due immediately, capped at 20 new/day". */
export const NEW_CARDS_DAILY_CAP = 20;

const DAY_MS = 24 * 60 * 60 * 1000;

// --- review.json shape -------------------------------------------------------

export const ReviewGradeSchema = z.enum(["again", "good"]);
export type ReviewGrade = z.infer<typeof ReviewGradeSchema>;

export const ReviewCardStateSchema = z.object({
  /** ISO timestamp — when this card next becomes due. */
  due: z.string(),
  /** Current ladder position, in days. 0 = brand new / just lapsed. */
  interval: z.number().nonnegative().default(0),
  lapses: z.number().nonnegative().default(0),
  reps: z.number().nonnegative().default(0),
  lastGrade: ReviewGradeSchema.nullable().default(null),
  /** ISO timestamp — when this card was first introduced (daily new-card cap bookkeeping). */
  introducedAt: z.string(),
});
export type ReviewCardState = z.infer<typeof ReviewCardStateSchema>;

const StreakSchema = z.object({
  count: z.number().nonnegative(),
  /** UTC day key ("YYYY-MM-DD") of the last day a grade was recorded. */
  lastDay: z.string(),
});
export type Streak = z.infer<typeof StreakSchema>;

/** V3-B B4 "Card transformation" cache entry — see lib/cardTransform.ts. */
export const ReviewCardTransformSchema = z.object({
  front: z.string(),
  back: z.string(),
  why: z.string(),
});
export type ReviewCardTransform = z.infer<typeof ReviewCardTransformSchema>;

export const ReviewStateSchema = z.object({
  version: z.literal(1),
  cards: z.record(ReviewCardStateSchema),
  /** Optional: absent until the first-ever grade is recorded. Not exposed as
   *  a stats page (SPEC non-goal) — only surfaced as a single summary line
   *  at the end of a review session. */
  streak: StreakSchema.optional(),
  /** V3-B B4: `{[cardId]: transformed}` — computed at most once per card, cached here so repeat sessions never re-call the LLM for the same card. */
  transformed: z.record(ReviewCardTransformSchema).optional(),
});
export type ReviewState = z.infer<typeof ReviewStateSchema>;

export const GradeBodySchema = z.object({
  cardId: z.string().min(1),
  grade: ReviewGradeSchema,
});
export type GradeBody = z.infer<typeof GradeBodySchema>;

export function emptyReviewState(): ReviewState {
  return { version: 1, cards: {} };
}

// --- Clock-derived helpers ---------------------------------------------------

/** UTC calendar-day key ("YYYY-MM-DD") for a given instant — the unit the daily new-card cap and streak both bucket on. */
export function dayKeyUTC(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

function isoAt(nowMs: number): string {
  return new Date(nowMs).toISOString();
}

function isoAfterDays(nowMs: number, days: number): string {
  return new Date(nowMs + days * DAY_MS).toISOString();
}

// --- Ladder math --------------------------------------------------------------

/**
 * Given the ladder position a "Got it" grade is advancing *from*, returns the
 * next interval in days. A currentInterval not found on the ladder (i.e. 0,
 * every brand-new or just-lapsed card) advances to the first rung. Already at
 * the top rung stays there — SPEC gives no further-growth rule and explicitly
 * rules out a configurable ladder, so the top rung just repeats.
 */
export function nextGoodInterval(currentIntervalDays: number): number {
  const idx = REVIEW_LADDER_DAYS.indexOf(currentIntervalDays as (typeof REVIEW_LADDER_DAYS)[number]);
  if (idx === -1) return REVIEW_LADDER_DAYS[0];
  return REVIEW_LADDER_DAYS[Math.min(idx + 1, REVIEW_LADDER_DAYS.length - 1)];
}

/** A freshly-introduced card: due immediately, step 0. */
export function introduceCardState(nowMs: number): ReviewCardState {
  const now = isoAt(nowMs);
  return { due: now, interval: 0, lapses: 0, reps: 0, lastGrade: null, introducedAt: now };
}

/**
 * Applies a grade to a card's scheduling state (SPEC: "Again → interval 0
 * (repeat this session, +lapse), Got it → next interval in ladder ... Again
 * resets to step 0"). `introducedAt` is carried over unchanged — it's a
 * fixed provenance stamp, not something grading ever touches.
 */
export function gradeCardState(state: ReviewCardState, grade: ReviewGrade, nowMs: number): ReviewCardState {
  if (grade === "again") {
    return { ...state, interval: 0, lapses: state.lapses + 1, lastGrade: "again", due: isoAt(nowMs) };
  }
  const interval = nextGoodInterval(state.interval);
  return { ...state, interval, reps: state.reps + 1, lastGrade: "good", due: isoAfterDays(nowMs, interval) };
}

export function isDue(state: ReviewCardState, nowMs: number): boolean {
  return new Date(state.due).getTime() <= nowMs;
}

// --- Streak (SPEC UI: "summary state ... + streak line") ---------------------

/**
 * A day-over-day study streak, bumped once per calendar day the first time a
 * grade is recorded that day (repeat grades the same day are no-ops). Not a
 * stats page (SPEC non-goal) — just enough state for the one summary line
 * the Review view shows at session end.
 */
export function bumpStreak(prev: Streak | undefined, nowMs: number): Streak {
  const today = dayKeyUTC(nowMs);
  if (prev && prev.lastDay === today) return prev;
  const yesterday = dayKeyUTC(nowMs - DAY_MS);
  const count = prev && prev.lastDay === yesterday ? prev.count + 1 : 1;
  return { count, lastDay: today };
}

// --- Card derivation (SPEC "Cards") -------------------------------------------

export interface ReviewCardBase {
  id: string;
  projectId: string;
  projectTitle: string;
  sourceType: "local" | "youtube";
  /** Local sources only — lets the client build a video-stream/clip-loop URL without a second round trip. */
  sourcePath?: string;
  /** YouTube sources only — lets the client build an "Open at timestamp" link. */
  sourceVideoId?: string;
  t: number;
  /** V3-B B4: attached by routes/review.ts from review.json's transformed cache, when present — see lib/cardTransform.ts. */
  transformed?: ReviewCardTransform;
}

export interface ReviewBubbleCard extends ReviewCardBase {
  kind: "bubble";
  text: string;
  shot: string | null;
}

export interface ReviewPearlCard extends ReviewCardBase {
  kind: "pearl";
  label: string;
  insight: string;
  importance: 1 | 2 | 3;
}

/**
 * V3-B B4: "Attested units become reviewable as generation cards: front =
 * 'your take' prompt for the unit, back = unit summary + user's own take."
 * `userTake` is carried through so the back can render it alongside the AI
 * summary — a card with no userTake at all (attested via the checkmark
 * without ever typing a take) still reviews, just with an empty "your take".
 */
export interface ReviewUnitCard extends ReviewCardBase {
  kind: "unit";
  unitType: "CLAIM" | "MECHANISM" | "PROCEDURE" | "EXAMPLE" | "BOUNDARY";
  label: string;
  summary: string;
  userTake: string | null;
  /** V3-D D2 "Threshold-concept tagging": carried from analysis.units[].threshold — see buildReviewQueue's introduction/ordering priority below. */
  threshold: boolean;
}

export type ReviewCard = ReviewBubbleCard | ReviewPearlCard | ReviewUnitCard;

/**
 * Derives the review cards currently backed by live study artifacts for one
 * project (SPEC "Cards": bubble cards from bubbles that carry text, pearl
 * cards from analysis pearls — stub analyses excluded outside dev). Never
 * touches disk; the route assembles `bubbles`/`analysis` first. Ids are
 * stable (`bubble:<projectId>:<bubbleId>`, `pearl:<projectId>:<t>`) so
 * scheduling state in review.json survives across calls, and orphan-dropping
 * falls straight out of comparing this output against review.json's tracked
 * card ids (see `buildReviewQueue`).
 */
export function deriveLiveCards(
  project: Project,
  bubbles: readonly Bubble[],
  analysis: Analysis | null,
  stubAnalysesVisible: boolean,
  /** V3-B B2/B4: attestations gate which v3 units become generation cards — omitted (or empty) means "no units feed review", same as a v2/no-analysis project. */
  attestations: AttestationsFile = {}
): ReviewCard[] {
  const sourceType = project.source.type;
  const sourcePath = project.source.type === "local" ? project.source.path : undefined;
  const sourceVideoId = project.source.type === "youtube" ? project.source.videoId : undefined;

  const cards: ReviewCard[] = [];

  for (const b of bubbles) {
    // SPEC: "Bubble card (bubble with text)" — a screenshot-only bubble
    // (empty text) never produces a card.
    if (!b.text || !b.text.trim()) continue;
    cards.push({
      id: `bubble:${project.id}:${b.id}`,
      kind: "bubble",
      projectId: project.id,
      projectTitle: project.title,
      sourceType,
      sourcePath,
      sourceVideoId,
      t: b.t,
      text: b.text,
      shot: b.shot ?? null,
    });
  }

  const analysisVisible = analysis !== null && (analysis.source === "model" || (analysis.source === "stub" && stubAnalysesVisible));
  if (analysisVisible && analysis) {
    for (const p of analysis.pearls) {
      cards.push({
        id: `pearl:${project.id}:${p.t}`,
        kind: "pearl",
        projectId: project.id,
        projectTitle: project.title,
        sourceType,
        sourcePath,
        sourceVideoId,
        t: p.t,
        label: p.label,
        insight: p.insight,
        importance: p.importance,
      });
    }

    // V3-B B4: "Attested units become reviewable as generation cards" — v3
    // analyses only (units is absent/empty on v2). Gated the same way
    // compile's "Concept sections" and Study Path's attest check are (see
    // lib/attestation.ts's isUnitFeedable) — a dismissed or never-touched
    // unit never reaches the review queue.
    for (const u of analysis.units ?? []) {
      if (!isUnitFeedable(attestations[u.id])) continue;
      cards.push({
        id: `unit:${project.id}:${u.id}`,
        kind: "unit",
        projectId: project.id,
        projectTitle: project.title,
        sourceType,
        sourcePath,
        sourceVideoId,
        t: u.anchors[0]?.t ?? 0,
        unitType: u.type,
        label: u.label,
        summary: u.summary,
        userTake: attestations[u.id]?.userTake?.trim() || null,
        threshold: u.threshold,
      });
    }
  }

  return cards.sort((a, b) => a.t - b.t);
}

// --- Queue derivation (SPEC "GET /api/review/queue") --------------------------

export interface ReviewQueueCounts {
  due: number;
  new: number;
  total: number;
}

export interface BuildReviewQueueResult {
  /** Updated review state — orphans dropped, newly-introduced cards added. Caller persists this. */
  state: ReviewState;
  dueCards: ReviewCard[];
  counts: ReviewQueueCounts;
}

/**
 * Joins live artifact-derived cards with persisted scheduling state:
 * - Orphan dropping: any tracked card whose id isn't in `liveCards` anymore
 *   (the bubble/pearl behind it was deleted) is dropped from state silently
 *   (SPEC: "Deleted artifacts drop their cards silently").
 * - New-card introduction: any live card not yet tracked is introduced (due
 *   immediately) up to `dailyCap` remaining for today (SPEC: "capped at 20
 *   new/day"); cards beyond the cap are simply left untracked and
 *   reconsidered next call (e.g. once the day rolls over).
 * - Due computation: a tracked card is included in `dueCards` iff its `due`
 *   timestamp is `<= nowMs`.
 *
 * `dueCards` preserves `liveCards`' order (stable/sorted by the caller) for
 * every card EXCEPT one V3-D D2 exception (see `isThresholdCard` below):
 * output ordering is otherwise deterministic for a given input — important
 * for tests and for a UI that shouldn't reshuffle mid-session.
 */

/** V3-D D2: a unit card flagged threshold — the only ReviewCard kind that carries the flag at all (bubble/pearl cards are never threshold-eligible). */
function isThresholdCard(card: ReviewCard): boolean {
  return card.kind === "unit" && card.threshold === true;
}

export function buildReviewQueue(
  liveCards: readonly ReviewCard[],
  priorState: ReviewState,
  nowMs: number,
  dailyCap: number = NEW_CARDS_DAILY_CAP
): BuildReviewQueueResult {
  const liveIds = new Set(liveCards.map((c) => c.id));

  // Orphan dropping.
  const cards: Record<string, ReviewCardState> = {};
  for (const [id, cardState] of Object.entries(priorState.cards)) {
    if (liveIds.has(id)) cards[id] = cardState;
  }

  const today = dayKeyUTC(nowMs);
  const introducedToday = Object.values(cards).filter(
    (c) => dayKeyUTC(new Date(c.introducedAt).getTime()) === today
  ).length;
  let remainingCap = Math.max(0, dailyCap - introducedToday);

  // V3-D D2 "review scheduler seeds threshold-unit cards at higher initial
  // priority (due first among new)": among live cards not yet tracked,
  // threshold-flagged unit cards are introduced ahead of everything else —
  // still subject to the same daily cap, so on a capped day the highest-
  // value new material claims the day's slots first. Stable: within each
  // rank (threshold / not), liveCards' own order (index) breaks ties, so
  // this is a no-op reordering whenever no threshold cards are present.
  const introductionOrder = liveCards
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      const rank = Number(isThresholdCard(b.c)) - Number(isThresholdCard(a.c));
      return rank !== 0 ? rank : a.i - b.i;
    })
    .map(({ c }) => c);

  const introducedThisCall = new Set<string>();
  for (const live of introductionOrder) {
    if (remainingCap <= 0) break;
    if (cards[live.id]) continue;
    cards[live.id] = introduceCardState(nowMs);
    introducedThisCall.add(live.id);
    remainingCap--;
  }

  // Session ordering: SPEC D2 "due first among new" — a threshold card
  // freshly introduced THIS call floats to the front of the "new" subset of
  // the queue; already-tracked cards (overdue or otherwise due) keep
  // liveCards' own order among themselves. Stable/no-op when no card was
  // both newly-introduced and threshold-flagged this call.
  const dueOrder = liveCards
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      const aNewThreshold = introducedThisCall.has(a.c.id) && isThresholdCard(a.c);
      const bNewThreshold = introducedThisCall.has(b.c.id) && isThresholdCard(b.c);
      const rank = Number(bNewThreshold) - Number(aNewThreshold);
      return rank !== 0 ? rank : a.i - b.i;
    })
    .map(({ c }) => c);

  const dueCards: ReviewCard[] = [];
  let newCount = 0;
  for (const live of dueOrder) {
    const cardState = cards[live.id];
    if (!cardState) continue; // not introduced this call (over the daily cap) — simply absent from the queue
    if (!isDue(cardState, nowMs)) continue;
    dueCards.push(live);
    if (cardState.reps === 0 && cardState.lastGrade === null) newCount++;
  }

  return {
    state: { ...priorState, cards },
    dueCards,
    counts: { due: dueCards.length, new: newCount, total: liveCards.length },
  };
}

// --- V3-B B4 "Mastery over streaks" --------------------------------------

/** A card is "locked in" once it's graduated past the 30-day rung of the ladder (SPEC: "cards with interval ≥30d"). */
export const MASTERY_INTERVAL_DAYS = 30;

/** Counts cards locked in across every tracked card in review.json (all projects — review.json is dataDir-wide, not per-project). The summary screen's headline number; the day-streak becomes footnote text alongside it. */
export function masteryCount(cards: Readonly<Record<string, ReviewCardState>>): number {
  return Object.values(cards).filter((c) => c.interval >= MASTERY_INTERVAL_DAYS).length;
}
