import fs from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getConfig } from "../config.js";
import { isInsideAnyRoot } from "../lib/paths.js";

const QuerySchema = z.object({ path: z.string().min(1) });

const MIME_BY_EXT: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/x-m4v",
  ".mkv": "video/x-matroska",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".avi": "video/x-msvideo",
};

export async function videoRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/video/stream", async (request, reply) => {
    const parsed = QuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Missing or invalid ?path=" });
    }
    const filePath = parsed.data.path;

    const config = await getConfig();
    if (!isInsideAnyRoot(filePath, config.libraryRoots)) {
      return reply.status(403).send({ error: "Path is outside configured library roots" });
    }

    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(filePath);
    } catch {
      return reply.status(404).send({ error: "File not found" });
    }
    if (!stat.isFile()) {
      return reply.status(404).send({ error: "Not a file" });
    }

    const contentType = MIME_BY_EXT[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
    const range = request.headers.range;

    if (!range) {
      reply.header("Content-Type", contentType);
      reply.header("Content-Length", stat.size);
      reply.header("Accept-Ranges", "bytes");
      return reply.send(fs.createReadStream(filePath));
    }

    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      reply.header("Content-Range", `bytes */${stat.size}`);
      return reply.status(416).send();
    }
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Number(match[2]) : stat.size - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= stat.size) {
      reply.header("Content-Range", `bytes */${stat.size}`);
      return reply.status(416).send();
    }

    const chunkSize = end - start + 1;
    reply.status(206);
    reply.header("Content-Type", contentType);
    reply.header("Content-Range", `bytes ${start}-${end}/${stat.size}`);
    reply.header("Accept-Ranges", "bytes");
    reply.header("Content-Length", chunkSize);
    return reply.send(fs.createReadStream(filePath, { start, end }));
  });
}
