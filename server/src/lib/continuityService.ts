// V3-C C1 "Concept Continuity rail" (SPEC/PEDAGOGY.md §6): orchestration
// layer around lib/continuity.ts's pure scorer — fetches related videos +
// concept-search results from Innertube (youtube projects) or matches
// against the local library by concept-title overlap (local projects),
// reads/writes `<dataDir>/teacherScores.json`, and degrades gracefully (no
// analysis yet, no key, Innertube unreachable) at every step rather than
// ever 500ing the rail.
import path from "node:path";
import type { LibraryItem } from "./scan.js";
import { searchYoutubeWithMeta, type RelatedVideo } from "./innertube.js";
import { scoreCandidates, scoreGapFillOnly, updateTeacherScores, type Candidate, type ScoredCandidate, type Weights } from "./continuity.js";
import { gapConceptsFromAttestations, topConceptTitles } from "./analysisAccess.js";
import {
  analysisJsonPath,
  projectDir,
  readJsonIfExists,
  readTeacherScores,
  writeTeacherScores,
  withTeacherScoresLock,
} from "./store.js";
import type { Project } from "./models.js";

/** `Project` narrowed to a youtube source — `Extract<Project, {...}>` doesn't narrow here because `Project` itself isn't a union (only its `source` field is), so this is a plain intersection instead. */
export type YoutubeProject = Project & { source: { type: "youtube"; videoId: string; url: string } };

/** Max concept-search queries per SPEC ("max 3 queries, cached 15min" — the 15min cache lives in innertube.ts's searchYoutube). */
export const MAX_CONCEPT_QUERIES = 3;
/** How many candidates each concept-search / related-video / library scan contributes, before scoring/truncation. */
const CANDIDATE_POOL_LIMIT = 12;
/** Final rail size. */
const RESULT_LIMIT = 12;

function attestationsJsonPath(dataDir: string, id: string): string {
  return path.join(projectDir(dataDir, id), "attestations.json");
}

function relatedVideoToCandidate(v: RelatedVideo): Candidate {
  return {
    videoId: v.videoId,
    title: v.title,
    author: v.author,
    durationSeconds: v.durationSeconds,
    thumbnailUrl: v.thumbnailUrl,
  };
}

export type ContinuityCandidateKind = "youtube" | "local";

export interface ContinuityCandidateOut {
  kind: ContinuityCandidateKind;
  videoId: string;
  title: string;
  author: string;
  durationSeconds?: number;
  thumbnailUrl?: string;
  /** Local-library suggestions only — lets the client open the project the same way search/library rows do. */
  videoPath?: string;
  transcriptPath?: string;
  score: number;
  reasons: string[];
}

/**
 * Reads the project's own gapConcepts hook (V3-B forward-compat; see
 * analysisAccess.ts) and top concept/theme titles for concept-search
 * queries — shared by both the youtube and local branches. Exported so
 * routes/continuity.ts can fetch `topConcepts` for the local branch
 * (continuityForLocalProject takes them as a plain argument rather than
 * re-reading analysis.json itself, so it stays a synchronous, dependency-free
 * function callable straight from a unit test).
 */
export async function loadOwnConceptSignals(
  dataDir: string,
  projectId: string
): Promise<{ topConcepts: string[]; gapConcepts: string[] }> {
  const analysisRaw = await readJsonIfExists<unknown>(analysisJsonPath(dataDir, projectId));
  const attestationsRaw = await readJsonIfExists<unknown>(attestationsJsonPath(dataDir, projectId));
  return {
    topConcepts: topConceptTitles(analysisRaw, MAX_CONCEPT_QUERIES),
    gapConcepts: gapConceptsFromAttestations(analysisRaw, attestationsRaw),
  };
}

interface ConceptSearchResult {
  query: string;
  results: Candidate[];
  /** True when this query's results came from innertube.ts's 15min searchCache rather than a fresh Innertube call this request. */
  fromCache: boolean;
}

async function runConceptSearches(queries: readonly string[]): Promise<ConceptSearchResult[]> {
  const searches = await Promise.all(
    queries.map(async (query) => {
      const { results, fromCache } = await searchYoutubeWithMeta(query, CANDIDATE_POOL_LIMIT);
      return { query, results: results.map(relatedVideoToCandidate), fromCache };
    })
  );
  // searchYoutube never throws (degrades to [] on any Innertube failure) —
  // queries that came back empty still count as "asked" for teacher-score
  // update purposes, but contribute no candidates/reasons.
  return searches;
}

