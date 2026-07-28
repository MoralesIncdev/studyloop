import fs from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { expandHome, getConfig, resolveDataDir, resolveRoots } from "../config.js";
import { isPathAllowedCanonical } from "../lib/paths.js";
import { detectProfileAndParse, parseConceptDoc } from "../lib/concepts.js";
import { ProjectIdParamSchema } from "../lib/models.js";
import { readProject } from "../lib/store.js";

const IdParamSchema = ProjectIdParamSchema;

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

    // Concept-doc path is stored on the project (validated, and expanded, at
    // creation/PATCH time), but roots can change via Settings after that —
    // revalidate here too rather than trusting whatever's on disk. Also
    // re-expand `~` defensively, in case this project.json predates that fix.
    const conceptDocPath = expandHome(project.conceptDoc.path);
    if (!(await isPathAllowedCanonical(conceptDocPath, resolveRoots(config)))) {
      return reply.status(403).send({ error: "conceptDoc.path is outside configured roots" });
    }

    let markdown: string;
    try {
      markdown = await fs.readFile(conceptDocPath, "utf8");
    } catch {
      return reply.status(404).send({ error: "Concept doc file not found" });
    }

    const videoPath = project.source.type === "local" ? project.source.path : null;

    if (project.conceptDoc.profile) {
      const concepts = parseConceptDoc(markdown, project.conceptDoc.profile, videoPath);
      return { profile: project.conceptDoc.profile, concepts };
    }

    // GET must not have write side effects: detect the profile fresh on every
    // request instead of persisting it back onto the project. Persisting from
    // a GET raced with concurrent writers (two GETs, or a GET racing a PATCH,
    // could stomp each other's project.json) and is surprising for a read
    // endpoint besides. Re-running detection is cheap (markdown regex parse).
    const { profile, cards } = detectProfileAndParse(markdown, videoPath);
    return { profile, concepts: cards };
  });
}
