// Phase 7 "CSV export" (SPEC move 4, EXECUTION-PLAN-post-review-v1.md):
// GET /api/review/export.csv — an Anki-importable CSV snapshot of every
// due-or-tracked review card. This file only does I/O (reads every
// project's bubbles/analysis/attestations/pearlReviewAdds off disk, plus
// the persisted review.json state — same sources routes/review.ts's own
// GET /api/review/queue reads) and hands it to lib/review.ts's exported
// deriveLiveCards (read-only, never edited here) + lib/reviewExport.ts's
// pure CSV builder (fully unit-tested there) — matches this codebase's
// "routes stay thin" convention.
import type { FastifyInstance } from "fastify";
import { getConfig, resolveDataDir } from "../config.js";
import { AnalysisSchema, type Analysis } from "../lib/analysis.js";
import { readAttestations } from "../lib/attestationStore.js";
import type { Project } from "../lib/models.js";
import { readPearlReviewAdds } from "../lib/pearlReviewStore.js";
import { deriveLiveCards, type ReviewCard } from "../lib/review.js";
import { buildReviewExportCsv } from "../lib/reviewExport.js";
import { readReviewState } from "../lib/reviewStore.js";
import { analysisJsonPath, listProjectIds, readBubbles, readJsonIfExists, readProject } from "../lib/store.js";

/**
 * Dev-visibility parity with routes/review.ts's own stubAnalysesVisible()
 * (and web/src/concepts/AnalysisSections.tsx's isAnalysisVisible()) — kept
 * as its own copy rather than importing a private helper from review.ts
 * (nothing there is exported for this), same one-line rule: stub analyses
 * (STUDYLOOP_FAKE_ANALYSIS=1) only surface outside a production build.
 */
function stubAnalysesVisible(): boolean {
  return process.env.NODE_ENV !== "production";
}

async function loadLiveCardsWithDomains(
  dataDir: string
): Promise<{ cards: ReviewCard[]; domains: Map<string, string> }> {
  const ids = await listProjectIds(dataDir);
  const projects = (await Promise.all(ids.map((id) => readProject(dataDir, id)))).filter(
    (p): p is Project => p !== null
  );
  const stubVisible = stubAnalysesVisible();

  const cards: ReviewCard[] = [];
  const domains = new Map<string, string>();

  for (const project of projects) {
    // eslint-disable-next-line no-await-in-loop -- local corpus is small; sequential mirrors routes/review.ts's own loadLiveCards
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
    // V3-B B1: domain is a v3-analysis-only field (absent on v2/no-analysis
    // projects) — the CSV's `domain:` tag is simply omitted for those cards
    // (see lib/reviewExport.ts's buildTags), same "absent means no tag"
    // treatment as unitType for bubble/pearl cards.
    if (analysis?.domain) domains.set(project.id, analysis.domain);
  }

  return { cards, domains };
}

export async function reviewExportRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/review/export.csv", async (_request, reply) => {
    const config = await getConfig();
    const dataDir = resolveDataDir(config);
    const { cards: liveCards, domains } = await loadLiveCardsWithDomains(dataDir);
    const priorState = await readReviewState(dataDir);
    const csv = buildReviewExportCsv(liveCards, priorState, domains, Date.now());

    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", 'attachment; filename="studyloop-review-export.csv"');
    return reply.send(csv);
  });
}
