import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
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
import { searchRoutes } from "./routes/search.js";
import { configRoutes } from "./routes/config.js";
import { mediaRoutes } from "./routes/media.js";
import { thumbRoutes } from "./routes/thumb.js";
import { revealRoutes } from "./routes/reveal.js";
import { analyzeRoutes } from "./routes/analyze.js";
import { heatmapRoutes } from "./routes/heatmap.js";
import { shareRoutes } from "./routes/share.js";
import { reviewRoutes } from "./routes/review.js";
import { reviewExportRoutes } from "./routes/reviewExport.js";
import { attestationRoutes } from "./routes/attestation.js";
import { continuityRoutes } from "./routes/continuity.js";
import { pearlReviewRoutes } from "./routes/pearlReview.js";
import { registryRoutes } from "./routes/registry.js";
import { termsRoutes } from "./routes/terms.js";
import { slidesRoutes } from "./routes/slides.js";
import { getHealth } from "./lib/health.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// STUDYLOOP_PORT only — the generic `PORT` env var is deliberately ignored.
// Dev harnesses/process managers commonly export a generic PORT for
// whatever they're launching (observed: a harness's PORT meant for the web
// dev server leaked in and the API server bound the web port instead), and
// since this repo runs two servers (server + web) under one `npm run dev`,
// a single ambient PORT can't unambiguously address either one. Use
// STUDYLOOP_PORT (read identically by web/vite.config.ts's dev proxy).
const PORT = Number(process.env.STUDYLOOP_PORT ?? 4600);
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
  await app.register(searchRoutes);
  await app.register(configRoutes);
  await app.register(mediaRoutes);
  await app.register(thumbRoutes);
  await app.register(revealRoutes);
  // V2-C: import-analysis accepts a multipart file upload (SPEC: "multipart
  // or {path}") — registered globally so routes/share.ts's request.file()
  // works without every other route paying multipart's parsing overhead
  // (fastify only invokes it for actual multipart/form-data content-types).
  await app.register(multipart);
  await app.register(analyzeRoutes);
  await app.register(heatmapRoutes);
  await app.register(shareRoutes);
  await app.register(reviewRoutes);
  await app.register(reviewExportRoutes);
  await app.register(attestationRoutes);
  await app.register(continuityRoutes);
  await app.register(pearlReviewRoutes);
  await app.register(registryRoutes);
  await app.register(termsRoutes);
  // Phase 6 "Slide-text channel": relies on the multipart plugin registered
  // above (alongside routes/share.ts's import-analysis) for its PDF upload.
  await app.register(slidesRoutes);

  // Out-of-box polish: lets the web app disable screenshot controls with a
  // clear tooltip instead of a failed request when ffmpeg/yt-dlp aren't on
  // PATH. Availability is cached for up to 5 minutes (see lib/health.ts) —
  // installing either mid-session and reloading picks it up within that
  // window without a server restart, and a warm request never spawns a
  // subprocess (a cold yt-dlp --version check measured ~7s on some setups).
  app.get("/api/health", async () => {
    return getHealth();
  });

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
