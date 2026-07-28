import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getConfig, resolveDataDir } from "../config.js";
import { extractFrame } from "../lib/frames.js";
import { ProjectIdParamSchema } from "../lib/models.js";
import { readProject, shotsDir } from "../lib/store.js";
import { resolveStreamUrl } from "../lib/ytdlp.js";

const IdParamSchema = ProjectIdParamSchema;
const BodySchema = z.object({ t: z.number().nonnegative() });

export async function captureRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/projects/:id/shots", async (request, reply) => {
    const params = IdParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid id" });
    const body = BodySchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Body must be { t: number }" });

    const config = await getConfig();
    const dataDir = resolveDataDir(config);
    const project = await readProject(dataDir, params.data.id);
    if (!project) return reply.status(404).send({ error: "Project not found" });

    let source: string;
    try {
      source = project.source.type === "local" ? project.source.path : await resolveStreamUrl(project.source.url);
    } catch (err) {
      return reply.send({ shot: null, error: err instanceof Error ? err.message : String(err) });
    }

    const fileName = `shot-${Math.round(body.data.t * 1000)}.jpg`;
    const outPath = path.join(shotsDir(dataDir, params.data.id), fileName);
    try {
      await extractFrame(source, body.data.t, outPath);
    } catch (err) {
      return reply.send({ shot: null, error: err instanceof Error ? err.message : String(err) });
    }
    return { shot: `shots/${fileName}` };
  });
}
