// V3-B review fix #7 "AI pearls enter review without learner attestation or
// generation" (PEDAGOGY §5 path (b)): POST marks one pearl (identified by
// its anchor timestamp — see lib/review.ts's pearlReviewKey) as explicitly
// added to review by the learner. Idempotent (adding an already-added pearl
// is a no-op that still returns 200) since the rail's "Add to review" button
// hides itself once added but a stale/duplicate click shouldn't error.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getConfig, resolveDataDir } from "../config.js";
import { ProjectIdParamSchema } from "../lib/models.js";
import { readPearlReviewAdds, writePearlReviewAdds } from "../lib/pearlReviewStore.js";
import { pearlReviewKey } from "../lib/review.js";
import { readProject, withProjectLock } from "../lib/store.js";

const PearlReviewAddParamSchema = ProjectIdParamSchema.extend({ t: z.coerce.number().nonnegative() });

export async function pearlReviewRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/projects/:id/pearls/review-adds", async (request, reply) => {
    const params = ProjectIdParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid id" });
    const config = await getConfig();
    const dataDir = resolveDataDir(config);
    const project = await readProject(dataDir, params.data.id);
    if (!project) return reply.status(404).send({ error: "Project not found" });
    const added = await readPearlReviewAdds(dataDir, params.data.id);
    return { added: [...added] };
  });

  app.post("/api/projects/:id/pearls/:t/review-add", async (request, reply) => {
    const params = PearlReviewAddParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid id or timestamp" });

    const config = await getConfig();
    const dataDir = resolveDataDir(config);

    const result = await withProjectLock(params.data.id, async () => {
      const project = await readProject(dataDir, params.data.id);
      if (!project) return null;
      const current = await readPearlReviewAdds(dataDir, params.data.id);
      current.add(pearlReviewKey(params.data.t));
      await writePearlReviewAdds(dataDir, params.data.id, current);
      return current;
    });
    if (!result) return reply.status(404).send({ error: "Project not found" });
    return { added: [...result] };
  });
}
