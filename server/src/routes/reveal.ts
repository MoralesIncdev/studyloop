import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getConfig, resolveDataDir } from "../config.js";
import { resolveRevealTarget, revealInFinder } from "../lib/reveal.js";
import { ProjectIdParamSchema } from "../lib/models.js";
import { exportsDir, readProject } from "../lib/store.js";

const IdParamSchema = ProjectIdParamSchema;
const BodySchema = z.object({ path: z.string().optional() });

export async function revealRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/projects/:id/reveal", async (request, reply) => {
    const params = IdParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid id" });
    const body = BodySchema.safeParse(request.body ?? {});
    if (!body.success) return reply.status(400).send({ error: "Body must be { path?: string }" });

    const config = await getConfig();
    const dataDir = resolveDataDir(config);
    const project = await readProject(dataDir, params.data.id);
    if (!project) return reply.status(404).send({ error: "Project not found" });

    const target = await resolveRevealTarget(exportsDir(dataDir, params.data.id), body.data.path);
    if (target === null) {
      return reply.status(403).send({ error: "path is outside the project's exports directory" });
    }

    return revealInFinder(target);
  });
}
