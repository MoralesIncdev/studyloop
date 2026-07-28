import type { FastifyInstance } from "fastify";
import { ConfigSchema, getConfig, redactConfig, updateConfig } from "../config.js";

export async function configRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/config", async () => {
    return redactConfig(await getConfig());
  });

  app.put("/api/config", async (request, reply) => {
    const parsed = ConfigSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid config", details: parsed.error.flatten() });
    }
    const updated = await updateConfig(parsed.data);
    // Never echo the secret back, even the value the caller just sent us.
    return redactConfig(updated);
  });
}
