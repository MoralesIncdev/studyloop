import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fstatic from "@fastify/static";
import { ensureDataDirs, getConfig } from "./config.js";
import { libraryRoutes } from "./routes/library.js";
import { videoRoutes } from "./routes/video.js";
import { transcriptRoutes } from "./routes/transcript.js";
import { projectsRoutes } from "./routes/projects.js";
import { captureRoutes } from "./routes/capture.js";
import { conceptsRoutes } from "./routes/concepts.js";
import { compileRoutes } from "./routes/compile.js";
import { youtubeRoutes } from "./routes/youtube.js";
import { configRoutes } from "./routes/config.js";
import { mediaRoutes } from "./routes/media.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? process.env.STUDYLOOP_PORT ?? 4600);
// Loopback by default — this app has no auth, so anything beyond localhost is
// an explicit, advanced opt-in (e.g. accessing from another device on the LAN).
const HOST = process.env.HOST ?? "127.0.0.1";
const WEB_DIST = path.resolve(__dirname, "../../web/dist");

const LOCALHOST_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

async function main(): Promise<void> {
  const config = await getConfig();
  await ensureDataDirs(config);

  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: (origin, cb) => {
      // No Origin header (curl, same-origin requests, server-to-server) — allow.
      if (!origin) return cb(null, true);
      if (LOCALHOST_ORIGIN_RE.test(origin)) return cb(null, true);
      cb(new Error("Not allowed by CORS: only localhost origins are permitted"), false);
    },
  });

  await app.register(libraryRoutes);
  await app.register(videoRoutes);
  await app.register(transcriptRoutes);
  await app.register(projectsRoutes);
  await app.register(captureRoutes);
  await app.register(conceptsRoutes);
  await app.register(compileRoutes);
  await app.register(youtubeRoutes);
  await app.register(configRoutes);
  await app.register(mediaRoutes);

  app.get("/api/health", async () => ({ ok: true }));

  // In production, serve the built web app for anything that isn't an /api route.
  const fsSync = await import("node:fs");
  if (fsSync.existsSync(WEB_DIST)) {
    await app.register(fstatic, { root: WEB_DIST, wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.raw.url?.startsWith("/api")) {
        return reply.status(404).send({ error: "Not found" });
      }
      return reply.sendFile("index.html");
    });
  }

  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`StudyLoop server listening on http://${HOST}:${PORT}`);
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === "EADDRINUSE") {
      app.log.error(
        `Port ${PORT} is already in use. Stop whatever is running there, or set PORT=<other-port> and retry.`
      );
      process.exit(1);
    }
    app.log.error(err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
