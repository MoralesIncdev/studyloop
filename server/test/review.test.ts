import { describe, expect, it } from "vitest";
import {
  bumpStreak,
  buildReviewQueue,
  dayKeyUTC,
  deriveLiveCards,
  emptyReviewState,
  GradeBodySchema,
  gradeCardState,
  introduceCardState,
  isDue,
  nextGoodInterval,
  REVIEW_LADDER_DAYS,
  type ReviewCard,
  type ReviewCardState,
  type ReviewState,
} from "../src/lib/review.js";
import type { Analysis } from "../src/lib/analysis.js";
import type { Bubble, Project } from "../src/lib/models.js";

const DAY_MS = 24 * 60 * 60 * 1000;
// A fixed instant, well clear of any UTC day-boundary edge case, used as "now" everywhere below.
const NOW = Date.parse("2026-07-15T12:00:00.000Z");

function baseProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Gordon Ryan Half Guard",
    source: { type: "local", path: "/videos/gordon.mp4" },
    transcript: { type: "none" },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    lastPosition: 0,
    watchedUpTo: 0,
    ...overrides,
  };
}

function bubble(overrides: Partial<Bubble> = {}): Bubble {
  return { id: "b1", t: 30, text: "Underhook first", shot: null, createdAt: "2026-01-01T00:00:00Z", ...overrides };
}

function analysis(overrides: Partial<Analysis> = {}): Analysis {
  return {
    generatedAt: "2026-01-01T00:00:00Z",
    model: "claude-opus-5",
    version: 2,
    source: "model",
    pearls: [{ t: 60, label: "Frame early", insight: "Get the frame before they settle.", importance: 2 }],
    concepts: [],
    themes: [],
    ...overrides,
  };
}

// --- Scheduling ladder ---------------------------------------------------------

describe("nextGoodInterval", () => {
  it("advances a brand-new card (interval 0, not on the ladder) to the first rung", () => {
    expect(nextGoodInterval(0)).toBe(1);
  });

  it("advances one step at a time through the ladder", () => {
    expect(nextGoodInterval(1)).toBe(3);
    expect(nextGoodInterval(3)).toBe(7);
    expect(nextGoodInterval(7)).toBe(14);
    expect(nextGoodInterval(14)).toBe(30);
    expect(nextGoodInterval(30)).toBe(60);
  });

  it("stays at the top rung once reached", () => {
    expect(nextGoodInterval(60)).toBe(60);
  });

  it("treats any off-ladder value the same as brand-new (defensive)", () => {
    expect(nextGoodInterval(5)).toBe(REVIEW_LADDER_DAYS[0]);
  });
});

describe("gradeCardState", () => {
  it("'Again' resets interval to 0, bumps lapses, and is due immediately", () => {
    const state: ReviewCardState = { due: "2026-07-01T00:00:00.000Z", interval: 14, lapses: 1, reps: 3, lastGrade: "good", introducedAt: "2026-01-01T00:00:00.000Z" };
    const graded = gradeCardState(state, "again", NOW);
    expect(graded.interval).toBe(0);
    expect(graded.lapses).toBe(2);
    expect(graded.lastGrade).toBe("again");
    expect(graded.due).toBe(new Date(NOW).toISOString());
    // reps and introducedAt are untouched by a lapse.
    expect(graded.reps).toBe(3);
    expect(graded.introducedAt).toBe(state.introducedAt);
  });

  it("'Got it' advances one ladder step, bumps reps, and schedules due = now + interval days", () => {
    const state = introduceCardState(NOW); // interval 0
    const graded = gradeCardState(state, "good", NOW);
    expect(graded.interval).toBe(1);
    expect(graded.reps).toBe(1);
    expect(graded.lastGrade).toBe("good");
    expect(graded.due).toBe(new Date(NOW + 1 * DAY_MS).toISOString());
  });

  it("repeated 'Got it' grades walk the full ladder", () => {
    let state = introduceCardState(NOW);
    const expectedRungs = [1, 3, 7, 14, 30, 60, 60];
    for (const expected of expectedRungs) {
      state = gradeCardState(state, "good", NOW);
      expect(state.interval).toBe(expected);
    }
  });

  it("'Again' after several good grades still resets to step 0, not to the previous rung", () => {
    let state = introduceCardState(NOW);
    state = gradeCardState(state, "good", NOW); // -> 1
    state = gradeCardState(state, "good", NOW); // -> 3
    state = gradeCardState(state, "again", NOW);
    expect(state.interval).toBe(0);
    expect(state.lapses).toBe(1);
  });
});

