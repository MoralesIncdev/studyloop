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
import fs from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { getConfig, resolveDataDir, resolveRoots, type ResolvedRoots } from "../config.js";
import { loosePearls } from "../lib/analysisAccess.js";
import { getFfprobeDurationSeconds } from "../lib/ffprobe.js";
import { buildLayeredHeatmap, resolveHeatmapDuration, type LayeredHeatmapInput } from "../lib/heatmap.js";
import { ProjectIdParamSchema, type Project } from "../lib/models.js";
import { ShareBundleSchema } from "../lib/shareBundle.js";
import { resolveTranscriptPath } from "../lib/transcriptResolve.js";
import { loadTranscriptFromText } from "../lib/transcripts.js";
import {
  analysisJsonPath,
  listOverlayFileNames,
  overlayFilePath,
  readBubbles,
  readJsonIfExists,
  readProject,
} from "../lib/store.js";

/**
 * ffprobe result for local sources only — a real (if not yet persisted)
 * measurement. `null` for youtube sources, or when ffprobe is unavailable/fails.
 */
async function probeLocalDuration(project: Project): Promise<number | null> {
  if (project.source.type === "local") return getFfprobeDurationSeconds(project.source.path);
  return null;
}

/**
 * V3-C review fix #6: the project's transcript's last segment `end`, when a
 * transcript exists — mirrors routes/analyze.ts's loadProjectTranscriptSegments.
 * Degrades to `null` (never throws) on any resolution/read/parse failure,
 * matching every other heatmap input source's "rail just shows less" policy.
 */
async function lastTranscriptSegmentEnd(dataDir: string, roots: ResolvedRoots, project: Project): Promise<number | null> {
  if (project.transcript.type !== "file") return null;
  const resolved = await resolveTranscriptPath(dataDir, roots, project.transcript.path, project.id);
  if (!resolved.ok) return null;
  let raw: string;
  try {
    raw = await fs.readFile(resolved.filePath, "utf8");
  } catch {
    return null;
  }
  try {
    const { segments } = loadTranscriptFromText(resolved.filePath, raw);
    if (segments.length === 0) return null;
    return segments.reduce((max, s) => Math.max(max, s.end), 0);
  } catch {
    return null;
  }
}

const BUCKET_COUNT = 200;

async function gatherLayeredInput(
  dataDir: string,
  roots: ResolvedRoots,
  project: Project
): Promise<{ input: LayeredHeatmapInput; duration: number }> {
  const [bubbles, analysisRaw, overlayFileNames] = await Promise.all([
    readBubbles(dataDir, project.id),
    readJsonIfExists<unknown>(analysisJsonPath(dataDir, project.id)),
    listOverlayFileNames(dataDir, project.id),
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
    const raw = await readJsonIfExists<unknown>(overlayFilePath(dataDir, project.id, fileName));
    if (raw === null) continue;
    const parsed = ShareBundleSchema.safeParse(raw);
    if (!parsed.success) continue;
    for (const b of parsed.data.bubbles) overlayBubbles.push({ t: b.t, text: b.text, author: parsed.data.shareHandle });
    for (const p of parsed.data.pearls) {
      overlayPearls.push({ t: p.t, label: p.label, importance: p.importance, author: parsed.data.shareHandle });
    }
  }

  // V3-C review fix #6: prefer known duration sources over the old
  // "last mark * 1.05" heuristic — see lib/heatmap.ts's resolveHeatmapDuration
  // for the preference order. probedDuration/transcriptEnd are only fetched
  // when project.durationSeconds isn't already stored (the common case once
  // the player has PATCHed it at least once).
  const storedDurationSeconds = project.durationSeconds ?? null;
  const [probedDurationSeconds, transcriptEndSeconds] =
    storedDurationSeconds != null && storedDurationSeconds > 0
      ? [null, null]
      : await Promise.all([probeLocalDuration(project), lastTranscriptSegmentEnd(dataDir, roots, project)]);

  const markTimes = [
    ...bubbles.map((b) => b.t),
    ...ownPearls.map((p) => p.t),
    ...overlayBubbles.map((b) => b.t),
    ...overlayPearls.map((p) => p.t),
  ];
  const duration = resolveHeatmapDuration({
    storedDurationSeconds,
    probedDurationSeconds,
    transcriptEndSeconds,
    watchedUpToSeconds: project.watchedUpTo,
    markTimes,
  });

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
    const roots = resolveRoots(config);
    const project = await readProject(dataDir, params.data.id);
    if (!project) return reply.status(404).send({ error: "Project not found" });

    const { input, duration } = await gatherLayeredInput(dataDir, roots, project);
    const layered = buildLayeredHeatmap(input, duration, BUCKET_COUNT);

    return { ...layered, bucketCount: BUCKET_COUNT, duration };
  });
}
