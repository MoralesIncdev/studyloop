// V3-C C1 "Concept Continuity rail" (SPEC/PEDAGOGY.md §6): pure scorer,
// pre-authored by the kimi seat and integrated here. Orchestration (fetching
// related/conceptSearches from Innertube, persisting teacherScores.json,
// wiring gapFill from analysis output) lives in server/src/lib/continuityService.ts
// and server/src/routes/continuity.ts — this file stays dependency-free and
// side-effect-free so it's directly unit-testable.
//
// Integration fix (V3-C review): mergeCandidates() below originally kept only
// the FIRST occurrence's fields (title/author/channelId/duration/thumbnail)
// for a videoId seen across multiple sources (e.g. present in `related` with
// sparse metadata, then again in a conceptSearches result with a richer
// channelId) — later, richer data was silently discarded, and `channelId`
// missing from the first-seen source alone could fall getChannel() back to
// `author` (a mismatched teacher-validation cache key) even when a later
// source in the very same call had the real channelId. mergeCandidates now
// backfills any undefined field from later occurrences instead of only ever
// taking the first.

/**
 * Stopwords removed when tokenising titles and gap-concept strings.
 */
const STOPWORDS = new Set<string>([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of",
  "with", "by", "from", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could", "should",
  "may", "might", "can", "shall", "this", "that", "these", "those", "it", "its",
  "as", "about", "into", "over", "under", "again", "further", "then", "once",
  "here", "there", "when", "where", "why", "how", "all", "each", "every",
  "both", "few", "more", "most", "other", "some", "such", "no", "nor", "not",
  "only", "own", "same", "so", "than", "too", "very", "just", "now",
]);

/**
 * A candidate educational video.
 */
export interface Candidate {
  videoId: string;
  title: string;
  author: string;
  channelId?: string;
  durationSeconds?: number;
  thumbnailUrl?: string;
}

/**
 * Inputs required to score a set of candidate videos for conceptual continuity.
 */
export interface ScoreInputs {
  /** Videos that are directly related to the current context, ordered by rank. */
  related: Candidate[];
  /** Concept searches, each with its ordered result list. */
  conceptSearches: { query: string; results: Candidate[] }[];
  /** Prior teacher-validation scores, expected to be in the range [0, 10]. */
  teacherScores: Record<string, number>;
  /** Concepts the learner still needs to cover. */
  gapConcepts: string[];
}

/**
 * Weight applied to each scoring component.
 */
export interface Weights {
  related: number;
  conceptSearch: number;
  teacherValidation: number;
  gapFill: number;
}

/**
 * A candidate decorated with its continuity score and the reasons behind it.
 */
export type ScoredCandidate = Candidate & {
  score: number;
  reasons: string[];
};

type ConceptHit = {
  queryIndex: number;
  rank: number;
};

type MergedCandidate = Candidate & {
  relatedRank?: number;
  conceptHits: ConceptHit[];
};

/**
 * Normalise a raw rank (0-indexed) to a score in (0, 1].
 * Rank 0 yields 1, rank 1 yields 0.5, etc.
 */
function normaliseRank(rank: number): number {
  return 1 / (rank + 1);
}

/**
 * Extract a stable channel identifier for scoring. Falls back to the author
 * name when a channelId is not available.
 */
function getChannel(c: Candidate): string {
  return c.channelId ?? c.author;
}

/**
 * Tokenise a string into a set of lowercase, stopword-filtered tokens.
 */
function tokenise(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 0 && !STOPWORDS.has(token)),
  );
}

/**
 * Build a deduplicated set of candidates keyed by videoId, merging all signal
 * sources (related list + concept-search results) into a single record.
 */
/**
 * Backfills any undefined metadata field on `existing` from a newly-seen
 * occurrence of the same candidate — first-seen data wins when present, but
 * a field left undefined by an earlier (sparser) source is filled in by a
 * later, richer one rather than staying permanently blank for the call.
 */