describe("isDue", () => {
  it("is due exactly at its due timestamp", () => {
    const state = introduceCardState(NOW);
    expect(isDue(state, NOW)).toBe(true);
  });

  it("is not due before its due timestamp", () => {
    const state = gradeCardState(introduceCardState(NOW), "good", NOW); // due = NOW + 1 day
    expect(isDue(state, NOW)).toBe(false);
    expect(isDue(state, NOW + DAY_MS - 1000)).toBe(false);
  });

  it("becomes due once its due timestamp has passed", () => {
    const state = gradeCardState(introduceCardState(NOW), "good", NOW); // due = NOW + 1 day
    expect(isDue(state, NOW + DAY_MS)).toBe(true);
    expect(isDue(state, NOW + DAY_MS + 5000)).toBe(true);
  });
});

// --- Streak ----------------------------------------------------------------------

describe("bumpStreak", () => {
  it("starts a streak of 1 on the first-ever grade", () => {
    expect(bumpStreak(undefined, NOW)).toEqual({ count: 1, lastDay: dayKeyUTC(NOW) });
  });

  it("does not change on a second grade the same day", () => {
    const first = bumpStreak(undefined, NOW);
    const second = bumpStreak(first, NOW + 60_000);
    expect(second).toEqual(first);
  });

  it("increments when the previous study day was exactly yesterday", () => {
    const yesterday = bumpStreak(undefined, NOW - DAY_MS);
    const today = bumpStreak(yesterday, NOW);
    expect(today).toEqual({ count: 2, lastDay: dayKeyUTC(NOW) });
  });

  it("resets to 1 when a day (or more) was skipped", () => {
    const twoDaysAgo = bumpStreak(undefined, NOW - 2 * DAY_MS);
    const today = bumpStreak(twoDaysAgo, NOW);
    expect(today).toEqual({ count: 1, lastDay: dayKeyUTC(NOW) });
  });
});

// --- Card derivation ---------------------------------------------------------------

describe("deriveLiveCards", () => {
  it("produces a bubble card for a bubble with text, with a stable id", () => {
    const cards = deriveLiveCards(baseProject(), [bubble()], null, false);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ id: "bubble:11111111-1111-4111-8111-111111111111:b1", kind: "bubble", text: "Underhook first" });
  });

  it("excludes screenshot-only bubbles (empty/whitespace text)", () => {
    const cards = deriveLiveCards(baseProject(), [bubble({ text: "" }), bubble({ id: "b2", text: "   " })], null, false);
    expect(cards).toHaveLength(0);
  });

  it("produces a pearl card per pearl for a 'model'-source analysis", () => {
    const cards = deriveLiveCards(baseProject(), [], analysis(), false);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ id: "pearl:11111111-1111-4111-8111-111111111111:60", kind: "pearl", label: "Frame early" });
  });

  it("excludes a 'stub' analysis's pearls when stubAnalysesVisible is false (production)", () => {
    const cards = deriveLiveCards(baseProject(), [], analysis({ source: "stub" }), false);
    expect(cards).toHaveLength(0);
  });

  it("includes a 'stub' analysis's pearls when stubAnalysesVisible is true (dev)", () => {
    const cards = deriveLiveCards(baseProject(), [], analysis({ source: "stub" }), true);
    expect(cards).toHaveLength(1);
  });

  it("sorts the combined bubble+pearl output by timestamp", () => {
    const cards = deriveLiveCards(
      baseProject(),
      [bubble({ id: "late", t: 500, text: "late note" })],
      analysis({ pearls: [{ t: 10, label: "early pearl", insight: "x", importance: 1 }] }),
      false
    );
    expect(cards.map((c) => c.t)).toEqual([10, 500]);
  });
});

