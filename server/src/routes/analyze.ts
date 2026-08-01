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
import { AnalysisSchema, isFakeAnalysisMode, resolveAnalysisClientV3, runAnalysisJobV3 } from "../lib/analysis.js";
import { AnalysisJobManager, evaluateAnalyzeGuard } from "../lib/analysisJobs.js";
import { missingCredentialMessage, resolveAnalysisModel, resolveProviderAuth } from "../lib/providers.js";
import { updateRegistryForProject } from "../lib/conceptRegistry.js";
import { readConceptRegistry, withConceptRegistryLock, writeConceptRegistry } from "../lib/conceptRegistryStore.js";
import { correctTranscriptSegments } from "../lib/terms.js";
import { resolveTranscriptPath } from "../lib/transcriptResolve.js";
import { loadTranscriptFromText, type TranscriptSegment } from "../lib/transcripts.js";
import { ProjectIdParamSchema } from "../lib/models.js";
import { analysisJsonPath, newId, pathExists, readJsonIfExists, readProject, withProjectLock, writeJsonAtomic, writeProject } from "../lib/store.js";

const IdParamSchema = ProjectIdParamSchema;
const AnalyzeBodySchema = z.object({ force: z.boolean().optional() });

/** Module-level singleton — one job map for the life of the server process, same lifetime as every other in-process cache here (health.ts, innertube.ts). */
export const analysisJobs = new AnalysisJobManager();

async function loadProjectTranscriptSegments(
  dataDir: string,
  roots: ReturnType<typeof resolveRoots>,
  projectId: string,
  transcript: { type: "file"; path: string } | { type: "none" },
  domain: string | undefined
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
    const segments = loadTranscriptFromText(resolved.filePath, raw).segments;
    // Phase 2 "Terminology layer v1": corrections must apply before the
    // transcript ever reaches the chunk/extract pipeline — this is the exact
    // read site the four reviews called out ("ASR-mangled terms poison
    // extraction"). The transcript file read above is untouched on disk.
    return await correctTranscriptSegments(dataDir, projectId, segments, domain);
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
    const providerAuth = resolveProviderAuth(config);
    const action = evaluateAnalyzeGuard({
      isRunning: analysisJobs.isRunning(params.data.id),
      analysisExists: await pathExists(analysisPath),
      force: body.data.force ?? false,
      fakeMode,
      hasApiKey: providerAuth !== null,
    });

    if (action === "already_running") {
      return reply.status(409).send({ error: "Analysis is already running for this project", code: "already_running" });
    }
    if (action === "serve_existing") {
      const existing = await readJsonIfExists<unknown>(analysisPath);
      if (existing === null) return reply.status(500).send({ error: "analysis.json exists but could not be read" });
      // Parsed through AnalysisSchema (not just cast) so legacy files written
      // before the `source` provenance field existed pick up its "model" default.
      const parsed = AnalysisSchema.safeParse(existing);
      if (!parsed.success) return reply.status(500).send({ error: "analysis.json is corrupt" });
      return parsed.data;
    }
    if (action === "no_api_key") {
      return reply.status(400).send({ error: missingCredentialMessage(config), code: "no_api_key" });
    }

    const roots = resolveRoots(config);
    const segments = await loadProjectTranscriptSegments(dataDir, roots, params.data.id, project.transcript, project.domain);
    if (segments.length === 0) {
      return reply.status(400).send({ error: "This project has no transcript to analyze", code: "no_transcript" });
    }

    const model = resolveAnalysisModel(config);
    const projectId = params.data.id;
    analysisJobs.start(projectId);

    // Fire-and-forget: the route returns immediately (SPEC: "Progress: SSE or
    // polling endpoint" — polling is what the web app uses), the job updates
    // its own in-memory status as it goes, and writes analysis.json on success.
    void (async () => {
      try {
        const client = resolveAnalysisClientV3(providerAuth);
        const analysis = await runAnalysisJobV3({
          segments,
          model,
          client,
          source: fakeMode ? "stub" : "model",
          onProgress: (pct) => analysisJobs.progress(projectId, pct),
        });
        await writeJsonAtomic(analysisPath, analysis);
        // V3-B B1: "domain ... stored on the project (editable chip near the
        // channel row; PATCH `domain`)" — persisted here so the chip has
        // something to show without a second round trip, then freely
        // user-editable afterward via the existing generic PATCH /projects/:id.
        await withProjectLock(projectId, async () => {
          const current = await readProject(dataDir, projectId);
          if (!current) return;
          await writeProject(dataDir, { ...current, domain: analysis.domain, updatedAt: new Date().toISOString() });
        });
        // V3-D D3 "Concept merge queue": fingerprint every unit from this run
        // against the dataDir-wide registry (cross-video identity) — v3
        // analyses with units only; a router failure/v2 legacy run has
        // nothing to register. Best-effort: a registry write failure
        // shouldn't fail the analyze run itself (the analysis already
        // succeeded and is already on disk), so this is intentionally
        // outside the try/catch's failure path for the run overall — errors
        // here are logged, not surfaced as an analyze failure.
        if (analysis.units && analysis.units.length > 0) {
          try {
            await withConceptRegistryLock(async () => {
              const registry = await readConceptRegistry(dataDir);
              const next = updateRegistryForProject(
                registry,
                projectId,
                analysis.domain ?? "generic",
                analysis.units!,
                new Date().toISOString(),
                newId
              );
              await writeConceptRegistry(dataDir, next);
            });
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn(`[analyze] concept registry update failed for project ${projectId}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
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