function enrichCandidate(existing: MergedCandidate, seen: Candidate): void {
  if (existing.channelId === undefined && seen.channelId !== undefined) existing.channelId = seen.channelId;
  if (existing.durationSeconds === undefined && seen.durationSeconds !== undefined) {
    existing.durationSeconds = seen.durationSeconds;
  }
  if (existing.thumbnailUrl === undefined && seen.thumbnailUrl !== undefined) existing.thumbnailUrl = seen.thumbnailUrl;
  if (!existing.author && seen.author) existing.author = seen.author;
}

function mergeCandidates(inputs: ScoreInputs): MergedCandidate[] {
  const byId = new Map<string, MergedCandidate>();

  inputs.related.forEach((candidate, rank) => {
    const existing = byId.get(candidate.videoId);
    if (existing) {
      if (existing.relatedRank === undefined) {
        existing.relatedRank = rank;
      }
      enrichCandidate(existing, candidate);
    } else {
      byId.set(candidate.videoId, {
        ...candidate,
        conceptHits: [],
        relatedRank: rank,
      });
    }
  });

  inputs.conceptSearches.forEach((search, queryIndex) => {
    search.results.forEach((candidate, rank) => {
      const existing = byId.get(candidate.videoId);
      if (existing) {
        existing.conceptHits.push({ queryIndex, rank });
        enrichCandidate(existing, candidate);
      } else {
        byId.set(candidate.videoId, {
          ...candidate,
          conceptHits: [{ queryIndex, rank }],
        });
      }
    });
  });

  return Array.from(byId.values());
}

/**
 * Compute the concept-search component for a candidate.
 * Uses the best normalised rank across any query and adds a small bonus for
 * appearing in additional queries.
 */
function computeConceptScore(
  hits: ConceptHit[],
  searches: { query: string; results: Candidate[] }[],
): { score: number; reasons: string[] } {
  if (hits.length === 0 || searches.length === 0) {
    return { score: 0, reasons: [] };
  }

  const bestRankByQuery = new Map<number, number>();
  for (const hit of hits) {
    const current = bestRankByQuery.get(hit.queryIndex);
    if (current === undefined || hit.rank < current) {
      bestRankByQuery.set(hit.queryIndex, hit.rank);
    }
  }

  let bestNormalised = 0;
  const reasons: string[] = [];
  for (const [queryIndex, rank] of bestRankByQuery) {
    const normalised = normaliseRank(rank);
    if (normalised > bestNormalised) {
      bestNormalised = normalised;
    }
    reasons.push(`teaches ${searches[queryIndex].query}`);
  }

  const extraQueries = bestRankByQuery.size - 1;
  const bonus = extraQueries > 0 ? Math.min(0.5, extraQueries * 0.08) : 0;

  return { score: Math.min(1, bestNormalised + bonus), reasons };
}

/**
 * Compute the teacher-validation component for a candidate.
 * Channels that appear in the results of at least two distinct concept queries
 * receive a validation boost (count / totalQueries). This is combined with the
 * prior teacherScores map, which is normalised from a [0, 10] scale to [0, 1].
 */
function computeTeacherScore(
  candidate: MergedCandidate,
  inputs: ScoreInputs,
): { score: number; count: number; reason?: string } {
  const totalQueries = inputs.conceptSearches.length;
  if (totalQueries === 0) {
    const prior = Math.min(1, (inputs.teacherScores[getChannel(candidate)] ?? 0) / 10);
    return {
      score: prior,
      count: 0,
      reason: prior > 0 ? "channel has prior teacher validation" : undefined,
    };
  }

  const channel = getChannel(candidate);
  const queryIndices = new Set<number>();

  inputs.conceptSearches.forEach((search, queryIndex) => {
    if (search.results.some((result) => getChannel(result) === channel)) {
      queryIndices.add(queryIndex);
    }
  });

  const count = queryIndices.size;
  const currentValidation = count >= 2 ? count / totalQueries : 0;
  const prior = Math.min(1, (inputs.teacherScores[channel] ?? 0) / 10);
  const score = Math.min(1, currentValidation + prior);

  let reason: string | undefined;
  if (count >= 2) {
    reason = `channel ranks for ${count} of your topics`;
  } else if (prior > 0) {
    reason = "channel has prior teacher validation";
  }

  return { score, count, reason };
}

