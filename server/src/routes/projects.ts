import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { expandHome, getConfig, resolveDataDir, resolveRoots } from "../config.js";
import { isInsideAnyRootCanonical, isPathAllowedCanonical } from "../lib/paths.js";
import { assertValidYoutubeUrl, InvalidYoutubeUrlError } from "../lib/ytdlp.js";
import {
  BubbleSchema,
  CreateBubbleBodySchema,
  CreateProjectBodySchema,
  PatchBubbleBodySchema,
  PatchProjectBodySchema,
  ProjectIdParamSchema,
  type Bubble,
  type Project,
} from "../lib/models.js";
import {
  mergeConceptRationales,
  newId,
  nextWatchedUpTo,
  readBubbles,
  readNotes,
  readProject,
  listProjectIds,
  withProjectLock,
  writeBubbles,
  writeCaptions,
  writeNotes,
  writeProject,
} from "../lib/store.js";

const IdParamSchema = ProjectIdParamSchema;

function titleFromLocalPath(p: string): string {
  const base = p.split("/").pop() ?? p;
  return base.replace(/\.[^.]+$/, "");
}

export async function projectsRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/projects", async (request, reply) => {
    const parsed = CreateProjectBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid project body", details: parsed.error.flatten() });
    }
    const body = parsed.data;
    const config = await getConfig();
    const dataDir = resolveDataDir(config);
    const roots = resolveRoots(config);

    // `~` is expanded server-side before every root comparison — roots
    // themselves are always resolved+expanded (see config.ts resolveRoots),
    // so an incoming `~/...` path would otherwise never match even a
    // legitimately-configured root (the literal string "~" isn't a real
    // filesystem path).
    if (body.source.type === "local") body.source.path = expandHome(body.source.path);
    if (body.transcriptPath) body.transcriptPath = expandHome(body.transcriptPath);
    if (body.conceptDocPath) body.conceptDocPath = expandHome(body.conceptDocPath);

    if (body.source.type === "local" && !(await isInsideAnyRootCanonical(body.source.path, roots.libraryRoots))) {
      return reply.status(403).send({ error: "source.path is outside configured library roots" });
    }
    if (body.source.type === "youtube") {
      try {
        assertValidYoutubeUrl(body.source.url);
      } catch (err) {
        if (err instanceof InvalidYoutubeUrlError) {
          return reply.status(400).send({ error: err.message });
        }
        throw err;
      }
    }
    if (body.transcriptPath && !(await isPathAllowedCanonical(body.transcriptPath, roots))) {
      return reply.status(403).send({ error: "transcriptPath is outside configured roots" });
    }
    if (body.conceptDocPath && !(await isPathAllowedCanonical(body.conceptDocPath, roots))) {
      return reply.status(403).send({ error: "conceptDocPath is outside configured roots" });
    }

    // YouTube captions (resolved client-side via POST /api/youtube/resolve
    // before this call) get persisted as captions.json and wired up as the
    // project's transcript, same as any other transcript file — the client
    // never sees or manages a separate "captions" concept after this point.
    const hasYoutubeCaptions = body.source.type === "youtube" && !!body.captions && body.captions.length > 0;

    const now = new Date().toISOString();
    const id = newId();
    const project: Project = {
      id,
      title: body.title ?? (body.source.type === "local" ? titleFromLocalPath(body.source.path) : "YouTube video"),
      source: body.source,
      transcript: hasYoutubeCaptions
        ? { type: "file", path: "captions.json" }
        : body.transcriptPath
          ? { type: "file", path: body.transcriptPath }
          : { type: "none" },
      conceptDoc: body.conceptDocPath ? { path: body.conceptDocPath, profile: body.conceptDocProfile } : undefined,
      createdAt: now,
      updatedAt: now,
      lastPosition: 0,
      watchedUpTo: 0,
      // author/related only make sense for youtube sources — POST
      // /api/youtube/resolve (V2-B) resolves both before project creation,
      // same pattern as captions above.
      author: body.source.type === "youtube" ? body.author : undefined,
      related: body.source.type === "youtube" ? body.related : undefined,
    };
    if (hasYoutubeCaptions && body.captions) {
      await writeCaptions(dataDir, id, body.captions);
    }
    await writeProject(dataDir, project);
    return reply.status(201).send(project);
  });

  app.get("/api/projects", async () => {
    const config = await getConfig();
    const dataDir = resolveDataDir(config);
    const ids = await listProjectIds(dataDir);
    const projects = await Promise.all(ids.map((id) => readProject(dataDir, id)));
    return { projects: projects.filter((p): p is Project => p !== null) };
  });

  app.get("/api/projects/:id", async (request, reply) => {
    const params = IdParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid id" });
    const config = await getConfig();
    const dataDir = resolveDataDir(config);
    const project = await readProject(dataDir, params.data.id);
    if (!project) return reply.status(404).send({ error: "Project not found" });
    return project;
  });

  app.patch("/api/projects/:id", async (request, reply) => {
    const params = IdParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid id" });
    const parsed = PatchProjectBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid patch body", details: parsed.error.flatten() });
    }
    const config = await getConfig();
    const dataDir = resolveDataDir(config);
    const roots = resolveRoots(config);

    // Revalidate any path-bearing fields exactly like project creation does —
    // otherwise PATCH is a second, unguarded way to point a project at an
    // arbitrary file on disk. Expand `~` first, same reasoning as creation —
    // this is what makes a `~/...` entry from configured conceptDocs (e.g.
    // ConceptsDock's "attach" buttons, which echo GET /api/config's raw,
    // unexpanded conceptDocs list) actually resolve when clicked.
    const patch = parsed.data;
    if (patch.conceptDoc?.path) patch.conceptDoc.path = expandHome(patch.conceptDoc.path);
    if (patch.transcript?.type === "file") patch.transcript.path = expandHome(patch.transcript.path);
    if (patch.conceptDoc?.path && !(await isPathAllowedCanonical(patch.conceptDoc.path, roots))) {
      return reply.status(403).send({ error: "conceptDoc.path is outside configured roots" });
    }
    if (patch.transcript?.type === "file" && !(await isPathAllowedCanonical(patch.transcript.path, roots))) {
      return reply.status(403).send({ error: "transcript.path is outside configured roots" });
    }

    const result = await withProjectLock(params.data.id, async () => {
      const existing = await readProject(dataDir, params.data.id);
      if (!existing) return null;

      const updated: Project = {
        ...existing,
        ...patch,
        watchedUpTo: nextWatchedUpTo(existing.watchedUpTo, patch.watchedUpTo),
        conceptRationales: mergeConceptRationales(existing.conceptRationales, patch.conceptRationales),
        updatedAt: new Date().toISOString(),
      };
      await writeProject(dataDir, updated);
      return updated;
    });
    if (!result) return reply.status(404).send({ error: "Project not found" });
    return result;
  });

  // --- notes ---------------------------------------------------------------

  app.get("/api/projects/:id/notes", async (request, reply) => {
    const params = IdParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid id" });
    const config = await getConfig();
    const dataDir = resolveDataDir(config);
    const project = await readProject(dataDir, params.data.id);
    if (!project) return reply.status(404).send({ error: "Project not found" });
    const content = await readNotes(dataDir, params.data.id);
    reply.header("Content-Type", "text/markdown; charset=utf-8");
    return content;
  });

  app.put("/api/projects/:id/notes", async (request, reply) => {
    const params = IdParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid id" });
    const bodySchema = z.union([z.string(), z.object({ content: z.string() })]);
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Body must be raw markdown text" });
    const content = typeof parsed.data === "string" ? parsed.data : parsed.data.content;

    const config = await getConfig();
    const dataDir = resolveDataDir(config);

    const result = await withProjectLock(params.data.id, async () => {
      const project = await readProject(dataDir, params.data.id);
      if (!project) return false;
      await writeNotes(dataDir, params.data.id, content);
      return true;
    });
    if (!result) return reply.status(404).send({ error: "Project not found" });
    return { ok: true };
  });

  // --- bubbles ---------------------------------------------------------------

  app.get("/api/projects/:id/bubbles", async (request, reply) => {
    const params = IdParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid id" });
    const config = await getConfig();
    const dataDir = resolveDataDir(config);
    const project = await readProject(dataDir, params.data.id);
    if (!project) return reply.status(404).send({ error: "Project not found" });
    const bubbles = await readBubbles(dataDir, params.data.id);
    return { bubbles };
  });

  app.post("/api/projects/:id/bubbles", async (request, reply) => {
    const params = IdParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid id" });
    const parsed = CreateBubbleBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid bubble body", details: parsed.error.flatten() });
    }
    const config = await getConfig();
    const dataDir = resolveDataDir(config);

    const result = await withProjectLock(params.data.id, async () => {
      const project = await readProject(dataDir, params.data.id);
      if (!project) return null;

      const bubbles = await readBubbles(dataDir, params.data.id);
      const bubble: Bubble = {
        id: newId(),
        t: parsed.data.t,
        text: parsed.data.text,
        shot: parsed.data.shot ?? null,
        createdAt: new Date().toISOString(),
      };
      bubbles.push(bubble);
      await writeBubbles(dataDir, params.data.id, bubbles);
      return bubble;
    });
    if (!result) return reply.status(404).send({ error: "Project not found" });
    return reply.status(201).send(result);
  });

  app.patch("/api/projects/:id/bubbles/:bubbleId", async (request, reply) => {
    const params = z.object({ id: z.string().uuid(), bubbleId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid id" });
    const parsed = PatchBubbleBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid patch body", details: parsed.error.flatten() });
    }
    const config = await getConfig();
    const dataDir = resolveDataDir(config);

    const result = await withProjectLock(params.data.id, async () => {
      const project = await readProject(dataDir, params.data.id);
      if (!project) return { kind: "no-project" as const };

      const bubbles = await readBubbles(dataDir, params.data.id);
      const idx = bubbles.findIndex((b) => b.id === params.data.bubbleId);
      if (idx === -1) return { kind: "no-bubble" as const };
      const updated: Bubble = BubbleSchema.parse({ ...bubbles[idx], ...parsed.data });
      bubbles[idx] = updated;
      await writeBubbles(dataDir, params.data.id, bubbles);
      return { kind: "ok" as const, bubble: updated };
    });
    if (result.kind === "no-project") return reply.status(404).send({ error: "Project not found" });
    if (result.kind === "no-bubble") return reply.status(404).send({ error: "Bubble not found" });
    return result.bubble;
  });

  app.delete("/api/projects/:id/bubbles/:bubbleId", async (request, reply) => {
    const params = z.object({ id: z.string().uuid(), bubbleId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid id" });
    const config = await getConfig();
    const dataDir = resolveDataDir(config);

    const result = await withProjectLock(params.data.id, async () => {
      const project = await readProject(dataDir, params.data.id);
      if (!project) return "no-project" as const;

      const bubbles = await readBubbles(dataDir, params.data.id);
      const next = bubbles.filter((b) => b.id !== params.data.bubbleId);
      if (next.length === bubbles.length) return "no-bubble" as const;
      await writeBubbles(dataDir, params.data.id, next);
      return "ok" as const;
    });
    if (result === "no-project") return reply.status(404).send({ error: "Project not found" });
    if (result === "no-bubble") return reply.status(404).send({ error: "Bubble not found" });
    return { ok: true };
  });
}
