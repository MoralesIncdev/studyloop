import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Phase 1 (design/EXECUTION-PLAN-post-review-v1.md) smoke harness — boots
// the real server + web dev processes against a disposable fixture install
// (e2e/fixtures/seed.mjs) rather than the developer's real ~/.studyloop
// config/dataDir, so `npm run e2e` never touches real project data or API
// keys. Deliberately on its own port pair (4610/4611, not the default
// 4600/4601 from server/src/index.ts and web/vite.config.ts) so this never
// collides with — or silently reuses — a real interactive `npm run dev`
// session the developer already has open.
const SERVER_PORT = process.env.STUDYLOOP_E2E_SERVER_PORT ?? "4610";
const WEB_PORT = process.env.STUDYLOOP_E2E_WEB_PORT ?? "4611";
// "localhost", not "127.0.0.1": web/vite.config.ts doesn't set an explicit
// server.host, so Vite's dev server listens on whatever "localhost" resolves
// to for Node's http server on this machine — observed to be the IPv6
// loopback (::1) only, not 127.0.0.1. The server side is unaffected (Fastify
// binds literally to "127.0.0.1", server/src/index.ts's HOST default), so
// only the web URL needs this.
const BASE_URL = `http://localhost:${WEB_PORT}`;

// tsx watch (server) + vite (web) cold-starting together, on a freshly
// seeded fixture, measured comfortably under this locally; generous headroom
// for a colder CI runner.
const WEB_SERVER_BOOT_TIMEOUT_MS = 120_000;

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      // `&&`, not two entries racing each other — the fixture (config.json +
      // dataDir + captions/analysis.json + generated mp4) must be fully on
      // disk before the server's getConfig() ever reads it.
      command: `node e2e/fixtures/seed.mjs && npm run dev -w server`,
      url: `http://127.0.0.1:${SERVER_PORT}/api/health`,
      env: {
        STUDYLOOP_PORT: SERVER_PORT,
        // Absolute, not "e2e/.tmp/config": `npm run dev -w server` runs with
        // cwd = server/ (npm workspace scripts execute in the workspace
        // package's own directory, not the repo root config.ts resolves
        // relative to whatever cwd the process actually has) — a relative
        // path here silently resolved to server/e2e/.tmp/config (nothing
        // there), so the server fell back to the real ~/.studyloop default.
        STUDYLOOP_CONFIG_DIR: path.join(__dirname, "e2e", ".tmp", "config"),
      },
      reuseExistingServer: true,
      timeout: WEB_SERVER_BOOT_TIMEOUT_MS,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: `npm run dev -w web`,
      url: BASE_URL,
      env: {
        STUDYLOOP_PORT: SERVER_PORT,
        WEB_PORT: WEB_PORT,
      },
      reuseExistingServer: true,
      timeout: WEB_SERVER_BOOT_TIMEOUT_MS,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
