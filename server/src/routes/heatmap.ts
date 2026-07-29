// V2-C "Heatmap + shareable analysis" (SPEC), upgraded by V3-C C5 "Attention
// heatmap" (PEDAGOGY.md §7): GET /api/projects/:id/heatmap now returns TWO
// independently-bucketed/normalized layers — `own` (this project's bubbles +
// pearls) and `overlays` (every imported overlay bundle's bubbles + pearls,
// combined) — plus the raw marks behind each layer and `duration`/
// `bucketCount`, so the client can resolve "which marks compose this bucket"
// for the click-to-inspect popover (SPEC: "±1 bucket") locally, without a
// second round trip. See lib/heatmap.ts's buildLayeredHeatmap/marksNearBucket
// for why the layers are no longer merged (PEDAGOGY §7: "render user layer
// and overlay layer separately... crowd signal washes out expert signal").
import type { FastifyInstance } from "fastify";
import { getConfig, resolveDataDir } from "../config.js";
import { loosePearls } from "../lib/analysisAccess.js";
import { getFfprobeDurationSeconds } from "../lib/ffprobe.js";
import { buildLayeredHeatmap, type LayeredHeatmapInput } from "../lib/heatmap.js";
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

const BUCKET_COUNT = 200;

async function gatherLayeredInput(
  dataDir: string,
  projectId: string
): Promise<{ input: LayeredHeatmapInput; duration: number }> {
  const project = await readProject(dataDir, projectId);
  if (!project) throw new Error("Project not found");

  const [bubbles, analysisRaw, overlayFileNames] = await Promise.all([
    readBubbles(dataDir, projectId),
    readJsonIfExists<unknown>(analysisJsonPath(dataDir, projectId)),
    listOverlayFileNames(dataDir, projectId),
  ]);
  // loosePearls tolerates both v2 (`AnalysisSchema`, version:2) and a future
  // v3 analysis.json shape (see analysisAccess.ts) — the strict
  // version-locked AnalysisSchema import that used to live here would reject
  // v3 payloads outright, silently dropping every pearl from the "own" layer
  // the moment V3-B ships.
  const ownPearls = loosePearls(analysisRaw);

  const overlayBubbles: { t: number; text: string; author: string }[] = [];
  const overlayPearls: { t: number; label: string; importance: number; author: string }[] = [];
  for (const fileName of overlayFileNames) {
    // eslint-disable-next-line no-await-in-loop -- overlay count per project is small; sequential keeps this simple
    const raw = await readJsonIfExists<unknown>(overlayFilePath(dataDir, projectId, fileName));
    if (raw === null) continue;
    const parsed = ShareBundleSchema.safeParse(raw);
    if (!parsed.success) continue;
    for (const b of parsed.data.bubbles) overlayBubbles.push({ t: b.t, text: b.text, author: parsed.data.shareHandle });
    for (const p of parsed.data.pearls) {
      overlayPearls.push({ t: p.t, label: p.label, importance: p.importance, author: parsed.data.shareHandle });
    }
  }

  let duration = await resolveDuration(project);
  if (duration === null || duration <= 0) {
    const allTimes = [
      ...bubbles.map((b) => b.t),
      ...ownPearls.map((p) => p.t),
      ...overlayBubbles.map((b) => b.t),
      ...overlayPearls.map((p) => p.t),
    ];
    const maxT = allTimes.reduce((max, t) => Math.max(max, t), 0);
    duration = maxT > 0 ? maxT * 1.05 : 0;
  }

  return {
    input: { ownBubbles: bubbles.map((b) => ({ t: b.t, text: b.text })), ownPearls, overlayBubbles, overlayPearls },
    duration,
  };
}

export async function heatmapRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/projects/:id/heatmap", async (request, reply) => {
    const params = ProjectIdParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid id" });
    const config = await getConfig();
    const dataDir = resolveDataDir(config);
    const project = await readProject(dataDir, params.data.id);
    if (!project) return reply.status(404).send({ error: "Project not found" });

    const { input, duration } = await gatherLayeredInput(dataDir, params.data.id);
    const layered = buildLayeredHeatmap(input, duration, BUCKET_COUNT);

    return { ...layered, bucketCount: BUCKET_COUNT, duration };
  });
}
