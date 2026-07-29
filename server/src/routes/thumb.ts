// codex P1-1 "real thumbnails": GET /api/thumb?path=<video path> — same
// canonical-path guard as routes/video.ts's stream endpoint (only paths
// inside a configured library root are servable), backed by
// lib/thumbnails.ts's generate-on-demand + on-disk cache.
import fs from "node:fs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { expandHome, getConfig, resolveRoots } from "../config.js";
import { isInsideAnyRootCanonical } from "../lib/paths.js";
import { getOrCreateThumbnail } from "../lib/thumbnails.js";

const QuerySchema = z.object({ path: z.string().min(1) });

export async function thumbRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/thumb", async (request, reply) => {
    const parsed = QuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Missing or invalid ?path=" });
    }
    const filePath = expandHome(parsed.data.path);

    const config = await getConfig();
    const { libraryRoots } = resolveRoots(config);
    if (!(await isInsideAnyRootCanonical(filePath, libraryRoots))) {
      return reply.status(403).send({ error: "Path is outside configured library roots" });
    }

    const thumbPath = await getOrCreateThumbnail(filePath);
    if (!thumbPath) {
      return reply.status(404).send({ error: "No thumbnail available for this video" });
    }

    reply.header("Content-Type", "image/jpeg");
    // Cache key is content-addressed (path+mtime hash) — safe to cache
    // aggressively; a changed file gets a new URL-equivalent cache entry
    // automatically, it just can't invalidate this exact response until the
    // hash changes, which only happens when the file itself changes.
    reply.header("Cache-Control", "public, max-age=86400");
    return reply.send(fs.createReadStream(thumbPath));
  });
}
