// Phase 11 "Bring-your-own local ASR adapters" (design/EXECUTION-PLAN-post-review-v1.md):
// POST starts (or queues) a transcription job for a project's local video
// file, GET reports its status, DELETE cancels it. Mirrors routes/analyze.ts's
// job-route shape (thin route, lib/asrJobs.ts holds the guard/queue logic,
// lib/asr.ts holds the actual adapters) and routes/slides.ts's per-project
// multi-verb-on-one-path convention.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getConfig, resolveDataDir } from "../config.js";
import { hasAsrCache, resolveAsrRunner, writeAsrCache } from "../lib/asr.js";
import { AsrJobManager } from "../lib/asrJobs.js";
import { ProjectIdParamSchema } from "../lib/models.js";
import { readProject } from "../lib/store.js";

const IdParamSchema = ProjectIdParamSchema;
const TranscribeBodySchema = z.object({ force: z.boolean().optional() });

/** Module-level singleton — one global queue for the life of the server process (SPEC: "one global runner, FIFO queue"), same lifetime convention as routes/analyze.ts's `analysisJobs`. */
export const asrJobs = new AsrJobManager();

export async function transcribeRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/projects/:id/transcribe", async (request, reply) => {
    const params = IdParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid id" });
    const body = TranscribeBodySchema.safeParse(request.body ?? {});
    if (!body.success) return reply.status(400).send({ error: "Body must be { force?: boolean }" });

    const config = await getConfig();
    const dataDir = resolveDataDir(config);
    const project = await readProject(dataDir, params.data.id);
    if (!project) return reply.status(404).send({ error: "Project not found" });

    // ASR needs an actual local media file to feed the adapter (a command
    // subprocess, or a multipart upload) — a youtube-source project has no
    // local file on disk to hand it (see lib/scan.ts's own "transcribable"
    // marker, which is likewise local-only).
    if (project.source.type !== "local") {
      return reply.status(400).send({ error: "Bring-your-own ASR only applies to local video files", code: "not_local" });
    }
    if (config.asr.mode === "off") {
      return reply.status(400).send({ error: "ASR is not configured — set it up in Settings", code: "asr_off" });
    }
    if (config.asr.mode === "command" && !config.asr.command) {
      return reply.status(400).send({ error: "No ASR command configured", code: "asr_misconfigured" });
    }
    if (config.asr.mode === "endpoint" && !config.asr.endpoint) {
      return reply.status(400).send({ error: "No ASR endpoint configured", code: "asr_misconfigured" });
    }

    const videoPath = project.source.path;
    const force = body.data.force ?? false;
    // SPEC: "never re-run when cached" — checked before ever touching the
    // job queue, so a repeat POST for an already-transcribed project is a
    // cheap idempotent read, not a queue slot.
    if (!force && (await hasAsrCache(dataDir, videoPath))) {
      return reply.status(200).send({ state: "done", cached: true });
    }

    const projectId = params.data.id;
    const asrConfig = config.asr;
    const action = asrJobs.submit(projectId, async (signal) => {
      const segments = await resolveAsrRunner().run({ config: asrConfig, videoPath, dataDir, signal });
      await writeAsrCache(dataDir, videoPath, segments, asrConfig.mode === "command" ? "command" : "endpoint");
    });

    if (action === "already_running") {
      return reply.status(409).send({ error: "Transcription already running or queued for this project", code: "already_running" });
    }
    return reply.status(202).send(asrJobs.status(projectId));
  });

  app.get("/api/projects/:id/transcribe", async (request, reply) => {
    const params = IdParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid id" });
    const config = await getConfig();
    const dataDir = resolveDataDir(config);
    const project = await readProject(dataDir, params.data.id);
    if (!project) return reply.status(404).send({ error: "Project not found" });

    const status = asrJobs.status(params.data.id);
    // No job has run THIS session, but a cache file already exists on disk
    // (server restarted mid-session, or another process wrote it) — same
    // "fall back to checking the artifact" rule routes/analyze.ts's
    // AnalysisJobManager.status applies for analysis.json.
    if (status.state === "idle" && project.source.type === "local" && (await hasAsrCache(dataDir, project.source.path))) {
      return { state: "done" as const };
    }
    return status;
  });

  app.delete("/api/projects/:id/transcribe", async (request, reply) => {
    const params = IdParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid id" });
    const config = await getConfig();
    const dataDir = resolveDataDir(config);
    const project = await readProject(dataDir, params.data.id);
    if (!project) return reply.status(404).send({ error: "Project not found" });

    const cancelled = asrJobs.cancel(params.data.id);
    return { ok: true as const, cancelled };
  });
}
