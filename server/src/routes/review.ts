// F11 "Review Mode" (SPEC): GET /api/review/queue derives the due card set by
// joining bubbles + analysis pearls (+ V3-B B4: attested-unit generation
// cards) across every project against persisted scheduling state in
// review.json; POST /api/review/grade applies a grade and returns the next
// queue slice. All the actual scheduling/derivation logic lives in
// lib/review.ts (fully unit-tested there) — this file only does I/O and
// wires it together, matching this codebase's "routes stay thin" convention.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getConfig, resolveDataDir } from "../config.js";
import { missingCredentialMessage, resolveAnalysisModel, resolveProviderAuth } from "../lib/providers.js";
import { AnalysisSchema, type Analysis } from "../lib/analysis.js";
import { readAttestations } from "../lib/attestationStore.js";
import {
  attachTransforms,
  fillTransformCache,
  hashCardTransformInput,
  isWeakBubbleText,
  resolveCardTransformClient,
  withTransformResult,
  type CardTransformInput,
} from "../lib/cardTransform.js";
import { getLens } from "../lib/lenses.js";
import type { Project } from "../lib/models.js";
import { readPearlReviewAdds } from "../lib/pearlReviewStore.js";
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
    // eslint-disable-next-line no-await-in-loop
    const pearlReviewAdds = await readPearlReviewAdds(dataDir, project.id);

    const liveCards = deriveLiveCards(project, bubbles, analysis, stubVisible, attestations, pearlReviewAdds);
    cards.push(...liveCards);

    if (analysis?.version === 3) {
      // V3-D D4: routes the transformation prompt's question style by the
      // owning project's domain (see lib/cardTransform.ts's
      // CARD_TRANSFORM_DOMAIN_MODULES) — undefined domain (a v3 analysis
      // whose router call was skipped) falls back to the generic style.
      //
      // Phase 5 "Lens registry": also resolves the active lens's
      // `questionStyle` ("nclex" for the clinical lens, "default" otherwise)
      // — an additional dispatch layer cardTransform.ts uses ON TOP OF the
      // domain-flavored text above. For pearl cards specifically, also
      // resolves the linked unit's type (via `pearl.unitId`, matched back to
      // its original pearl by timestamp — pearl card ids are already
      // `pearl:${projectId}:${p.t}`, so `t` is a stable join key within one
      // project's analysis) so the "nclex" dispatch can distinguish the
      // scenario-option framing from the exact-value framing.
      const domain = analysis.domain;
      const questionStyle = domain ? getLens(dataDir, domain)?.questionStyle : undefined;
      const unitsById = new Map((analysis.units ?? []).map((u) => [u.id, u]));
      const pearlByT = new Map(analysis.pearls.map((p) => [p.t, p]));
      for (const c of liveCards) {
        if (c.kind === "bubble" && isWeakBubbleText(c.text)) {
          transformCandidates.set(c.id, { quote: c.text, note: "", kind: "bubble", domain, questionStyle });
        } else if (c.kind === "pearl") {
          const sourcePearl = pearlByT.get(c.t);
          const unitType = sourcePearl?.unitId ? unitsById.get(sourcePearl.unitId)?.type : undefined;
          transformCandidates.set(c.id, { quote: c.insight, note: c.label, kind: "pearl", domain, questionStyle, unitType });
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
    const model = resolveAnalysisModel(config);
    const client = resolveCardTransformClient(resolveProviderAuth(config));

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
    const model = resolveAnalysisModel(config);

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
    const client = resolveCardTransformClient(resolveProviderAuth(config));
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

  // V3-D D4 "improve this card": explicit regeneration, bypassing
  // fillTransformCache's "skip if already cached" policy — requires an API
  // key (or fake mode; resolveCardTransformClient's own priority order)
  // since this is a deliberate user action, not the passive cache-fill GET
  // /grade already do. Scoped to bubble/pearl cards only (the only kinds
  // with a transformCandidates entry at all — unit cards' fronts are
  // client-composed "your take" prompts, nothing to regenerate here).
  const ImproveParamsSchema = z.object({ cardId: z.string().min(1) });
  app.post("/api/review/cards/:cardId/improve", async (request, reply) => {
    const params = ImproveParamsSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid cardId" });

    const config = await getConfig();
    const dataDir = resolveDataDir(config);
    const model = resolveAnalysisModel(config);
    const client = resolveCardTransformClient(resolveProviderAuth(config));
    if (!client) {
      return reply.status(400).send({ error: `${missingCredentialMessage(config)}`, code: "no_api_key" });
    }

    const { cards: liveCards, transformCandidates } = await loadLiveCards(dataDir);
    if (!liveCards.some((c) => c.id === params.data.cardId)) {
      return reply.status(404).send({ error: "Unknown review card" });
    }
    const candidate = transformCandidates.get(params.data.cardId);
    if (!candidate) {
      return reply.status(400).send({ error: "This card can't be regenerated", code: "not_transformable" });
    }

    const outcome = await client.transform(candidate, model);
    if (outcome.kind !== "ok") {
      return reply.status(502).send({ error: `Could not regenerate this card: ${outcome.detail}`, code: outcome.reason });
    }

    // Stamp the fresh entry with its current sourceHash (V3-B review fix #2
    // x V3-D D4 merge) — otherwise the next passive queue load would see a
    // hash-less entry, treat it as pre-migration, and silently regenerate
    // it again, undoing this explicit "improve" action.
    const freshEntry = { ...outcome.data, sourceHash: hashCardTransformInput(candidate) };
    const nextState = await withReviewLock(async () => {
      const state = await readReviewState(dataDir);
      const updated = { ...state, transformed: withTransformResult(state.transformed ?? {}, params.data.cardId, freshEntry) };
      await writeReviewState(dataDir, updated);
      return updated;
    });

    return { transformed: nextState.transformed?.[params.data.cardId] ?? null };
  });
}
