import type { FastifyInstance } from "fastify";
import { getConfig, resolveRoots } from "../config.js";
import { scanLibrary, type ScanResult } from "../lib/scan.js";

let cachedResult: ScanResult | null = null;

async function runScan(): Promise<ScanResult> {
  const config = await getConfig();
  const roots = resolveRoots(config);
  const result = await scanLibrary({
    libraryRoots: roots.libraryRoots,
    transcriptRoots: roots.transcriptRoots,
  });
  cachedResult = result;
  return result;
}

export async function libraryRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/library", async () => {
    if (!cachedResult) return runScan();
    return cachedResult;
  });

  app.post("/api/library/rescan", async () => {
    return runScan();
  });
}
