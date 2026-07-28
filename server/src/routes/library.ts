import type { FastifyInstance } from "fastify";
import { getConfig, resolveRoots } from "../config.js";
import { getLibrary, rescanLibrary } from "../lib/libraryScanCache.js";
import type { ScanConfig } from "../lib/scan.js";

async function currentScanConfig(): Promise<ScanConfig> {
  const config = await getConfig();
  const roots = resolveRoots(config);
  return { libraryRoots: roots.libraryRoots, transcriptRoots: roots.transcriptRoots };
}

export async function libraryRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/library", async () => {
    return getLibrary(await currentScanConfig());
  });

  app.post("/api/library/rescan", async () => {
    return rescanLibrary(await currentScanConfig());
  });
}