/**
 * Compute the gap-fill component for a candidate.
 * Measures token overlap between the title and each gap concept, averaged
 * across concepts. The overlap is intersection / min(titleTokens, conceptTokens).
 */
function computeGapScore(
  candidate: Pick<Candidate, "title">,
  gapConcepts: string[],
): { score: number; reasons: string[] } {
  if (!candidate.title || gapConcepts.length === 0) {
    return { score: 0, reasons: [] };
  }

  const titleTokens = tokenise(candidate.title);
  if (titleTokens.size === 0) {
    return { score: 0, reasons: [] };
  }

  let totalOverlap = 0;
  const reasons: string[] = [];

  for (const concept of gapConcepts) {
    const conceptTokens = tokenise(concept);
    if (conceptTokens.size === 0) {
      continue;
    }

    const intersection = new Set(
      Array.from(conceptTokens).filter((token) => titleTokens.has(token)),
    );
    if (intersection.size === 0) {
      continue;
    }

    const overlap =
      intersection.size / Math.min(conceptTokens.size, titleTokens.size);
    totalOverlap += overlap;
    reasons.push(`fills gap: ${concept}`);
  }

  const score =
    gapConcepts.length > 0 ? totalOverlap / gapConcepts.length : 0;
  return { score: Math.min(1, score), reasons };
}

/**
 * Convert the internal merged record back to a plain Candidate.
 */
function toCandidate(candidate: MergedCandidate): Candidate {
  const base: Candidate = {
    videoId: candidate.videoId,
    title: candidate.title,
    author: candidate.author,
  };
  if (candidate.channelId !== undefined) base.channelId = candidate.channelId;
  if (candidate.durationSeconds !== undefined)
    base.durationSeconds = candidate.durationSeconds;
  if (candidate.thumbnailUrl !== undefined)
    base.thumbnailUrl = candidate.thumbnailUrl;
  return base;
}

/**
 * Score a single merged candidate.
 */
function scoreOne(
  candidate: MergedCandidate,
  inputs: ScoreInputs,
  weights: Weights,
): ScoredCandidate {
  const reasons: string[] = [];
  let score = 0;

  if (candidate.relatedRank !== undefined) {
    const relatedScore = normaliseRank(candidate.relatedRank);
    score += relatedScore * weights.related;
    reasons.push("related to current video");
  }

  const concept = computeConceptScore(
    candidate.conceptHits,
    inputs.conceptSearches,
  );
  if (concept.score > 0) {
    score += concept.score * weights.conceptSearch;
    reasons.push(...concept.reasons);
  }

  const teacher = computeTeacherScore(candidate, inputs);
  if (teacher.score > 0 && teacher.reason) {
    score += teacher.score * weights.teacherValidation;
    reasons.push(teacher.reason);
  }

  const gap = computeGapScore(candidate, inputs.gapConcepts);
  if (gap.score > 0) {
    score += gap.score * weights.gapFill;
    reasons.push(...gap.reasons);
  }

  return { ...toCandidate(candidate), score, reasons };
}

/**
 * Score a set of candidates for concept continuity.
 *
 * - Deduplicates candidates by videoId before scoring.
 * - Applies weighted components for relatedness, concept-search rank,
 *   teacher validation, and gap-fill overlap.
 * - Returns candidates sorted by score descending, then by title ascending.
 *
 * @param inputs - Search results, prior teacher scores, and gap concepts.
 * @param weights - Component weights.
 * @returns Scored candidates with human-readable reasons.
 */
export function scoreCandidates(
  inputs: ScoreInputs,
  weights: Weights,
): ScoredCandidate[] {
  const merged = mergeCandidates(inputs);
  const scored = merged.map((candidate) =>
    scoreOne(candidate, inputs, weights),
  );

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.title.localeCompare(b.title);
  });

  return scored;
}

