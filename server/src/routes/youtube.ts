import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { InvalidYoutubeUrlError, resolveYoutube } from "../lib/ytdlp.js";

const BodySchema = z.object({ url: z.string().url() });

export async function youtubeRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/youtube/resolve", async (request, reply) => {
    const parsed = BodySchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Body must be { url: string }" });

    try {
      const result = await resolveYoutube(parsed.data.url);
      return result;
    } catch (err) {
      if (err instanceof InvalidYoutubeUrlError) {
        return reply.status(400).send({ error: err.message });
      }
      return reply.status(502).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}
