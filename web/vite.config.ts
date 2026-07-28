import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Single env var controls the server port for both sides: the Fastify server
// reads PORT (or STUDYLOOP_PORT) in server/src/index.ts, and the dev proxy
// below reads the same pair so `PORT=5000 npm run dev` moves both together.
const serverPort = process.env.PORT ?? process.env.STUDYLOOP_PORT ?? "4600";
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
