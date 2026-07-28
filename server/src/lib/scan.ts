import fs from "node:fs/promises";
import path from "node:path";
import { pathExists } from "./store.js";

const VIDEO_EXTENSIONS = new Set([".mp4", ".mkv", ".mov", ".webm", ".m4v", ".avi"]);
const TRANSCRIPT_EXTENSIONS = new Set([".json"]);

export interface LibraryItem {
  videoPath: string;
  title: string;
  durationSeconds?: number;
  transcriptPath?: string;
  instructor?: string;
  series?: string;
}

export interface ScanResult {
  items: LibraryItem[];
  warnings: string[];
}

async function walk(root: string, extensions: Set<string>): Promise<string[]> {
  const results: string[] = [];
  async function recurse(dir: string): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await recurse(full);
      } else if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) {
        results.push(full);
      }
    }
  }
  await recurse(root);
  return results;
}

function titleFromFilename(videoPath: string): string {
  return path.basename(videoPath, path.extname(videoPath));
}

/** Best-effort instructor/series derivation from a video's path relative to its library root. */
function deriveInstructorSeries(videoPath: string, libraryRoot: string): { instructor?: string; series?: string } {
  const rel = path.relative(libraryRoot, videoPath);
  const parts = rel.split(path.sep).filter(Boolean);
  const instructor = path.basename(libraryRoot);
  if (parts.length >= 2) {
    // .../<libraryRoot>/<series>/.../<file>
    return { instructor, series: parts[0] };
  }
  return { instructor };
}

interface TranscriptRef {
  transcriptPath: string;
  sourceVideo: string | null;
  durationSeconds?: number;
}

interface CachedTranscriptRef {
  mtimeMs: number;
  size: number;
  ref: TranscriptRef | null;
}

/**
 * Transcript JSONs can be multi-MB — re-reading and JSON.parsing every one of
 * them on every scan is the dominant cost of a rescan once a library is real
 * sized. Keyed by (path, mtime, size): a rescan only re-reads a file whose
 * mtime or size actually changed since the last time we looked at it; an
 * unchanged file's already-parsed `source_video`/`duration_seconds` are
 * reused as-is. Module-level and unbounded by design (mirrors the rest of
 * this codebase's in-process caches) — a local video library's transcript
 * count is small enough that this never becomes a real memory concern.
 */
const transcriptRefCache = new Map<string, CachedTranscriptRef>();

async function readTranscriptRef(filePath: string): Promise<TranscriptRef | null> {
  let stat: import("node:fs").Stats;
  try {
    stat = await fs.stat(filePath);
  } catch {
    return null;
  }
  const cached = transcriptRefCache.get(filePath);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached.ref;
  }
  let ref: TranscriptRef | null;
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    const sourceVideo = typeof data.source_video === "string" ? data.source_video : null;
    const durationSeconds = typeof data.duration_seconds === "number" ? data.duration_seconds : undefined;
    ref = { transcriptPath: filePath, sourceVideo, durationSeconds };
  } catch {
    ref = null;
  }
  transcriptRefCache.set(filePath, { mtimeMs: stat.mtimeMs, size: stat.size, ref });
  return ref;
}

/** Test-only: resets the transcript-ref mtime/size cache between test cases. */
export function resetTranscriptRefCacheForTests(): void {
  transcriptRefCache.clear();
}

export interface ScanConfig {
  libraryRoots: readonly string[];
  transcriptRoots: readonly string[];
}

/**
 * Scans libraryRoots for video files and transcriptRoots for transcript JSONs,
 * matching transcripts to videos via the transcript's `source_video` field
 * (resolved absolute path equality). Missing/unmounted roots are skipped with
 * a warning, never a crash.
 */
export async function scanLibrary(config: ScanConfig): Promise<ScanResult> {
  const warnings: string[] = [];
  const videoEntries: { videoPath: string; libraryRoot: string }[] = [];

  for (const root of config.libraryRoots) {
    if (!(await pathExists(root))) {
      warnings.push(`Library root not found (unmounted?): ${root}`);
      continue;
    }
    const videos = await walk(root, VIDEO_EXTENSIONS);
    for (const videoPath of videos) videoEntries.push({ videoPath, libraryRoot: root });
  }

  const transcriptBySourceVideo = new Map<string, TranscriptRef>();
  for (const root of config.transcriptRoots) {
    if (!(await pathExists(root))) {
      warnings.push(`Transcript root not found (unmounted?): ${root}`);
      continue;
    }
    const files = await walk(root, TRANSCRIPT_EXTENSIONS);
    for (const file of files) {
      const ref = await readTranscriptRef(file);
      if (!ref) {
        warnings.push(`Could not parse transcript JSON: ${file}`);
        continue;
      }
      if (!ref.sourceVideo) continue;
      transcriptBySourceVideo.set(path.resolve(ref.sourceVideo), ref);
    }
  }

  const items: LibraryItem[] = videoEntries.map(({ videoPath, libraryRoot }) => {
    const resolved = path.resolve(videoPath);
    const transcript = transcriptBySourceVideo.get(resolved);
    const { instructor, series } = deriveInstructorSeries(videoPath, libraryRoot);
    const item: LibraryItem = {
      videoPath,
      title: titleFromFilename(videoPath),
      instructor,
      series,
    };
    if (transcript) {
      item.transcriptPath = transcript.transcriptPath;
      if (transcript.durationSeconds !== undefined) item.durationSeconds = transcript.durationSeconds;
    }
    return item;
  });

  items.sort((a, b) => a.videoPath.localeCompare(b.videoPath));

  return { items, warnings };
}
