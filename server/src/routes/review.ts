// F11 "Review Mode" (SPEC): GET /api/review/queue derives the due card set by
// joining bubbles + analysis pearls across every project against persisted
// scheduling state in review.json; POST /api/review/grade applies a grade and
// returns the next queue slice. All the actual scheduling/derivation logic
// lives in lib/review.ts (fully unit-tested there) — this file only does I/O
// and wires it together, matching this codebase's "routes stay thin" convention.
import type { FastifyInstance } from "fastify";
import { getConfig, resolveDataDir } from "../config.js";
import { AnalysisSchema, type Analysis } from "../lib/analysis.js";
import type { Project } from "../lib/models.js";
import {
  buildReviewQueue,
  bumpStreak,
  deriveLiveCards,
  GradeBodySchema,
  gradeCardState,
  type ReviewCard,
} from "../lib/review.js";
import { readReviewState, withReviewLock, writeReviewState } from "../lib/reviewStore.js";
import { analysisJsonPath, listProjectIds, readBubbles, readJsonIfExists, readProject } from "../lib/store.js";

/**
 * Dev-visibility parity with the web app's isAnalysisVisible()
 * (web/src/concepts/AnalysisSections.tsx): stub analyses
 * (STUDYLOOP_FAKE_ANALYSIS=1) are only surfaced as review cards outside a
 * production build, so a demo/dev session stays screenshottable without
 * leaking fake content into a real user's review deck.
 */
function stubAnalysesVisible(): boolean {
  return process.env.NODE_ENV !== "production";
}

async function loadLiveCards(dataDir: string): Promise<ReviewCard[]> {
  const ids = await listProjectIds(dataDir);
  const projects = (await Promise.all(ids.map((id) => readProject(dataDir, id)))).filter(
    (p): p is Project => p !== null
  );
  const stubVisible = stubAnalysesVisible();

  const cards: ReviewCard[] = [];
  for (const project of projects) {
    // eslint-disable-next-line no-await-in-loop -- local corpus is small; sequential keeps this simple (mirrors heatmap.ts's overlay loop)
    const bubbles = await readBubbles(dataDir, project.id);
    // eslint-disable-next-line no-await-in-loop
    const analysisRaw = await readJsonIfExists<unknown>(analysisJsonPath(dataDir, project.id));
    const analysisParsed = analysisRaw !== null ? AnalysisSchema.safeParse(analysisRaw) : null;
    const analysis: Analysis | null = analysisParsed?.success ? analysisParsed.data : null;
    cards.push(...deriveLiveCards(project, bubbles, analysis, stubVisible));
  }
  return cards;
}

export async function reviewRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/review/queue", async () => {
    const config = await getConfig();
    const dataDir = resolveDataDir(config);
    const liveCards = await loadLiveCards(dataDir);

    return withReviewLock(async () => {
      const priorState = await readReviewState(dataDir);
      const result = buildReviewQueue(liveCards, priorState, Date.now());
      await writeReviewState(dataDir, result.state);
      return { due: result.dueCards, counts: result.counts, streak: result.state.streak ?? null };
    });
  });

  app.post("/api/review/grade", async (request, reply) => {
    const parsed = GradeBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid grade body", details: parsed.error.flatten() });
    }

    const config = await getConfig();
    const dataDir = resolveDataDir(config);

    const graded = await withReviewLock(async () => {
      const state = await readReviewState(dataDir);
      const existing = state.cards[parsed.data.cardId];
      if (!existing) return null;
      const now = Date.now();
      const updatedCard = gradeCardState(existing, parsed.data.grade, now);
      const nextState = {
        ...state,
        cards: { ...state.cards, [parsed.data.cardId]: updatedCard },
        streak: bumpStreak(state.streak, now),
      };
      await writeReviewState(dataDir, nextState);
      return nextState;
    });
    if (!graded) return reply.status(404).send({ error: "Unknown review card" });

    // Recompute the queue against the post-grade state so the response
    // reflects the very latest schedule (an "Again" grade is due again
    // immediately, so it can legitimately reappear here) — same derivation
    // GET uses, just fed the already-updated state instead of re-reading it.
    const liveCards = await loadLiveCards(dataDir);
    const result = await withReviewLock(async () => {
      const queue = buildReviewQueue(liveCards, graded, Date.now());
      await writeReviewState(dataDir, queue.state);
      return queue;
    });
    return { due: result.dueCards, counts: result.counts, streak: result.state.streak ?? null };
  });
}
