import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// STUDYLOOP_PORT only, mirroring server/src/index.ts — the generic `PORT` is
// deliberately ignored on both sides so a dev harness's ambient PORT (meant
// for whatever it's launching) can't silently steal the API server's port
// out from under it. `STUDYLOOP_PORT=5000 npm run dev` moves both together.
const serverPort = process.env.STUDYLOOP_PORT ?? "4600";
const webPort = Number(process.env.WEB_PORT ?? 4601);

export default defineConfig({
  plugins: [react()],
  server: {
    port: webPort,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${serverPort}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
