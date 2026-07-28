import type { FastifyInstance } from "fastify";
import { ConfigSchema, getConfig, updateConfig } from "../config.js";

export async function configRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/config", async () => {
    return getConfig();
  });

  app.put("/api/config", async (request, reply) => {
    const parsed = ConfigSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid config", details: parsed.error.flatten() });
    }
    const updated = await updateConfig(parsed.data);
    return updated;
  });
}
