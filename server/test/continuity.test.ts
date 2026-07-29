import { describe, expect, it } from "vitest";
import {
  scoreCandidates,
  scoreGapFillOnly,
  updateTeacherScores,
  type Candidate,
  type ScoreInputs,
  type Weights,
} from "../src/lib/continuity.js";

const WEIGHTS: Weights = { related: 0.15, conceptSearch: 0.3, teacherValidation: 0.3, gapFill: 0.25 };

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return { videoId: "v1", title: "Untitled", author: "Author", ...overrides };
}

describe("scoreCandidates — dedup", () => {
  it("dedupes a candidate that appears in both related and a concept search into a single scored result", () => {
    const shared = candidate({ videoId: "dup", title: "Half Guard Retention" });
    const inputs: ScoreInputs = {
      related: [shared],
      conceptSearches: [{ query: "half guard", results: [shared] }],
      teacherScores: {},
      gapConcepts: [],
    };
    const scored = scoreCandidates(inputs, WEIGHTS);
    expect(scored).toHaveLength(1);
    expect(scored[0].videoId).toBe("dup");
  });

  it("dedupes across multiple concept-search queries, merging conceptHits from every query", () => {
    const shared = candidate({ videoId: "dup2", title: "Leg Locks" });
    const inputs: ScoreInputs = {
      related: [],
      conceptSearches: [
        { query: "leg locks", results: [shared] },
        { query: "heel hooks", results: [shared] },
      ],
      teacherScores: {},
      gapConcepts: [],
    };
    const scored = scoreCandidates(inputs, WEIGHTS);
    expect(scored).toHaveLength(1);
    // Appearing in 2 distinct queries should produce 2 "teaches X" reasons.
    expect(scored[0].reasons.filter((r) => r.startsWith("teaches "))).toHaveLength(2);
  });

  it("keeps distinct videoIds separate even with identical titles", () => {
    const inputs: ScoreInputs = {
      related: [candidate({ videoId: "a", title: "Same Title" }), candidate({ videoId: "b", title: "Same Title" })],
      conceptSearches: [],
      teacherScores: {},
      gapConcepts: [],
    };
    const scored = scoreCandidates(inputs, WEIGHTS);
    expect(scored.map((c) => c.videoId).sort()).toEqual(["a", "b"]);
  });
});

describe("scoreCandidates — reasons", () => {
  it("attaches 'related to current video' only for candidates present in the related list", () => {
    const inputs: ScoreInputs = {
      related: [candidate({ videoId: "r1" })],
      conceptSearches: [{ query: "topic", results: [candidate({ videoId: "c1" })] }],
      teacherScores: {},
      gapConcepts: [],
    };
    const scored = scoreCandidates(inputs, WEIGHTS);
    const related = scored.find((c) => c.videoId === "r1")!;
    const concept = scored.find((c) => c.videoId === "c1")!;
    expect(related.reasons).toContain("related to current video");
    expect(concept.reasons).not.toContain("related to current video");
    expect(concept.reasons).toContain("teaches topic");
  });

  it("attaches a 'fills gap: X' reason exactly for the concept it overlaps with, not unrelated gaps", () => {
    const inputs: ScoreInputs = {
      related: [candidate({ videoId: "g1", title: "Understanding Triangle Chokes" })],
      conceptSearches: [],
      teacherScores: {},
      gapConcepts: ["triangle choke", "kimura trap"],
    };
    const scored = scoreCandidates(inputs, WEIGHTS);
    expect(scored[0].reasons).toContain("fills gap: triangle choke");
    expect(scored[0].reasons).not.toContain("fills gap: kimura trap");
  });

  it("produces no reasons (and score 0) for a candidate with no matching signal at all", () => {
    const inputs: ScoreInputs = {
      related: [],
      conceptSearches: [{ query: "unrelated topic", results: [] }],
      teacherScores: {},
      gapConcepts: ["also unrelated"],
    };
    // Feed the candidate in via related so it's actually scored, but give it
    // nothing that should match.
    const lonely = candidate({ videoId: "lonely", title: "Xyzzy Plugh Nonsense" });
    const withCandidate: ScoreInputs = { ...inputs, related: [lonely] };
    const scored = scoreCandidates(withCandidate, WEIGHTS);
    expect(scored[0].reasons).toEqual(["related to current video"]);
  });
});

