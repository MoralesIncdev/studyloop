// V2-C "Analysis engine" (SPEC): POST /api/projects/:id/analyze kicks off a
// (possibly long-running) chunk -> extract -> merge pipeline in the
// background and returns immediately; the web app polls
// GET /api/projects/:id/analyze/status and fetches the result from
// GET /api/projects/:id/analysis once done. See lib/analysis.ts for the
// pipeline itself and lib/analysisJobs.ts for the guard/status logic tested
// independently of this route.
import fs from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getConfig, resolveDataDir, resolveRoots } from "../config.js";
import { AnalysisSchema, isFakeAnalysisMode, resolveAnalysisClient, runAnalysisJob, type Analysis } from "../lib/analysis.js";
import { AnalysisJobManager, evaluateAnalyzeGuard } from "../lib/analysisJobs.js";
import { resolveTranscriptPath } from "../lib/transcriptResolve.js";
import { loadTranscriptFromText, type TranscriptSegment } from "../lib/transcripts.js";
import { ProjectIdParamSchema } from "../lib/models.js";
import { analysisJsonPath, pathExists, readJsonIfExists, readProject, writeJsonAtomic } from "../lib/store.js";

const IdParamSchema = ProjectIdParamSchema;
const AnalyzeBodySchema = z.object({ force: z.boolean().optional() });

/** Module-level singleton — one job map for the life of the server process, same lifetime as every other in-process cache here (health.ts, innertube.ts). */
export const analysisJobs = new AnalysisJobManager();

async function loadProjectTranscriptSegments(
  dataDir: string,
  roots: ReturnType<typeof resolveRoots>,
  projectId: string,
  transcript: { type: "file"; path: string } | { type: "none" }
): Promise<TranscriptSegment[]> {
  if (transcript.type !== "file") return [];
  const resolved = await resolveTranscriptPath(dataDir, roots, transcript.path, projectId);
  if (!resolved.ok) return [];
  let raw: string;
  try {
    raw = await fs.readFile(resolved.filePath, "utf8");
  } catch {
    return [];
  }
  try {
    return loadTranscriptFromText(resolved.filePath, raw).segments;
  } catch {
    return [];
  }
}

export async function analyzeRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/projects/:id/analyze", async (request, reply) => {
    const params = IdParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid id" });
    const body = AnalyzeBodySchema.safeParse(request.body ?? {});
    if (!body.success) return reply.status(400).send({ error: "Body must be { force?: boolean }" });

    const config = await getConfig();
    const dataDir = resolveDataDir(config);
    const project = await readProject(dataDir, params.data.id);
    if (!project) return reply.status(404).send({ error: "Project not found" });

    const analysisPath = analysisJsonPath(dataDir, params.data.id);
    const fakeMode = isFakeAnalysisMode();
    const action = evaluateAnalyzeGuard({
      isRunning: analysisJobs.isRunning(params.data.id),
      analysisExists: await pathExists(analysisPath),
      force: body.data.force ?? false,
      fakeMode,
      hasApiKey: Boolean(config.anthropicApiKey),
    });

    if (action === "already_running") {
      return reply.status(409).send({ error: "Analysis is already running for this project", code: "already_running" });
    }
    if (action === "serve_existing") {
      const existing = await readJsonIfExists<Analysis>(analysisPath);
      return existing ?? reply.status(500).send({ error: "analysis.json exists but could not be read" });
    }
    if (action === "no_api_key") {
      return reply.status(400).send({ error: "No Anthropic API key configured — add one in Settings", code: "no_api_key" });
    }

    const roots = resolveRoots(config);
    const segments = await loadProjectTranscriptSegments(dataDir, roots, params.data.id, project.transcript);
    if (segments.length === 0) {
      return reply.status(400).send({ error: "This project has no transcript to analyze", code: "no_transcript" });
    }

    const model = config.analysisModel ?? "claude-opus-5";
    const projectId = params.data.id;
    analysisJobs.start(projectId);

    // Fire-and-forget: the route returns immediately (SPEC: "Progress: SSE or
    // polling endpoint" — polling is what the web app uses), the job updates
    // its own in-memory status as it goes, and writes analysis.json on success.
    void (async () => {
      try {
        const client = resolveAnalysisClient(config.anthropicApiKey);
        const analysis = await runAnalysisJob({
          segments,
          model,
          client,
          onProgress: (pct) => analysisJobs.progress(projectId, pct),
        });
        await writeJsonAtomic(analysisPath, analysis);
        analysisJobs.done(projectId);
      } catch (err) {
        analysisJobs.error(projectId, err instanceof Error ? err.message : String(err));
      }
    })();

    return reply.status(202).send(analysisJobs.status(projectId, false));
  });

  app.get("/api/projects/:id/analyze/status", async (request, reply) => {
    const params = IdParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid id" });
    const config = await getConfig();
    const dataDir = resolveDataDir(config);
    const project = await readProject(dataDir, params.data.id);
    if (!project) return reply.status(404).send({ error: "Project not found" });

    const analysisExists = await pathExists(analysisJsonPath(dataDir, params.data.id));
    return analysisJobs.status(params.data.id, analysisExists);
  });

  app.get("/api/projects/:id/analysis", async (request, reply) => {
    const params = IdParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid id" });
    const config = await getConfig();
    const dataDir = resolveDataDir(config);
    const project = await readProject(dataDir, params.data.id);
    if (!project) return reply.status(404).send({ error: "Project not found" });

    const raw = await readJsonIfExists<unknown>(analysisJsonPath(dataDir, params.data.id));
    if (raw === null) return reply.status(404).send({ error: "No analysis for this project yet" });
    const parsed = AnalysisSchema.safeParse(raw);
    if (!parsed.success) return reply.status(500).send({ error: "analysis.json is corrupt" });
    return parsed.data;
  });
}
