import fs from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getConfig, resolveRoots } from "../config.js";
import { isPathAllowedCanonical } from "../lib/paths.js";
import { loadTranscriptFromText, TranscriptParseError } from "../lib/transcripts.js";

const QuerySchema = z.object({ path: z.string().min(1) });

export async function transcriptRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/transcript", async (request, reply) => {
    const parsed = QuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Missing or invalid ?path=" });
    }
    const filePath = parsed.data.path;

    const config = await getConfig();
    if (!(await isPathAllowedCanonical(filePath, resolveRoots(config)))) {
      return reply.status(403).send({ error: "Path is outside configured roots" });
    }

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
