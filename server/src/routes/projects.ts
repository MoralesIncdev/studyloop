import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getConfig, resolveDataDir } from "../config.js";
import { isInsideAnyRoot, isPathAllowed } from "../lib/paths.js";
import {
  BubbleSchema,
  CreateBubbleBodySchema,
  CreateProjectBodySchema,
  PatchBubbleBodySchema,
  PatchProjectBodySchema,
  type Bubble,
  type Project,
} from "../lib/models.js";
import { newId, readBubbles, readNotes, readProject, listProjectIds, writeBubbles, writeNotes, writeProject } from "../lib/store.js";

const IdParamSchema = z.object({ id: z.string().min(1) });

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

    if (body.source.type === "local" && !isInsideAnyRoot(body.source.path, config.libraryRoots)) {
      return reply.status(403).send({ error: "source.path is outside configured library roots" });
    }
    if (body.transcriptPath && !isPathAllowed(body.transcriptPath, config)) {
      return reply.status(403).send({ error: "transcriptPath is outside configured roots" });
    }
    if (body.conceptDocPath && !isPathAllowed(body.conceptDocPath, config)) {
      return reply.status(403).send({ error: "conceptDocPath is outside configured roots" });
    }

    const now = new Date().toISOString();
    const project: Project = {
      id: newId(),
      title: body.title ?? (body.source.type === "local" ? titleFromLocalPath(body.source.path) : "YouTube video"),
      source: body.source,
      transcript: body.transcriptPath ? { type: "file", path: body.transcriptPath } : { type: "none" },
      conceptDoc: body.conceptDocPath ? { path: body.conceptDocPath, profile: body.conceptDocProfile } : undefined,
      createdAt: now,
      updatedAt: now,
      lastPosition: 0,
    };
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
    const existing = await readProject(dataDir, params.data.id);
    if (!existing) return reply.status(404).send({ error: "Project not found" });

    const updated: Project = {
      ...existing,
      ...parsed.data,
      updatedAt: new Date().toISOString(),
    };
    await writeProject(dataDir, updated);
    return updated;
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
    const project = await readProject(dataDir, params.data.id);
    if (!project) return reply.status(404).send({ error: "Project not found" });
    await writeNotes(dataDir, params.data.id, content);
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
    const project = await readProject(dataDir, params.data.id);
    if (!project) return reply.status(404).send({ error: "Project not found" });

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
    return reply.status(201).send(bubble);
  });

  app.patch("/api/projects/:id/bubbles/:bubbleId", async (request, reply) => {
    const params = z.object({ id: z.string(), bubbleId: z.string() }).safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid id" });
    const parsed = PatchBubbleBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid patch body", details: parsed.error.flatten() });
    }
    const config = await getConfig();
    const dataDir = resolveDataDir(config);
    const project = await readProject(dataDir, params.data.id);
    if (!project) return reply.status(404).send({ error: "Project not found" });

    const bubbles = await readBubbles(dataDir, params.data.id);
    const idx = bubbles.findIndex((b) => b.id === params.data.bubbleId);
    if (idx === -1) return reply.status(404).send({ error: "Bubble not found" });
    const updated: Bubble = BubbleSchema.parse({ ...bubbles[idx], ...parsed.data });
    bubbles[idx] = updated;
    await writeBubbles(dataDir, params.data.id, bubbles);
    return updated;
  });

  app.delete("/api/projects/:id/bubbles/:bubbleId", async (request, reply) => {
    const params = z.object({ id: z.string(), bubbleId: z.string() }).safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid id" });
    const config = await getConfig();
    const dataDir = resolveDataDir(config);
    const project = await readProject(dataDir, params.data.id);
    if (!project) return reply.status(404).send({ error: "Project not found" });

    const bubbles = await readBubbles(dataDir, params.data.id);
    const next = bubbles.filter((b) => b.id !== params.data.bubbleId);
    if (next.length === bubbles.length) return reply.status(404).send({ error: "Bubble not found" });
    await writeBubbles(dataDir, params.data.id, next);
    return { ok: true };
  });
}