// --- Grade body validation --------------------------------------------------------

describe("GradeBodySchema", () => {
  it("accepts a valid grade body", () => {
    expect(GradeBodySchema.safeParse({ cardId: "bubble:p1:b1", grade: "again" }).success).toBe(true);
    expect(GradeBodySchema.safeParse({ cardId: "pearl:p1:60", grade: "good" }).success).toBe(true);
  });

  it("rejects an empty cardId", () => {
    expect(GradeBodySchema.safeParse({ cardId: "", grade: "good" }).success).toBe(false);
  });

  it("rejects a missing cardId", () => {
    expect(GradeBodySchema.safeParse({ grade: "good" }).success).toBe(false);
  });

  it("rejects an invalid grade value (hidden-mechanics surface: only again/good are ever valid)", () => {
    expect(GradeBodySchema.safeParse({ cardId: "bubble:p1:b1", grade: "easy" }).success).toBe(false);
    expect(GradeBodySchema.safeParse({ cardId: "bubble:p1:b1", grade: "AGAIN" }).success).toBe(false);
  });

  it("rejects a missing grade", () => {
    expect(GradeBodySchema.safeParse({ cardId: "bubble:p1:b1" }).success).toBe(false);
  });
});

// --- Queue derivation ---------------------------------------------------------------

function card(overrides: Partial<ReviewCard> = {}): ReviewCard {
  return {
    id: "bubble:p1:b1",
    kind: "bubble",
    projectId: "p1",
    projectTitle: "P1",
    sourceType: "local",
    sourcePath: "/videos/p1.mp4",
    t: 10,
    text: "note",
    shot: null,
    ...overrides,
  } as ReviewCard;
}

describe("buildReviewQueue — new-card introduction + daily cap", () => {
  it("introduces a brand-new card as due immediately", () => {
    const result = buildReviewQueue([card()], emptyReviewState(), NOW);
    expect(result.dueCards.map((c) => c.id)).toEqual(["bubble:p1:b1"]);
    expect(result.counts).toEqual({ due: 1, new: 1, total: 1 });
    expect(result.state.cards["bubble:p1:b1"].interval).toBe(0);
  });

  it("caps new-card introduction at the configured daily cap", () => {
    const liveCards = Array.from({ length: 25 }, (_, i) => card({ id: `bubble:p1:b${i}`, t: i }));
    const result = buildReviewQueue(liveCards, emptyReviewState(), NOW, 20);
    expect(result.counts.total).toBe(25);
    expect(result.counts.due).toBe(20);
    expect(result.counts.new).toBe(20);
    expect(Object.keys(result.state.cards)).toHaveLength(20);
  });

  it("does not re-introduce cards already introduced earlier the same day when computing remaining cap", () => {
    const liveCards = Array.from({ length: 25 }, (_, i) => card({ id: `bubble:p1:b${i}`, t: i }));
    const first = buildReviewQueue(liveCards.slice(0, 20), emptyReviewState(), NOW, 20);
    expect(Object.keys(first.state.cards)).toHaveLength(20);
    // Same day, all 25 live now — cap already spent, no more get introduced.
    const second = buildReviewQueue(liveCards, first.state, NOW + 60_000, 20);
    expect(Object.keys(second.state.cards)).toHaveLength(20);
    expect(second.counts.due).toBe(20);
  });

  it("frees up new-card capacity once the calendar day rolls over", () => {
    const liveCards = Array.from({ length: 25 }, (_, i) => card({ id: `bubble:p1:b${i}`, t: i }));
    const day1 = buildReviewQueue(liveCards, emptyReviewState(), NOW, 20);
    expect(Object.keys(day1.state.cards)).toHaveLength(20);
    const day2 = buildReviewQueue(liveCards, day1.state, NOW + DAY_MS, 20);
    // The remaining 5 get introduced on the new day; the original 20 are still tracked too.
    expect(Object.keys(day2.state.cards)).toHaveLength(25);
  });
});

