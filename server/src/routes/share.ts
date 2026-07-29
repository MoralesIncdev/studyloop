// V2-C "Heatmap + shareable analysis" (SPEC): export-analysis writes a
// self-contained `.studyloop.json` bundle; import-analysis validates and
// stores one as an overlay; GET/DELETE list and remove overlays.
import fs from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getConfig, resolveDataDir } from "../config.js";
import { AnalysisSchema, shortHash } from "../lib/analysis.js";
import { loosePearls } from "../lib/analysisAccess.js";
import { getFfprobeDurationSeconds } from "../lib/ffprobe.js";
import { scaleImageToBase64 } from "../lib/frames.js";
import { ProjectIdParamSchema, type Bubble, type Project } from "../lib/models.js";
import { diffMarks, type Mark } from "../lib/overlayDiff.js";
import {
  buildShareBundle,
  detectSourceMismatch,
  overlayFileName,
  ShareBundleSchema,
  type ShareBundle,
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

/**
 * V3-C C4 "Overlay diff-on-import" (SPEC): the project's own bubbles + pearls
 * as `Mark[]`, the "own" side of lib/overlayDiff.ts's `diffMarks()`. Reads
 * analysis.json through the loose accessor (loosePearls), not the
 * version-locked `AnalysisSchema`, so this keeps working once V3-B ships a
 * v3 analysis.json.
 */
async function ownMarksFor(dataDir: string, projectId: string, bubbles: readonly Bubble[]): Promise<Mark[]> {
  const analysisRaw = await readJsonIfExists<unknown>(analysisJsonPath(dataDir, projectId));
  const pearls = loosePearls(analysisRaw);
  return [
    ...bubbles.map((b): Mark => ({ t: b.t, kind: "bubble", text: b.text, author: "you" })),
    ...pearls.map((p): Mark => ({ t: p.t, kind: "pearl", importance: p.importance as 1 | 2 | 3, text: p.label, author: "you" })),
  ];
}

/** The overlay bundle's own marks, tagged with its shareHandle as author. */
function importedMarksFor(bundle: ShareBundle): Mark[] {
  return [
    ...bundle.bubbles.map((b): Mark => ({ t: b.t, kind: "bubble", text: b.text, author: bundle.shareHandle })),
    ...bundle.pearls.map((p): Mark => ({ t: p.t, kind: "pearl", importance: p.importance, text: p.label, author: bundle.shareHandle })),
  ];
}

/** SPEC: "±15s tolerance window". */
const OVERLAY_DIFF_TOLERANCE_SECONDS = 15;

// V3-C C6: optional per-concept "why this grouping" text, entered in the
// rail's export step (ShareFlow.tsx) right before calling this route —
// see ShareBundleSchema.conceptRationales for why it isn't persisted
// anywhere before export.
const ExportAnalysisBodySchema = z.object({ conceptRationales: z.record(z.string()).optional() }).optional();

export async function shareRoutes(app: FastifyInstance): Promise<void> {
  // --- export ------------------------------------------------------------------

  app.post("/api/projects/:id/export-analysis", async (request, reply) => {
    const params = IdParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid id" });
    const rawBody =
      request.body && typeof request.body === "object" && Object.keys(request.body as object).length > 0
        ? request.body
        : undefined;
    const bodyParsed = ExportAnalysisBodySchema.safeParse(rawBody);
    if (!bodyParsed.success) return reply.status(400).send({ error: "Invalid body" });

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
      conceptRationales: bodyParsed.data?.conceptRationales,
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
    // V3-C C4: computed once per request against the project's CURRENT
    // bubbles/pearls (not cached at import time) — the diff is "what they
    // marked that you still haven't", which shrinks as the learner adds
    // their own bubbles, so it must always reflect the live state.
    const ownBubbles = await readBubbles(dataDir, params.data.id);
    const ownMarks = await ownMarksFor(dataDir, params.data.id, ownBubbles);

    const overlays: { fileName: string; bundle: ShareBundle; diff: Mark[] }[] = [];
    for (const fileName of fileNames) {
      // eslint-disable-next-line no-await-in-loop -- overlay count per project is small
      const raw = await readJsonIfExists<unknown>(overlayFilePath(dataDir, params.data.id, fileName));
      if (raw === null) continue;
      const parsed = ShareBundleSchema.safeParse(raw);
      if (!parsed.success) continue;
      const diff = diffMarks(importedMarksFor(parsed.data), ownMarks, OVERLAY_DIFF_TOLERANCE_SECONDS);
      overlays.push({ fileName, bundle: parsed.data, diff });
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
