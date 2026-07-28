import fs from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getConfig, resolveDataDir } from "../config.js";
import { detectProfileAndParse, parseConceptDoc } from "../lib/concepts.js";
import { readProject, writeProject } from "../lib/store.js";

const IdParamSchema = z.object({ id: z.string().min(1) });

export async function conceptsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/projects/:id/concepts", async (request, reply) => {
    const params = IdParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid id" });

    const config = await getConfig();
    const dataDir = resolveDataDir(config);
    const project = await readProject(dataDir, params.data.id);
    if (!project) return reply.status(404).send({ error: "Project not found" });

    if (!project.conceptDoc?.path) {
      return { concepts: [] };
    }

    let markdown: string;
    try {
      markdown = await fs.readFile(project.conceptDoc.path, "utf8");
    } catch {
      return reply.status(404).send({ error: "Concept doc file not found" });
    }

    const videoPath = project.source.type === "local" ? project.source.path : null;

    if (project.conceptDoc.profile) {
      const concepts = parseConceptDoc(markdown, project.conceptDoc.profile, videoPath);
      return { profile: project.conceptDoc.profile, concepts };
    }

    const { profile, cards } = detectProfileAndParse(markdown, videoPath);
    await writeProject(dataDir, { ...project, conceptDoc: { ...project.conceptDoc, profile }, updatedAt: new Date().toISOString() });
    return { profile, concepts: cards };
  });
}
