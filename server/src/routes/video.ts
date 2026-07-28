import fs from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { expandHome, getConfig, resolveRoots } from "../config.js";
import { isInsideAnyRootCanonical } from "../lib/paths.js";

const QuerySchema = z.object({ path: z.string().min(1) });

const MIME_BY_EXT: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/x-m4v",
  ".mkv": "video/x-matroska",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".avi": "video/x-msvideo",
};

interface ParsedRange {
  start: number;
  end: number;
}

/**
 * Parses a single-range `Range: bytes=...` header per RFC 7233 §2.1/§3.1.
 * Returns:
 *  - `"none"` if there was no Range header (caller should send the full file),
 *  - `"unsupported"` if the header requests multiple ranges (comma-separated)
 *    — servers MAY ignore these and fall back to a full 200 response,
 *  - `"invalid"` if the header is malformed or unsatisfiable for `size` —
 *    caller should respond 416,
 *  - a `{start, end}` pair (inclusive, clamped to `size`) otherwise.
 */
export function parseRangeHeader(
  rangeHeader: string | undefined,
  size: number
): "none" | "unsupported" | "invalid" | ParsedRange {
  if (!rangeHeader) return "none";
  const trimmed = rangeHeader.trim();
  if (trimmed.includes(",")) return "unsupported";

  const match = /^bytes=(\d*)-(\d*)$/.exec(trimmed);
  if (!match) return "invalid";
  const [, startStr, endStr] = match;
  if (startStr === "" && endStr === "") return "invalid";

  let start: number;
  let end: number;
  if (startStr === "") {
    // Suffix range: bytes=-N -> the final N bytes of the resource.
    const suffixLength = Number(endStr);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return "invalid";
    if (size === 0) return "invalid";
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(startStr);
    end = endStr === "" ? size - 1 : Number(endStr);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end || start >= size) {
    return "invalid";
  }
  return { start, end: Math.min(end, size - 1) };
}

export async function videoRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/video/stream", async (request, reply) => {
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
    const range = parseRangeHeader(request.headers.range, stat.size);

    if (range === "none" || range === "unsupported") {
      reply.header("Content-Type", contentType);
      reply.header("Content-Length", stat.size);
      reply.header("Accept-Ranges", "bytes");
      return reply.send(fs.createReadStream(filePath));
    }
    if (range === "invalid") {
      reply.header("Content-Range", `bytes */${stat.size}`);
      return reply.status(416).send();
    }

    const { start, end } = range;
    const chunkSize = end - start + 1;
    reply.status(206);
    reply.header("Content-Type", contentType);
    reply.header("Content-Range", `bytes ${start}-${end}/${stat.size}`);
    reply.header("Accept-Ranges", "bytes");
    reply.header("Content-Length", chunkSize);
    return reply.send(fs.createReadStream(filePath, { start, end }));
  });
}
