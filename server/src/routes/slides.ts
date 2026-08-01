// Phase 6 "Slide-text channel, smallest slice (PDF)"
// (design/EXECUTION-PLAN-post-review-v1.md): POST accepts a multipart PDF
// upload (size-capped ~25MB — SPEC), extracts per-page text server-side
// (lib/slides.ts), and persists it as `<project>/slides.json`. GET returns
// just the upload metadata (filename/pageCount/uploadedAt) — never the
// extracted page text itself, which can be large and the web app only ever
// needs to know a deck is attached. DELETE removes it. Both POST and DELETE
// mark the project's analysis stale (Phase 2's staleReason mechanism,
// extended with "slides-changed" — see lib/terms.ts's now-generalized
// markAnalysisStale) the same way a terms.json edit already does.
import type { FastifyInstance } from "fastify";
import { ProjectIdParamSchema } from "../lib/models.js";
import { getConfig, resolveDataDir } from "../config.js";
import { readProject, withProjectLock } from "../lib/store.js";
import { SLIDES_MAX_BYTES, deleteSlidesFile, exceedsSlidesSizeCap, readSlides, resolveSlideExtractor, writeSlides } from "../lib/slides.js";
import { markAnalysisStale } from "../lib/terms.js";

const SLIDES_MAX_MB = Math.round(SLIDES_MAX_BYTES / (1024 * 1024));

export async function slidesRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/projects/:id/slides", async (request, reply) => {
    const params = ProjectIdParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid id" });

    const config = await getConfig();
    const dataDir = resolveDataDir(config);
    const project = await readProject(dataDir, params.data.id);
    if (!project) return reply.status(404).send({ error: "Project not found" });

    let file: Awaited<ReturnType<typeof request.file>>;
    try {
      // `throwFileSizeLimit` makes file.toBuffer() below reject with
      // @fastify/multipart's RequestFileTooLargeError once the stream is
      // actually truncated at the limit — request.file() itself only hands
      // back the (not-yet-fully-read) multipart part, so the size check has
      // to happen at the toBuffer() call, not here.
      file = await request.file({ limits: { fileSize: SLIDES_MAX_BYTES }, throwFileSizeLimit: true });
    } catch (err) {
      return reply.status(400).send({ error: `Invalid multipart upload: ${err instanceof Error ? err.message : String(err)}` });
    }
    if (!file) return reply.status(400).send({ error: "No file uploaded (multipart 'file' field required)" });
    // Captured now (not read off `file` again inside the withProjectLock
    // closure below) — TS's control-flow narrowing of the `!file` check
    // above doesn't survive into a nested closure over a `let` binding.
    const filename = file.filename;

    const looksLikePdf = file.mimetype === "application/pdf" || file.filename?.toLowerCase().endsWith(".pdf");
    if (!looksLikePdf) return reply.status(400).send({ error: "Only PDF files are supported" });

    let buffer: Buffer;
    try {
      buffer = await file.toBuffer();
    } catch {
      return reply.status(413).send({ error: `PDF exceeds the ${SLIDES_MAX_MB}MB upload limit` });
    }
    // Belt-and-braces — busboy's own limit above should already have thrown.
    if (exceedsSlidesSizeCap(buffer.byteLength)) {
      return reply.status(413).send({ error: `PDF exceeds the ${SLIDES_MAX_MB}MB upload limit` });
    }

    let extracted: Awaited<ReturnType<ReturnType<typeof resolveSlideExtractor>["extract"]>>;
    try {
      extracted = await resolveSlideExtractor().extract(buffer);
    } catch (err) {
      return reply.status(422).send({ error: `Could not extract text from this PDF: ${err instanceof Error ? err.message : String(err)}` });
    }

    const result = await withProjectLock(params.data.id, async () => {
      const meta = { filename, pageCount: extracted.pageCount, uploadedAt: new Date().toISOString() };
      await writeSlides(dataDir, params.data.id, { meta, pages: extracted.pages });
      const analysisMarkedStale = await markAnalysisStale(dataDir, params.data.id, "slides-changed");
      return { meta, analysisMarkedStale };
    });

    return reply.status(201).send(result);
  });

  app.get("/api/projects/:id/slides", async (request, reply) => {
    const params = ProjectIdParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid id" });
    const config = await getConfig();
    const dataDir = resolveDataDir(config);
    const project = await readProject(dataDir, params.data.id);
    if (!project) return reply.status(404).send({ error: "Project not found" });

    const slides = await readSlides(dataDir, params.data.id);
    return { meta: slides?.meta ?? null };
  });

  app.delete("/api/projects/:id/slides", async (request, reply) => {
    const params = ProjectIdParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid id" });
    const config = await getConfig();
    const dataDir = resolveDataDir(config);
    const project = await readProject(dataDir, params.data.id);
    if (!project) return reply.status(404).send({ error: "Project not found" });

    const result = await withProjectLock(params.data.id, async () => {
      const existed = await deleteSlidesFile(dataDir, params.data.id);
      // Only worth flagging stale when a deck genuinely existed — deleting
      // nothing (already-empty state) never changes what analysis was built from.
      const analysisMarkedStale = existed ? await markAnalysisStale(dataDir, params.data.id, "slides-changed") : false;
      return { ok: true as const, analysisMarkedStale };
    });

    return result;
  });
}