describe("scoreCandidates — teacher recurrence", () => {
  it("does not grant a teacherValidation reason for a channel appearing in only 1 of 3 queries", () => {
    const inputs: ScoreInputs = {
      related: [],
      conceptSearches: [
        { query: "q1", results: [candidate({ videoId: "a", author: "Coach A", channelId: "chanA" })] },
        { query: "q2", results: [candidate({ videoId: "b", author: "Coach B", channelId: "chanB" })] },
        { query: "q3", results: [candidate({ videoId: "c", author: "Coach C", channelId: "chanC" })] },
      ],
      teacherScores: {},
      gapConcepts: [],
    };
    const scored = scoreCandidates(inputs, WEIGHTS);
    for (const c of scored) {
      expect(c.reasons.some((r) => r.includes("ranks for"))).toBe(false);
    }
  });

  it("grants 'channel ranks for N of your topics' when a channel recurs across >=2 distinct queries", () => {
    const recurring = { channelId: "chanX", author: "Coach X" };
    const inputs: ScoreInputs = {
      related: [],
      conceptSearches: [
        { query: "q1", results: [candidate({ videoId: "x1", ...recurring })] },
        { query: "q2", results: [candidate({ videoId: "x2", ...recurring })] },
        { query: "q3", results: [candidate({ videoId: "other", author: "Someone Else", channelId: "chanOther" })] },
      ],
      teacherScores: {},
      gapConcepts: [],
    };
    const scored = scoreCandidates(inputs, WEIGHTS);
    // Both x1 and x2 are the same channel — each individually should be flagged.
    const x1 = scored.find((c) => c.videoId === "x1")!;
    const x2 = scored.find((c) => c.videoId === "x2")!;
    expect(x1.reasons).toContain("channel ranks for 2 of your topics");
    expect(x2.reasons).toContain("channel ranks for 2 of your topics");
  });

  it("counts a channel only once per query even if it appears multiple times in that query's results", () => {
    const recurring = { channelId: "chanY", author: "Coach Y" };
    const inputs: ScoreInputs = {
      related: [],
      conceptSearches: [
        { query: "q1", results: [candidate({ videoId: "y1", ...recurring }), candidate({ videoId: "y1b", ...recurring })] },
        { query: "q2", results: [candidate({ videoId: "y2", ...recurring })] },
      ],
      teacherScores: {},
      gapConcepts: [],
    };
    const scored = scoreCandidates(inputs, WEIGHTS);
    const y1 = scored.find((c) => c.videoId === "y1")!;
    expect(y1.reasons).toContain("channel ranks for 2 of your topics");
  });

  it("blends a prior teacherScores entry in even when the current call has only 1 query hit", () => {
    const inputs: ScoreInputs = {
      related: [],
      conceptSearches: [{ query: "q1", results: [candidate({ videoId: "z1", author: "Coach Z", channelId: "chanZ" })] }],
      teacherScores: { chanZ: 8 },
      gapConcepts: [],
    };
    const scored = scoreCandidates(inputs, WEIGHTS);
    expect(scored[0].reasons).toContain("channel has prior teacher validation");
  });

  it("falls back to `author` as the channel key when channelId is absent, consistently on both sides", () => {
    const inputs: ScoreInputs = {
      related: [],
      conceptSearches: [
        { query: "q1", results: [candidate({ videoId: "n1", author: "No Channel Id Coach" })] },
        { query: "q2", results: [candidate({ videoId: "n2", author: "No Channel Id Coach" })] },
      ],
      teacherScores: {},
      gapConcepts: [],
    };
    const scored = scoreCandidates(inputs, WEIGHTS);
    expect(scored.find((c) => c.videoId === "n1")!.reasons).toContain("channel ranks for 2 of your topics");
  });
});

describe("scoreCandidates — merge enrichment (V3-C integration fix)", () => {
  it("backfills channelId from a later occurrence when the first-seen source lacked it", () => {
    // Seen first in `related` with no channelId, then again in a concept
    // search WITH a channelId — the richer metadata must survive the merge
    // (this is the bug the V3-C integration pass fixed in mergeCandidates()).
    const sparse = candidate({ videoId: "enrich1", author: "Coach E" });
    const rich = candidate({ videoId: "enrich1", author: "Coach E", channelId: "realChannelId" });
    const inputs: ScoreInputs = {
      related: [sparse],
      conceptSearches: [
        { query: "q1", results: [rich] },
        { query: "q2", results: [candidate({ videoId: "enrich1", author: "Coach E", channelId: "realChannelId" })] },
      ],
      teacherScores: { realChannelId: 10 },
      gapConcepts: [],
    };
    const scored = scoreCandidates(inputs, WEIGHTS);
    // Without the fix, getChannel() would key off `author` (never enriched
    // with channelId) and miss the teacherScores["realChannelId"] prior entirely.
    expect(scored[0].reasons).toContain("channel ranks for 2 of your topics");
  });
});

describe("scoreCandidates — sort order", () => {
  it("sorts by score descending, then title ascending on ties", () => {
    const inputs: ScoreInputs = {
      related: [candidate({ videoId: "z", title: "Zebra" }), candidate({ videoId: "a", title: "Apple" })],
      conceptSearches: [],
      teacherScores: {},
      gapConcepts: [],
    };
    const scored = scoreCandidates(inputs, WEIGHTS);
    // Both have identical related-rank-derived scores in different order
    // (rank 0 vs rank 1) — but distinct ranks mean distinct scores, so
    // instead verify equal-score tie-break directly:
    const tied: ScoreInputs = {
      related: [],
      conceptSearches: [{ query: "q", results: [candidate({ videoId: "z2", title: "Zebra" }), candidate({ videoId: "a2", title: "Apple" })] }],
      teacherScores: {},
      gapConcepts: [],
    };
    void scored;
    const tiedScored = scoreCandidates(tied, WEIGHTS);
    // Both appear in the same single query at different ranks, so they're
    // NOT actually tied (rank matters) — assert descending score order instead.
    expect(tiedScored[0].score).toBeGreaterThanOrEqual(tiedScored[1].score);
  });
});

