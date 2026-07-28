// GET /api/library caching + in-flight dedupe, split out of routes/library.ts
// so it's unit-testable the same way every other guard/cache in this
// codebase is (paths.ts, reveal.ts, transcriptResolve.ts).
//
// A real library scan re-walks every configured root and (absent the
// transcript-ref mtime cache in scan.ts) re-reads every transcript file —
// on a real corpus this took 5+ minutes under a handful of concurrent
// callers, because every GET re-ran the whole scan from scratch and
// concurrent callers each kicked off their own independent walk. Two fixes:
//
//  1. A GET never rescans after its first success as long as the resolved
//     root config (libraryRoots/transcriptRoots) hasn't changed — it serves
//     the cached ScanResult instantly. POST /api/library/rescan always
//     forces a fresh scan.
//  2. Concurrent callers (e.g. React StrictMode's double-mount firing
//     several GETs at once before the first one resolves) share a single
//     in-flight scan promise instead of each starting their own walk.
import { scanLibrary, type ScanConfig, type ScanResult } from "./scan.js";

interface CacheEntry {
  config: ScanConfig;
  result: ScanResult;
}

let cache: CacheEntry | null = null;
let inFlight: Promise<ScanResult> | null = null;

function sameRoots(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((root, i) => root === b[i]);
}

function sameConfig(a: ScanConfig, b: ScanConfig): boolean {
  return sameRoots(a.libraryRoots, b.libraryRoots) && sameRoots(a.transcriptRoots, b.transcriptRoots);
}

async function runScan(config: ScanConfig): Promise<ScanResult> {
  const promise = scanLibrary(config).then(
    (result) => {
      cache = { config, result };
      return result;
    },
    (err) => {
      throw err;
    }
  );
  inFlight = promise;
  try {
    return await promise;
  } finally {
    if (inFlight === promise) inFlight = null;
  }
}

/**
 * Serves the cached scan result when `config` (the resolved roots) hasn't
 * changed since the last successful scan. Otherwise scans — sharing a single
 * in-flight promise with any other concurrent caller (GET or rescan).
 */
export async function getLibrary(config: ScanConfig): Promise<ScanResult> {
  if (cache && sameConfig(cache.config, config)) return cache.result;
  if (inFlight) return inFlight;
  return runScan(config);
}

/** POST /api/library/rescan — always re-walks, but still dedupes concurrent callers. */
export async function rescanLibrary(config: ScanConfig): Promise<ScanResult> {
  if (inFlight) return inFlight;
  return runScan(config);
}

/** Test-only: resets the module-level cache/in-flight state between test cases. */
export function resetLibraryScanCacheForTests(): void {
  cache = null;
  inFlight = null;
}
