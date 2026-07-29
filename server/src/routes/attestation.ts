// V3-B B2 "Attestation + reveal-gating" (SPEC): GET the full per-project
// attestations.json, PATCH one unit's entry (attest / edit / save a "your
// take" generation attempt — all the same partial-merge shape), DELETE to
// clear an entry (undo a dismiss, or reset a unit back to unreviewed).
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getConfig, resolveDataDir } from "../config.js";
import { AttestationStatusSchema } from "../lib/attestation.js";
import { readAttestations, writeAttestations } from "../lib/attestationStore.js";
import { ProjectIdParamSchema } from "../lib/models.js";
import { readProject, withProjectLock } from "../lib/store.js";

const UnitParamSchema = ProjectIdParamSchema.extend({ unitId: z.string().min(1) });

const PatchBodySchema = z.object({
  status: AttestationStatusSchema.optional(),
  userTake: z.string().optional(),
  userBody: z.string().optional(),
});

export async function attestationRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/projects/:id/attestations", async (request, reply) => {
    const params = ProjectIdParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid id" });
    const config = await getConfig();
    const dataDir = resolveDataDir(config);
    const project = await readProject(dataDir, params.data.id);
    if (!project) return reply.status(404).send({ error: "Project not found" });
    return readAttestations(dataDir, params.data.id);
  });

  app.patch("/api/projects/:id/attestations/:unitId", async (request, reply) => {
    const params = UnitParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid id" });
    const body = PatchBodySchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: "Invalid attestation body", details: body.error.flatten() });

    const config = await getConfig();
    const dataDir = resolveDataDir(config);

    const result = await withProjectLock(params.data.id, async () => {
      const project = await readProject(dataDir, params.data.id);
      if (!project) return null;
      const state = await readAttestations(dataDir, params.data.id);
      const existing = state[params.data.unitId];
      const next = {
        ...existing,
        ...body.data,
        at: new Date().toISOString(),
      };
      const nextState = { ...state, [params.data.unitId]: next };
      await writeAttestations(dataDir, params.data.id, nextState);
      return nextState;
    });
    if (!result) return reply.status(404).send({ error: "Project not found" });
    return result;
  });

  app.delete("/api/projects/:id/attestations/:unitId", async (request, reply) => {
    const params = UnitParamSchema.safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: "Invalid id" });

    const config = await getConfig();
    const dataDir = resolveDataDir(config);

    const result = await withProjectLock(params.data.id, async () => {
      const project = await readProject(dataDir, params.data.id);
      if (!project) return null;
      const state = await readAttestations(dataDir, params.data.id);
      if (!(params.data.unitId in state)) return state;
      const next = { ...state };
      delete next[params.data.unitId];
      await writeAttestations(dataDir, params.data.id, next);
      return next;
    });
    if (!result) return reply.status(404).send({ error: "Project not found" });
    return result;
  });
}
