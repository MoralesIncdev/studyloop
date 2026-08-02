import type { FastifyInstance } from "fastify";
import { AsrConfigSchema, ConfigPatchSchema, getConfig, redactConfig, updateConfig } from "../config.js";

export async function configRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/config", async () => {
    return redactConfig(await getConfig());
  });

  app.put("/api/config", async (request, reply) => {
    const parsed = ConfigPatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid config", details: parsed.error.flatten() });
    }
    if (parsed.data.asr) {
      // Phase 11 "Bring-your-own local ASR adapters": cross-field validation
      // (command mode needs a well-formed template) has to run against the
      // fully-MERGED asr config, not the raw patch (see AsrConfigPatchSchema's
      // doc comment) — updateConfig performs the identical merge internally,
      // but checking it here first means a bad merge gets a clean 400 instead
      // of an uncaught throw from updateConfig's own `ConfigSchema.parse`.
      const current = await getConfig();
      const mergedAsr = { ...current.asr, ...parsed.data.asr };
      const asrCheck = AsrConfigSchema.safeParse(mergedAsr);
      if (!asrCheck.success) {
        return reply.status(400).send({ error: "Invalid ASR config", details: asrCheck.error.flatten() });
      }
    }
    const updated = await updateConfig(parsed.data);
    // Never echo the secret back, even the value the caller just sent us.
    return redactConfig(updated);
  });
}