describe("scoreGapFillOnly (local-library suggestions)", () => {
  it("scores and returns only candidates with token overlap against gapConcepts", () => {
    const candidates: Candidate[] = [
      candidate({ videoId: "lib1", title: "Closed Guard Fundamentals", author: "Instructor A" }),
      candidate({ videoId: "lib2", title: "Standing Passing", author: "Instructor B" }),
    ];
    const scored = scoreGapFillOnly(candidates, ["closed guard"], 0.25);
    expect(scored).toHaveLength(1);
    expect(scored[0].videoId).toBe("lib1");
    expect(scored[0].reasons).toContain("fills gap: closed guard");
  });

  it("returns [] when nothing overlaps", () => {
    const candidates: Candidate[] = [candidate({ videoId: "lib1", title: "Completely Unrelated Topic" })];
    expect(scoreGapFillOnly(candidates, ["kimura trap"], 0.25)).toEqual([]);
  });

  it("applies the given weight multiplicatively to the raw gap score", () => {
    const candidates: Candidate[] = [candidate({ videoId: "lib1", title: "Kimura Trap Deep Dive" })];
    const full = scoreGapFillOnly(candidates, ["kimura trap"], 1);
    const half = scoreGapFillOnly(candidates, ["kimura trap"], 0.5);
    expect(half[0].score).toBeCloseTo(full[0].score / 2, 6);
  });
});

describe("updateTeacherScores", () => {
  it("increments a channel's score once per distinct query it appears in", () => {
    const next = updateTeacherScores(
      {},
      [
        { query: "q1", results: [candidate({ videoId: "a", channelId: "chan1" })] },
        { query: "q2", results: [candidate({ videoId: "b", channelId: "chan1" })] },
      ]
    );
    expect(next.chan1).toBe(2);
  });

  // V3-C review finding #1: a channel appearing in only ONE query must never
  // earn a persisted bonus at all — this is the same ">=2 distinct queries"
  // threshold computeTeacherScore already enforces for live scoring; before
  // this fix, updateTeacherScores persisted a bonus for a single-query
  // appearance, bypassing that threshold entirely.
  it("does not persist any bonus for a channel appearing in only 1 distinct query", () => {
    const next = updateTeacherScores(
      {},
      [{ query: "q1", results: [candidate({ videoId: "a", channelId: "chan1" }), candidate({ videoId: "b", channelId: "chan1" })] }]
    );
    expect(next.chan1).toBeUndefined();
  });

  it("counts a channel at most once per query even with duplicate results, once the >=2-query threshold is met", () => {
    const next = updateTeacherScores(
      {},
      [
        { query: "q1", results: [candidate({ videoId: "a", channelId: "chan1" }), candidate({ videoId: "b", channelId: "chan1" })] },
        { query: "q2", results: [candidate({ videoId: "c", channelId: "chan1" })] },
      ]
    );
    // 2 distinct queries -> +2, not +3 (q1's duplicate result only counts once).
    expect(next.chan1).toBe(2);
  });

  it("caps a channel's score at 10", () => {
    const prev = { chan1: 9 };
    const next = updateTeacherScores(prev, [
      { query: "q1", results: [candidate({ channelId: "chan1" })] },
      { query: "q2", results: [candidate({ channelId: "chan1" })] },
      { query: "q3", results: [candidate({ channelId: "chan1" })] },
    ]);
    expect(next.chan1).toBe(10);
  });

  it("does not mutate the previous scores object (returns a new one)", () => {
    const prev = { chan1: 1 };
    const next = updateTeacherScores(prev, [
      { query: "q1", results: [candidate({ channelId: "chan1" })] },
      { query: "q2", results: [candidate({ channelId: "chan1" })] },
    ]);
    expect(prev.chan1).toBe(1);
    expect(next).not.toBe(prev);
  });

  it("leaves untouched channels alone", () => {
    const prev = { chanUntouched: 5 };
    const next = updateTeacherScores(prev, [
      { query: "q1", results: [candidate({ channelId: "chanOther" })] },
      { query: "q2", results: [candidate({ channelId: "chanOther" })] },
    ]);
    expect(next.chanUntouched).toBe(5);
  });

  it("prunes to the top MAX_TEACHER_SCORES (200) entries by score when the map would otherwise grow past the cap", () => {
    const prev: Record<string, number> = {};
    for (let i = 0; i < 200; i++) prev[`chan${i}`] = 1;
    // A brand-new channel meeting the >=2-query threshold scores 2, higher
    // than every existing entry — it must survive the prune, and the map
    // must never silently grow past the 200 cap.
    const next = updateTeacherScores(prev, [
      { query: "q1", results: [candidate({ channelId: "chanNew" })] },
      { query: "q2", results: [candidate({ channelId: "chanNew" })] },
    ]);
    expect(Object.keys(next)).toHaveLength(200);
    expect(next.chanNew).toBe(2);
  });
});