/**
 * Persists teacher-validation increments for channels seen across this
 * call's concept searches (SPEC: "per-channel score cached in
 * teacherScores.json, decays never for v1"). V3-C review finding #1: only
 * FRESHLY-fetched queries (fromCache: false) ever reach updateTeacherScores —
 * repeatedly opening/refreshing a project within innertube.ts's 15min search
 * cache window must not re-earn the same "prior validation" bonus for
 * results that were already counted the first time they were fetched.
 * No-ops (returns the unchanged persisted map) when there's nothing fresh to
 * learn from — every query was a cache hit, or every fresh query came back
 * empty.
 */
async function persistTeacherScoreUpdate(
  dataDir: string,
  conceptSearches: readonly ConceptSearchResult[]
): Promise<Record<string, number>> {
  const fresh = conceptSearches.filter((s) => !s.fromCache);
  if (fresh.length === 0 || fresh.every((s) => s.results.length === 0)) {
    return readTeacherScores(dataDir);
  }
  return withTeacherScoresLock(async () => {
    const prev = await readTeacherScores(dataDir);
    const next = updateTeacherScores(prev, fresh);
    await writeTeacherScores(dataDir, next);
    return next;
  });
}

function toOut(kind: ContinuityCandidateKind, c: ScoredCandidate, extra?: { videoPath?: string; transcriptPath?: string }): ContinuityCandidateOut {
  return {
    kind,
    videoId: c.videoId,
    title: c.title,
    author: c.author,
    durationSeconds: c.durationSeconds,
    thumbnailUrl: c.thumbnailUrl,
    videoPath: extra?.videoPath,
    transcriptPath: extra?.transcriptPath,
    score: c.score,
    reasons: c.reasons,
  };
}

/**
 * Continuity candidates for a youtube-source project: related list +
 * concept-search results, scored + teacher-validated. Excludes the current
 * video itself. Never throws — every input source (related, concept
 * searches, teacherScores.json) degrades to empty/default on its own
 * failure, matching the rest of this codebase's "rail sections just show
 * fewer things" philosophy rather than surfacing a 500.
 */
export async function continuityForYoutubeProject(
  dataDir: string,
  project: YoutubeProject,
  weights: Weights
): Promise<ContinuityCandidateOut[]> {
  const { topConcepts, gapConcepts } = await loadOwnConceptSignals(dataDir, project.id);

  const related = (project.related ?? []).filter((v) => v.videoId !== project.source.videoId).map(relatedVideoToCandidate);
  const conceptSearches = await runConceptSearches(topConcepts);
  // Exclude the current video from every concept-search result too — it's
  // frequently the top hit for its own topic, which would otherwise
  // recommend the video the learner is already watching as "up next".
  const filteredConceptSearches = conceptSearches.map((s) => ({
    ...s,
    results: s.results.filter((c) => c.videoId !== project.source.videoId),
  }));

  const teacherScores = await persistTeacherScoreUpdate(dataDir, filteredConceptSearches);

  const scored = scoreCandidates({ related, conceptSearches: filteredConceptSearches, teacherScores, gapConcepts }, weights);
  return scored.slice(0, RESULT_LIMIT).map((c) => toOut("youtube", c));
}

/**
 * Continuity candidates for a local-source project: SPEC "local-video
 * projects: section shows library-based suggestions only (same scorer,
 * library items matched by concept-title overlap; hide when empty)". Reuses
 * the same gap-fill component (`scoreGapFillOnly`, see continuity.ts) the
 * youtube branch's `related`/`conceptSearch`/`teacherValidation` components
 * feed into — there's no YouTube signal at all for a local video, so gapFill
 * is the only continuity signal available.
 */
export function continuityForLocalProject(
  libraryItems: readonly LibraryItem[],
  ownVideoPath: string,
  topConcepts: readonly string[],
  weights: Weights
): ContinuityCandidateOut[] {
  if (topConcepts.length === 0) return [];
  const withPaths = libraryItems.filter((item) => item.videoPath !== ownVideoPath);
  const candidates: Candidate[] = withPaths.map((item) => ({
    videoId: item.videoPath,
    title: item.title,
    author: item.instructor ?? "Library",
  }));
  const byVideoId = new Map(withPaths.map((item) => [item.videoPath, item]));

  const scored = scoreGapFillOnly(candidates, topConcepts, weights.gapFill);
  return scored.slice(0, RESULT_LIMIT).map((c) => {
    const item = byVideoId.get(c.videoId);
    return toOut("local", c, { videoPath: item?.videoPath, transcriptPath: item?.transcriptPath });
  });
}
