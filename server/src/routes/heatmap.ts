// V2-C "Heatmap + shareable analysis" (SPEC): GET /api/projects/:id/heatmap
// assembles bubbles (weight 1), pearls (weight = importance), and imported
// overlay bubbles/pearls (weight ×0.5) into the pure bucketing/smoothing math
// in lib/heatmap.ts.
import type { FastifyInstance } from "fastify";
import { getConfig, resolveDataDir } from "../config.js";
import { AnalysisSchema } from "../lib/analysis.js";
import { getFfprobeDurationSeconds } from "../lib/ffprobe.js";
import { bucketizeHeatmap, type HeatmapPoint } from "../lib/heatmap.js";
import { ProjectIdParamSchema, type Project } from "../lib/models.js";
import { ShareBundleSchema } from "../lib/shareBundle.js";
import {
  analysisJsonPath,
  listOverlayFileNames,
  overlayFilePath,
  readBubbles,
  readJsonIfExists,
  readProject,
} from "../lib/store.js";

/**
 * Best-effort duration for bucketing range. project.json carries no duration
 * field: for local sources, ffprobe the file; for youtube (or ffprobe
 * unavailable/failing), the caller falls back to the max observed point time.
 */
async function resolveDuration(project: Project): Promise<number | null> {
  if (project.source.type === "local") return getFfprobeDurationSeconds(project.source.path);
  return null;
}

export async function heatmapRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/projects/:id/heatmap", async (request, reply) => {
    const params = ProjectIdParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid id" });
    const config = await getConfig();
    const dataDir = resolveDataDir(config);
    const project = await readProject(dataDir, params.data.id);
    if (!project) return reply.status(404).send({ error: "Project not found" });

    const [bubbles, analysisRaw, overlayFileNames] = await Promise.all([
      readBubbles(dataDir, params.data.id),
      readJsonIfExists<unknown>(analysisJsonPath(dataDir, params.data.id)),
      listOverlayFileNames(dataDir, params.data.id),
    ]);
    const analysisParsed = analysisRaw !== null ? AnalysisSchema.safeParse(analysisRaw) : null;
    const pearls = analysisParsed?.success ? analysisParsed.data.pearls : [];

    const points: HeatmapPoint[] = [];
    for (const b of bubbles) points.push({ t: b.t, weight: 1 });
    for (const p of pearls) points.push({ t: p.t, weight: p.importance });

    for (const fileName of overlayFileNames) {
      // eslint-disable-next-line no-await-in-loop -- overlay count per project is small; sequential keeps this simple
      const raw = await readJsonIfExists<unknown>(overlayFilePath(dataDir, params.data.id, fileName));
      if (raw === null) continue;
      const parsed = ShareBundleSchema.safeParse(raw);
      if (!parsed.success) continue;
      for (const b of parsed.data.bubbles) points.push({ t: b.t, weight: 0.5 });
      for (const p of parsed.data.pearls) points.push({ t: p.t, weight: p.importance * 0.5 });
    }

    let duration = await resolveDuration(project);
    if (duration === null || duration <= 0) {
      const maxT = points.reduce((max, p) => Math.max(max, p.t), 0);
      duration = maxT > 0 ? maxT * 1.05 : 0;
    }

    return { buckets: bucketizeHeatmap(points, duration) };
  });
}
