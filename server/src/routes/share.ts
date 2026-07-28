// V2-C "Heatmap + shareable analysis" (SPEC): export-analysis writes a
// self-contained `.studyloop.json` bundle; import-analysis validates and
// stores one as an overlay; GET/DELETE list and remove overlays.
import fs from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getConfig, resolveDataDir } from "../config.js";
import { AnalysisSchema, shortHash } from "../lib/analysis.js";
import { getFfprobeDurationSeconds } from "../lib/ffprobe.js";
import { scaleImageToBase64 } from "../lib/frames.js";
import { ProjectIdParamSchema, type Project } from "../lib/models.js";
import {
  buildShareBundle,
  detectSourceMismatch,
  overlayFileName,
  ShareBundleSchema,
  validateShareBundle,
} from "../lib/shareBundle.js";
import {
  analysisJsonPath,
  exportsDir,
  listOverlayFileNames,
  overlayFilePath,
  overlaysDir,
  pathExists,
  projectDir,
  readBubbles,
  readJsonIfExists,
  readNotes,
  readProject,
  slugify,
  writeFileAtomic,
} from "../lib/store.js";

const IdParamSchema = ProjectIdParamSchema;

async function resolveProjectDuration(project: Project): Promise<number | null> {
  if (project.source.type === "local") return getFfprobeDurationSeconds(project.source.path);
  return null;
}

export async function shareRoutes(app: FastifyInstance): Promise<void> {
  // --- export ------------------------------------------------------------------

  app.post("/api/projects/:id/export-analysis", async (request, reply) => {
    const params = IdParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid id" });

    const config = await getConfig();
    const dataDir = resolveDataDir(config);
    const project = await readProject(dataDir, params.data.id);
    if (!project) return reply.status(404).send({ error: "Project not found" });

    const [notes, bubbles, analysisRaw, duration] = await Promise.all([
      readNotes(dataDir, params.data.id),
      readBubbles(dataDir, params.data.id),
      readJsonIfExists<unknown>(analysisJsonPath(dataDir, params.data.id)),
      resolveProjectDuration(project),
    ]);
    const analysisParsed = analysisRaw !== null ? AnalysisSchema.safeParse(analysisRaw) : null;
    const analysis = analysisParsed?.success ? analysisParsed.data : null;

    const projDir = projectDir(dataDir, params.data.id);
    const bundle = await buildShareBundle({
      project,
      notes,
      bubbles,
      shareHandle: config.shareHandle,
      localDurationSeconds: duration,
      pearls: analysis?.pearls,
      concepts: analysis?.concepts,
      themes: analysis?.themes,
      resolveThumbnail: async (shotRelPath) => {
        const abs = path.join(projDir, shotRelPath);
        if (!(await pathExists(abs))) return null;
        return scaleImageToBase64(abs);
      },
    });

    const fileName = `${slugify(project.title)}.studyloop.json`;
    const outPath = path.join(exportsDir(dataDir, params.data.id), fileName);
    await writeFileAtomic(outPath, JSON.stringify(bundle, null, 2));

    return { path: outPath, bundle };
  });

  // --- import --------------------------------------------------------------------

  const ImportByPathBodySchema = z.object({ path: z.string().min(1) });

  app.post("/api/projects/:id/import-analysis", async (request, reply) => {
    const params = IdParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid id" });

    const config = await getConfig();
    const dataDir = resolveDataDir(config);
    const project = await readProject(dataDir, params.data.id);
    if (!project) return reply.status(404).send({ error: "Project not found" });

    let raw: string;
    const contentType = request.headers["content-type"] ?? "";
    if (contentType.includes("multipart/form-data")) {
      // Optional dependency on @fastify/multipart being registered — see index.ts.
      const reqWithFile = request as unknown as { file?: () => Promise<{ toBuffer: () => Promise<Buffer> } | undefined> };
      const file = typeof reqWithFile.file === "function" ? await reqWithFile.file() : undefined;
      if (!file) return reply.status(400).send({ error: "No file uploaded" });
      raw = (await file.toBuffer()).toString("utf8");
    } else {
      const body = ImportByPathBodySchema.safeParse(request.body);
      if (!body.success) return reply.status(400).send({ error: "Body must be { path: string } or a multipart file upload" });
      try {
        raw = await fs.readFile(body.data.path, "utf8");
      } catch (err) {
        return reply.status(400).send({ error: `Could not read file: ${err instanceof Error ? err.message : String(err)}` });
      }
    }

    const validated = validateShareBundle(raw);
    if (!validated.ok) return reply.status(422).send({ error: validated.error });

    const currentDuration = await resolveProjectDuration(project);
    const currentSource =
      project.source.type === "youtube"
        ? ({ type: "youtube" as const, videoId: project.source.videoId, url: project.source.url })
        : ({ type: "local" as const, filename: project.source.path.split("/").pop() ?? project.source.path, durationSeconds: currentDuration });
    const mismatch = detectSourceMismatch(validated.bundle.source, currentSource);

    const fileName = overlayFileName(validated.bundle.shareHandle, raw, shortHash);
    await fs.mkdir(overlaysDir(dataDir, params.data.id), { recursive: true });
    await writeFileAtomic(overlayFilePath(dataDir, params.data.id, fileName), raw);

    return reply.status(201).send({ fileName, bundle: validated.bundle, sourceMismatch: mismatch });
  });

  // --- overlays list/delete --------------------------------------------------------

  app.get("/api/projects/:id/overlays", async (request, reply) => {
    const params = IdParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid id" });
    const config = await getConfig();
    const dataDir = resolveDataDir(config);
    const project = await readProject(dataDir, params.data.id);
    if (!project) return reply.status(404).send({ error: "Project not found" });

    const fileNames = await listOverlayFileNames(dataDir, params.data.id);
    const overlays = [];
    for (const fileName of fileNames) {
      // eslint-disable-next-line no-await-in-loop -- overlay count per project is small
      const raw = await readJsonIfExists<unknown>(overlayFilePath(dataDir, params.data.id, fileName));
      if (raw === null) continue;
      const parsed = ShareBundleSchema.safeParse(raw);
      if (parsed.success) overlays.push({ fileName, bundle: parsed.data });
    }
    return { overlays };
  });

  app.delete("/api/projects/:id/overlays/:fileName", async (request, reply) => {
    const params = z
      .object({ id: z.string().uuid(), fileName: z.string().min(1).regex(/^[a-z0-9-]+\.studyloop\.json$/) })
      .safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid id or overlay filename" });
    const config = await getConfig();
    const dataDir = resolveDataDir(config);
    const project = await readProject(dataDir, params.data.id);
    if (!project) return reply.status(404).send({ error: "Project not found" });

    let target: string;
    try {
      target = overlayFilePath(dataDir, params.data.id, params.data.fileName);
    } catch {
      return reply.status(403).send({ error: "Invalid overlay filename" });
    }
    try {
      await fs.unlink(target);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return reply.status(404).send({ error: "Overlay not found" });
      }
      throw err;
    }
    return { ok: true };
  });
}
