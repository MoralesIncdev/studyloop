// F11 "Review Mode" (SPEC): GET /api/review/queue derives the due card set by
// joining bubbles + analysis pearls (+ V3-B B4: attested-unit generation
// cards) across every project against persisted scheduling state in
// review.json; POST /api/review/grade applies a grade and returns the next
// queue slice. All the actual scheduling/derivation logic lives in
// lib/review.ts (fully unit-tested there) — this file only does I/O and
// wires it together, matching this codebase's "routes stay thin" convention.
import type { FastifyInstance } from "fastify";
import { getConfig, resolveDataDir } from "../config.js";
import { AnalysisSchema, type Analysis } from "../lib/analysis.js";
import { readAttestations } from "../lib/attestationStore.js";
import { attachTransforms, fillTransformCache, isWeakBubbleText, resolveCardTransformClient, type CardTransformInput } from "../lib/cardTransform.js";
import type { Project } from "../lib/models.js";
import {
  buildReviewQueue,
  bumpStreak,
  deriveLiveCards,
  GradeBodySchema,
  gradeCardState,
  masteryCount,
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

async function loadLiveCards(
  dataDir: string
): Promise<{ cards: ReviewCard[]; transformCandidates: Map<string, CardTransformInput> }> {
  const ids = await listProjectIds(dataDir);
  const projects = (await Promise.all(ids.map((id) => readProject(dataDir, id)))).filter(
    (p): p is Project => p !== null
  );
  const stubVisible = stubAnalysesVisible();

  const cards: ReviewCard[] = [];
  // V3-B B4 "Card transformation": eligible bubble/pearl card ids (v3
  // analysis present) mapped to the {quote, note, kind} the transform client
  // needs — computed here (not in lib/review.ts) since it needs each card's
  // owning project's analysis version, which deriveLiveCards' flat output
  // doesn't carry per-card.
  const transformCandidates = new Map<string, CardTransformInput>();

  for (const project of projects) {
    // eslint-disable-next-line no-await-in-loop -- local corpus is small; sequential keeps this simple (mirrors heatmap.ts's overlay loop)
    const bubbles = await readBubbles(dataDir, project.id);
    // eslint-disable-next-line no-await-in-loop
    const analysisRaw = await readJsonIfExists<unknown>(analysisJsonPath(dataDir, project.id));
    const analysisParsed = analysisRaw !== null ? AnalysisSchema.safeParse(analysisRaw) : null;
    const analysis: Analysis | null = analysisParsed?.success ? analysisParsed.data : null;
    // eslint-disable-next-line no-await-in-loop
    const attestations = await readAttestations(dataDir, project.id);

    const liveCards = deriveLiveCards(project, bubbles, analysis, stubVisible, attestations);
    cards.push(...liveCards);

    if (analysis?.version === 3) {
      for (const c of liveCards) {
        if (c.kind === "bubble" && isWeakBubbleText(c.text)) {
          transformCandidates.set(c.id, { quote: c.text, note: "", kind: "bubble" });
        } else if (c.kind === "pearl") {
          transformCandidates.set(c.id, { quote: c.insight, note: c.label, kind: "pearl" });
        }
      }
    }
  }

  return { cards, transformCandidates };
}

export async function reviewRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/review/queue", async () => {
    const config = await getConfig();
    const dataDir = resolveDataDir(config);
    const { cards: liveCards, transformCandidates } = await loadLiveCards(dataDir);
    const model = config.analysisModel ?? "claude-opus-5";
    const client = resolveCardTransformClient(config.anthropicApiKey);

    return withReviewLock(async () => {
      const priorState = await readReviewState(dataDir);
      const queue = buildReviewQueue(liveCards, priorState, Date.now());
      const transformed = await fillTransformCache(queue.state.transformed ?? {}, queue.dueCards, transformCandidates, client, model);
      const nextState = { ...queue.state, transformed };
      await writeReviewState(dataDir, nextState);
      return {
        due: attachTransforms(queue.dueCards, transformed),
        counts: queue.counts,
        streak: nextState.streak ?? null,
        masteryCount: masteryCount(nextState.cards),
      };
    });
  });

  app.post("/api/review/grade", async (request, reply) => {
    const parsed = GradeBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid grade body", details: parsed.error.flatten() });
    }

    const config = await getConfig();
    const dataDir = resolveDataDir(config);
    const model = config.analysisModel ?? "claude-opus-5";

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
    const { cards: liveCards, transformCandidates } = await loadLiveCards(dataDir);
    const client = resolveCardTransformClient(config.anthropicApiKey);
    const result = await withReviewLock(async () => {
      const queue = buildReviewQueue(liveCards, graded, Date.now());
      const transformed = await fillTransformCache(queue.state.transformed ?? {}, queue.dueCards, transformCandidates, client, model);
      const nextState = { ...queue.state, transformed };
      await writeReviewState(dataDir, nextState);
      return { queue, nextState };
    });
    return {
      due: attachTransforms(result.queue.dueCards, result.nextState.transformed),
      counts: result.queue.counts,
      streak: result.nextState.streak ?? null,
      masteryCount: masteryCount(result.nextState.cards),
    };
  });
}
