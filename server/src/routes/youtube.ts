// V2-B "Fast YouTube layer" (SPEC). POST /api/youtube/resolve now answers
// from Innertube first (target <2s warm — see innertube.ts's 15-min cache),
// falling back to the original yt-dlp path only when Innertube comes back
// with nothing usable (network-blocked, API drift, or a video Innertube
// can't resolve for some other reason). yt-dlp itself is untouched — same
// hardening (URL allowlist, spawn timeout, stdout cap) as before.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getConfig, resolveDataDir } from "../config.js";
import { extractVideoId, InvalidYoutubeUrlError, assertValidYoutubeUrl, resolveYoutube } from "../lib/ytdlp.js";
import { relatedFor, resolveVideo } from "../lib/innertube.js";
import { readProject, withProjectLock, writeProject } from "../lib/store.js";
import type { Project } from "../lib/models.js";

const ResolveBodySchema = z.object({ url: z.string().url() });

const RelatedBodySchema = z.object({
  videoId: z.string().min(1),
  // The literal SPEC line reads `POST /api/youtube/related {videoId}` — in
  // practice the route also needs to know *which* project's cached `related`
  // to overwrite (a videoId alone doesn't uniquely identify a project: two
  // projects could in principle point at the same video), so this accepts
  // `projectId` too. Documented as a deviation in SPEC.md.
  projectId: z.string().uuid(),
});

export async function youtubeRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/youtube/resolve", async (request, reply) => {
    const parsed = ResolveBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Body must be { url: string }" });
    const url = parsed.data.url;

    try {
      assertValidYoutubeUrl(url);
    } catch (err) {
      if (err instanceof InvalidYoutubeUrlError) return reply.status(400).send({ error: err.message });
      throw err;
    }

    const videoId = extractVideoId(url);
    if (videoId) {
      const started = Date.now();
      const resolved = await resolveVideo(videoId);
      const elapsedMs = Date.now() - started;
      if (resolved.title || resolved.captions) {
        app.log.info({ videoId, elapsedMs }, "youtube resolve: innertube hit");
        return {
          videoId,
          title: resolved.title,
          author: resolved.author ?? undefined,
          durationSeconds: resolved.durationSeconds ?? undefined,
          captions: resolved.captions ?? undefined,
          related: resolved.related,
        };
      }
      app.log.info({ videoId, elapsedMs }, "youtube resolve: innertube miss, falling back to yt-dlp");
    }

    // Innertube came back empty (or the URL's videoId couldn't be extracted
    // locally at all, e.g. a playlist link) — fall back to the original
    // yt-dlp path, unchanged from v1/V2-A.
    try {
      const legacy = await resolveYoutube(url);
      return { ...legacy, related: [] };
    } catch (err) {
      return reply.status(502).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // SPEC "Fast YouTube layer": refreshes a project's cached `related` list.
  // Bypasses innertube.ts's 15-min cache (this route only exists to force a
  // fresh look), then persists into project.json the same way any other
  // project field update does (withProjectLock — see lib/store.ts).
  app.post("/api/youtube/related", async (request, reply) => {
    const parsed = RelatedBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Body must be { videoId: string, projectId: string }" });
    }
    const config = await getConfig();
    const dataDir = resolveDataDir(config);
    const related = await relatedFor(parsed.data.videoId, { bypassCache: true });

    const result = await withProjectLock(parsed.data.projectId, async () => {
      const existing = await readProject(dataDir, parsed.data.projectId);
      if (!existing) return null;
      const updated: Project = { ...existing, related, updatedAt: new Date().toISOString() };
      await writeProject(dataDir, updated);
      return updated;
    });
    if (!result) return reply.status(404).send({ error: "Project not found" });
    return result;
  });
}