/** V3-C review fix #1: max distinct channels persisted in teacherScores.json — pruned to the top-scoring entries on every write so an ever-growing set of one-off channels can't grow the file unboundedly. */
export const MAX_TEACHER_SCORES = 200;

/** Keeps only the top `MAX_TEACHER_SCORES` entries by score (ties broken by channel key, for determinism) — a no-op (same reference) when already under the cap. */
function pruneTeacherScores(scores: Record<string, number>): Record<string, number> {
  const entries = Object.entries(scores);
  if (entries.length <= MAX_TEACHER_SCORES) return scores;
  entries.sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : a[0].localeCompare(b[0])));
  return Object.fromEntries(entries.slice(0, MAX_TEACHER_SCORES));
}

/**
 * Update teacher-validation scores based on channel presence across concept
 * searches.
 *
 * PEDAGOGY §6 / this scorer's own `computeTeacherScore` threshold: a channel
 * only earns a "prior validation" bonus once it recurs across >=2 DISTINCT
 * concept-query results — a channel appearing in just one query contributes
 * nothing to the persisted map (V3-C review finding #1: previously any
 * single-query appearance was persisted immediately, bypassing the >=2
 * threshold the live scorer itself enforces). Channels meeting the threshold
 * are incremented by their distinct-query count this call; the result is
 * capped per-channel at 10 and pruned to the top `MAX_TEACHER_SCORES` overall.
 *
 * @param prev - Existing teacher scores, expected to be in [0, 10].
 * @param conceptSearches - Concept searches with result lists. Callers are
 *   expected to have already filtered this to FRESHLY-fetched queries only
 *   (not 15min-cache hits) — see continuityService.ts's persistTeacherScoreUpdate —
 *   so repeatedly refreshing the same cached search results can't re-earn
 *   the bonus on every GET.
 * @returns Updated teacher scores.
 */
export function updateTeacherScores(
  prev: Record<string, number>,
  conceptSearches: { query: string; results: Candidate[] }[],
): Record<string, number> {
  const next: Record<string, number> = { ...prev };

  const queryCountByChannel = new Map<string, number>();
  conceptSearches.forEach((search) => {
    const counted = new Set<string>();
    search.results.forEach((candidate) => {
      const channel = getChannel(candidate);
      if (counted.has(channel)) return;
      counted.add(channel);
      queryCountByChannel.set(channel, (queryCountByChannel.get(channel) ?? 0) + 1);
    });
  });

  for (const [channel, count] of queryCountByChannel) {
    if (count < 2) continue;
    next[channel] = Math.min(10, (next[channel] ?? 0) + count);
  }

  return pruneTeacherScores(next);
}

// --- V3-C integration addition (not part of the kimi-authored module above) --
//
// SPEC C1: "local-video projects: section shows library-based suggestions
// only (same scorer, library items matched by concept-title overlap)".
// `scoreCandidates` above only ever scores candidates that appear in
// `inputs.related` or `inputs.conceptSearches[].results` — a local project
// has neither (no YouTube signal at all), so library items can't go through
// it directly. This reuses the exact same gap-fill component
// (`computeGapScore`, unchanged) rather than reimplementing the overlap math,
// which is what "same scorer" means here in practice.

/**
 * Scores a set of local-library candidates purely by gap-fill (title token
 * overlap against `gapConcepts`) — the only continuity signal available for
 * local-source projects. Zero-scoring candidates are dropped (SPEC: "hide
 * when empty"); ties break alphabetically, matching `scoreCandidates`.
 */
export function scoreGapFillOnly(
  candidates: readonly Candidate[],
  gapConcepts: readonly string[],
  gapFillWeight: number,
): ScoredCandidate[] {
  const scored: ScoredCandidate[] = candidates
    .map((candidate) => {
      const gap = computeGapScore(candidate, [...gapConcepts]);
      return { ...candidate, score: gap.score * gapFillWeight, reasons: gap.reasons };
    })
    .filter((c) => c.score > 0);

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.title.localeCompare(b.title);
  });

  return scored;
}
