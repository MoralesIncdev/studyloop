import type { FastifyInstance } from "fastify";
import { getConfig, resolveRoots } from "../config.js";
import { getLibrary } from "../lib/libraryScanCache.js";
import { performSearch, SearchQuerySchema } from "../lib/search.js";

export async function searchRoutes(app: FastifyInstance): Promise<void> {
  // SPEC "Fast YouTube layer": {library, youtube} — library is a substring
  // match over the cached library scan, youtube via Innertube search (see
  // lib/search.ts / lib/innertube.ts). The youtube half is best-effort: an
  // Innertube failure yields an empty array here, never a 502 for the whole
  // request — a search is still useful with library-only results.
  app.get("/api/search", async (request, reply) => {
    const parsed = SearchQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "q must be 1-100 characters", details: parsed.error.flatten() });
    }
    const config = await getConfig();
    const roots = resolveRoots(config);
    const { items } = await getLibrary({ libraryRoots: roots.libraryRoots, transcriptRoots: roots.transcriptRoots });
    return performSearch(items, parsed.data.q, parsed.data.intent);
  });
}
