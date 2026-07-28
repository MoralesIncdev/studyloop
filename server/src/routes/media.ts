import fs from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getConfig, resolveDataDir } from "../config.js";
import { readProject, shotsDir } from "../lib/store.js";

const ParamsSchema = z.object({ projectId: z.string().min(1), file: z.string().min(1) });

export async function mediaRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/media/:projectId/shots/*", async (request, reply) => {
    const rawParams = request.params as { projectId: string; "*": string };
    const parsed = ParamsSchema.safeParse({ projectId: rawParams.projectId, file: rawParams["*"] });
    if (!parsed.success) return reply.status(400).send({ error: "Invalid path" });

    // Reject traversal in the filename itself before joining.
    if (parsed.data.file.includes("..")) {
      return reply.status(403).send({ error: "Invalid file path" });
    }

    const config = await getConfig();
    const dataDir = resolveDataDir(config);
    const project = await readProject(dataDir, parsed.data.projectId);
    if (!project) return reply.status(404).send({ error: "Project not found" });

    const dir = shotsDir(dataDir, parsed.data.projectId);
    const filePath = path.join(dir, parsed.data.file);
    if (!filePath.startsWith(dir + path.sep) && filePath !== dir) {
      return reply.status(403).send({ error: "Invalid file path" });
    }

    try {
      const stat = await fs.promises.stat(filePath);
      if (!stat.isFile()) throw new Error("not a file");
    } catch {
      return reply.status(404).send({ error: "Shot not found" });
    }

    reply.header("Content-Type", "image/jpeg");
    return reply.send(fs.createReadStream(filePath));
  });
}
