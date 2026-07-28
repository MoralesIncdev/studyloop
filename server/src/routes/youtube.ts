import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { resolveYoutube, YtDlpNotFoundError } from "../lib/ytdlp.js";

const BodySchema = z.object({ url: z.string().url() });

export async function youtubeRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/youtube/resolve", async (request, reply) => {
    const parsed = BodySchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Body must be { url: string }" });

    try {
      const result = await resolveYoutube(parsed.data.url);
      return result;
    } catch (err) {
      if (err instanceof YtDlpNotFoundError) {
        return reply.status(200).send({
          videoId: null,
          title: null,
          error: "yt-dlp is not installed; playback still works but captions cannot be resolved.",
        });
      }
      return reply.status(502).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}
