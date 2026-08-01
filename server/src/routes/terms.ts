// Phase 2 "Terminology layer v1" (design/EXECUTION-PLAN-post-review-v1.md):
// GET the project's own terminology corrections, PATCH to add/edit/remove
// mappings. Mirrors routes/attestation.ts's GET/PATCH shape (validate ->
// withProjectLock -> read-modify-write -> return the updated state).
import type { FastifyInstance } from "fastify";
import { PatchTermsBodySchema, ProjectIdParamSchema, type TermsFile } from "../lib/models.js";
import { getConfig, resolveDataDir } from "../config.js";
import { markAnalysisStale, readTerms, writeTerms } from "../lib/terms.js";
import { readProject, withProjectLock } from "../lib/store.js";

export async function termsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/projects/:id/terms", async (request, reply) => {
    const params = ProjectIdParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid id" });
    const config = await getConfig();
    const dataDir = resolveDataDir(config);
    const project = await readProject(dataDir, params.data.id);
    if (!project) return reply.status(404).send({ error: "Project not found" });
    const terms = await readTerms(dataDir, params.data.id);
    return { terms };
  });

  app.patch("/api/projects/:id/terms", async (request, reply) => {
    const params = ProjectIdParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid id" });
    const body = PatchTermsBodySchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Invalid patch body", details: body.error.flatten() });
    const { upsert, remove } = body.data;
    if ((!upsert || Object.keys(upsert).length === 0) && (!remove || remove.length === 0)) {
      return reply.status(400).send({ error: "Body must include a non-empty upsert and/or remove" });
    }

    const config = await getConfig();
    const dataDir = resolveDataDir(config);

    const result = await withProjectLock(params.data.id, async () => {
      const project = await readProject(dataDir, params.data.id);
      if (!project) return null;

      const existing = await readTerms(dataDir, params.data.id);
      const next: TermsFile = { ...existing };
      const now = new Date().toISOString();

      for (const [garbled, correct] of Object.entries(upsert ?? {})) {
        // Editing an already-known garbled key keeps its original createdAt
        // (this is a correction, not a brand-new entry); a genuinely new key
        // gets `now`.
        const priorCreatedAt = next[garbled]?.createdAt;
        next[garbled] = { correct, source: "user", createdAt: priorCreatedAt ?? now };
      }
      for (const garbled of remove ?? []) {
        delete next[garbled];
      }

      await writeTerms(dataDir, params.data.id, next);
      // Downstream invalidation (Phase 2 item 5): a term mapping changing
      // means anything already extracted from the uncorrected transcript
      // (pearls/concepts/units) may itself be built on the garbled text —
      // flag it, but never auto-re-run analysis (SPEC: "smallest honest
      // slice"). Best-effort: a project with no analysis yet has nothing to
      // mark stale, which is not an error.
      const analysisMarkedStale = await markAnalysisStale(dataDir, params.data.id);
      return { terms: next, analysisMarkedStale };
    });

    if (!result) return reply.status(404).send({ error: "Project not found" });
    return result;
  });
}
