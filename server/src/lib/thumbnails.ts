// codex P1-1 "real thumbnails": a mid-video-frame JPEG per local library
// video, generated on demand (not during the scan — scanLibrary/lib/scan.ts
// never touches ffmpeg, so a rescan stays fast regardless of library size)
// and cached to disk under thumbsDir(), keyed by a hash of the video's own
// path + mtime so a replaced/re-encoded file at the same path invalidates
// its stale thumbnail automatically. GET /api/thumb (routes/thumb.ts) is the
// only caller — this module owns the cache-key/generate/cache logic so it's
// independently testable the same way lib/reveal.ts, lib/transcriptResolve.ts
// etc. are.
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { thumbsDir } from "../config.js";
import { extractFrame, FfmpegNotFoundError } from "./frames.js";
import { getFfprobeDurationSeconds } from "./ffprobe.js";
import { pathExists } from "./store.js";

/** Used when ffprobe can't determine the video's duration — near the start rather than a fixed deep offset, so it stays in-bounds for very short clips too. */
const FALLBACK_SEEK_SECONDS = 3;

export function thumbnailCacheKey(filePath: string, mtimeMs: number): string {
  return crypto.createHash("sha256").update(`${path.resolve(filePath)}:${mtimeMs}`).digest("hex");
}

let thumbsDirOverrideForTests: string | null = null;

/** Test-only: redirects the thumbnail cache to a temp dir instead of the real `~/.studyloop/thumbs`. */
export function __setThumbsDirForTests(dir: string | null): void {
  thumbsDirOverrideForTests = dir;
}

function resolveThumbsDir(): string {
  return thumbsDirOverrideForTests ?? thumbsDir();
}

export function thumbnailCachePath(key: string): string {
  return path.join(resolveThumbsDir(), `${key}.jpg`);
}

// Concurrent requests for the same not-yet-cached video (e.g. the home grid
// and a StudyView both requesting it, or two <img> retries) share one ffmpeg
// spawn instead of racing independent extractions to the same output path.
const inFlight = new Map<string, Promise<string | null>>();

/**
 * Returns the on-disk path to a cached thumbnail JPEG for `filePath`,
 * generating one via ffmpeg on first request. Returns null (never throws) if
 * the file is missing, ffmpeg/ffprobe are unavailable, or extraction fails —
 * callers (routes/thumb.ts) treat null as "no thumbnail" (404), and the web
 * app falls back to its icon placeholder.
 */
export async function getOrCreateThumbnail(filePath: string): Promise<string | null> {
  let stat: import("node:fs").Stats;
  try {
    stat = await fs.stat(filePath);
  } catch {
    return null;
  }
  if (!stat.isFile()) return null;

  const key = thumbnailCacheKey(filePath, stat.mtimeMs);
  const cachePath = thumbnailCachePath(key);
  if (await pathExists(cachePath)) return cachePath;

  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = (async (): Promise<string | null> => {
    try {
      await fs.mkdir(resolveThumbsDir(), { recursive: true });
      const duration = await getFfprobeDurationSeconds(filePath);
      const seekSeconds = duration && duration > FALLBACK_SEEK_SECONDS * 2 ? duration / 2 : FALLBACK_SEEK_SECONDS;
      // Extract to a per-attempt tmp file then rename — never leaves a
      // partially-written file at the real cache path for a concurrent
      // reader (routes/thumb.ts) to pick up mid-write. Must still end in
      // .jpg: ffmpeg's muxer picks its output format from the filename
      // extension (no explicit -f flag here), and refuses to write to a
      // path ending in a non-image extension like a bare ".tmp".
      const tmpPath = path.join(resolveThumbsDir(), `${key}.${process.pid}-${Date.now()}.tmp.jpg`);
      await extractFrame(filePath, seekSeconds, tmpPath);
      await fs.rename(tmpPath, cachePath);
      return cachePath;
    } catch (err) {
      if (!(err instanceof FfmpegNotFoundError)) {
        // eslint-disable-next-line no-console
        console.warn(
          `[thumbnails] failed to generate thumbnail for ${filePath}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
      return null;
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, promise);
  return promise;
}

/** Test-only: resets the in-flight generation map between test cases. */
export function __resetThumbnailsForTests(): void {
  inFlight.clear();
}
