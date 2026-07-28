import type { FastifyInstance } from "fastify";
import { getConfig } from "../config.js";
import { scanLibrary, type ScanResult } from "../lib/scan.js";

let cachedResult: ScanResult | null = null;

async function runScan(): Promise<ScanResult> {
  const config = await getConfig();
  const result = await scanLibrary({
    libraryRoots: config.libraryRoots,
    transcriptRoots: config.transcriptRoots,
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