describe("buildReviewQueue — orphan dropping", () => {
  it("drops a tracked card whose backing artifact no longer exists", () => {
    const priorState: ReviewState = {
      version: 1,
      cards: {
        "bubble:p1:b1": introduceCardState(NOW - DAY_MS),
        "bubble:p1:deleted": introduceCardState(NOW - DAY_MS),
      },
    };
    // Only "bubble:p1:b1" still exists as a live artifact this call.
    const result = buildReviewQueue([card({ id: "bubble:p1:b1" })], priorState, NOW);
    expect(Object.keys(result.state.cards)).toEqual(["bubble:p1:b1"]);
    expect(result.dueCards.map((c) => c.id)).toEqual(["bubble:p1:b1"]);
  });

  it("an orphaned card doesn't count against the daily new-card cap for its introduction day", () => {
    const priorState: ReviewState = {
      version: 1,
      cards: { "bubble:p1:gone": introduceCardState(NOW) },
    };
    const result = buildReviewQueue([card({ id: "bubble:p1:new" })], priorState, NOW, 1);
    // "gone" is dropped (orphan); cap of 1 is then fully available for "new".
    expect(Object.keys(result.state.cards)).toEqual(["bubble:p1:new"]);
  });
});

describe("buildReviewQueue — due math with an injected clock", () => {
  it("excludes a tracked card that isn't due yet", () => {
    const state = gradeCardState(introduceCardState(NOW), "good", NOW); // due = NOW + 1 day
    const priorState: ReviewState = { version: 1, cards: { "bubble:p1:b1": state } };
    const result = buildReviewQueue([card()], priorState, NOW + 1000);
    expect(result.dueCards).toHaveLength(0);
    expect(result.counts).toEqual({ due: 0, new: 0, total: 1 });
  });

  it("includes a tracked card once its due timestamp has passed", () => {
    const state = gradeCardState(introduceCardState(NOW), "good", NOW); // due = NOW + 1 day
    const priorState: ReviewState = { version: 1, cards: { "bubble:p1:b1": state } };
    const result = buildReviewQueue([card()], priorState, NOW + DAY_MS + 1000);
    expect(result.dueCards.map((c) => c.id)).toEqual(["bubble:p1:b1"]);
  });

  it("counts.new only reflects cards never graded (reps 0, no lastGrade), not every due card", () => {
    const graded = gradeCardState(introduceCardState(NOW - DAY_MS), "again", NOW - 1000); // due immediately, but not "new"
    const priorState: ReviewState = { version: 1, cards: { "bubble:p1:reviewed": graded } };
    const result = buildReviewQueue(
      [card({ id: "bubble:p1:reviewed" }), card({ id: "bubble:p1:fresh", t: 99 })],
      priorState,
      NOW
    );
    expect(result.counts.due).toBe(2);
    expect(result.counts.new).toBe(1); // only "fresh" (just introduced this call)
  });
});

describe("buildReviewQueue — output order is stable and matches liveCards order", () => {
  it("preserves liveCards order in the returned due list", () => {
    const liveCards = [card({ id: "a", t: 3 }), card({ id: "b", t: 1 }), card({ id: "c", t: 2 })];
    const result = buildReviewQueue(liveCards, emptyReviewState(), NOW);
    expect(result.dueCards.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });
});
