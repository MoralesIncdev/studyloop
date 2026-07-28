import fs from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getConfig, resolveDataDir, resolveRoots } from "../config.js";
import { resolveTranscriptPath } from "../lib/transcriptResolve.js";
import { loadTranscriptFromText, TranscriptParseError } from "../lib/transcripts.js";

const QuerySchema = z.object({ path: z.string().min(1), projectId: z.string().min(1).optional() });

export async function transcriptRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/transcript", async (request, reply) => {
    const parsed = QuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Missing or invalid ?path=" });
    }

    const config = await getConfig();
    const dataDir = resolveDataDir(config);
    const resolved = await resolveTranscriptPath(dataDir, resolveRoots(config), parsed.data.path, parsed.data.projectId);
    if (!resolved.ok) return reply.status(resolved.status).send({ error: resolved.error });
    const filePath = resolved.filePath;

    let raw: string;
    try {
      raw = await fs.readFile(filePath, "utf8");
    } catch {
      return reply.status(404).send({ error: "Transcript file not found" });
    }

    try {
      const transcript = loadTranscriptFromText(filePath, raw);
      return transcript;
    } catch (err) {
      if (err instanceof TranscriptParseError) {
        return reply.status(422).send({ error: err.message });
      }
      throw err;
    }
  });
}
