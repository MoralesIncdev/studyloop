// Phase 10 "Transcript source chain" (design/EXECUTION-PLAN-post-review-v1.md):
// the single place that resolves "what transcript does this project actually
// have, right now" — first hit wins across:
//   1. pipeline: the project's already-declared `transcript.path` (unchanged
//      behavior — a pipeline JSON matched by lib/scan.ts's source_video
//      match, a hand-picked transcriptPath, or a pre-resolved YouTube
//      captions.json written at project-creation time).
//   2. sidecar: a same-dir `.srt`/`.vtt` file next to a local video's source
//      path (lib/sidecar.ts) — re-checked on every call (not just captured
//      once at scan time) so a project created before this phase shipped, or
//      before the sidecar existed on disk, picks it up on its next read
//      rather than staying stuck at "none" forever.
//   3. youtube: a lazy Innertube caption pull, keyed by a video id either
//      already known (source.type === "youtube") or derived from a local
//      file's yt-dlp `[<id>]` filename convention — fetched at most once per
//      video id, ever (cached to `<dataDir>/transcripts/<videoId>.json`), and
//      never re-attempted this process's lifetime after a genuine miss (no
//      captions available) so a caption-less video doesn't get hammered on
//      every page load.
//   4. asr: Phase 11 "Bring-your-own local ASR adapters" — a prior
//      POST /api/projects/:id/transcribe job's cached output, keyed by a
//      stable hash of the local video's own path (lib/asr.ts's
//      asrCachePath), living in this exact same `<dataDir>/transcripts/`
//      directory the youtube cache (step 3) uses. Local-source projects
//      only — there is no local media file to run an ASR adapter against
//      for a youtube-source project (see routes/transcribe.ts's "not_local"
//      guard, which is why this is never attempted for one).
// Phase 2's terms rewrite (lib/terms.ts's correctTranscriptSegments) is
// applied uniformly before returning, regardless of which step produced the
// segments — this is the one function every read site (routes/transcript.ts,
// routes/analyze.ts, routes/heatmap.ts) should call instead of re-deriving
// any of the above themselves.
import fs from "node:fs/promises";
import path from "node:path";
import type { ResolvedRoots } from "../config.js";
import { readAsrCache } from "./asr.js";
import type { Project } from "./models.js";
import { resolveVideo } from "./innertube.js";
import { findSidecarTranscript, deriveYoutubeVideoId } from "./sidecar.js";
import { readJsonIfExists, writeJsonAtomic } from "./store.js";
import { correctTranscriptSegments } from "./terms.js";
import { loadTranscriptFromText, type TranscriptSegment } from "./transcripts.js";
import { resolveTranscriptPath } from "./transcriptResolve.js";

export type TranscriptSource = "pipeline" | "sidecar" | "youtube" | "asr";

export interface EffectiveTranscriptResult {
  segments: TranscriptSegment[];
  /** `null` when nothing in the chain resolved (see `transcribable`). */
  source: TranscriptSource | null;
  /** True only when every chain step came up empty — Phase 11's ASR slot. */
  transcribable: boolean;
}

/**
 * Infers provenance from a project's *declared* transcript path (chain step
 * 1) — used both here and by routes/transcript.ts's explicit `?path=` branch
 * so the two stay consistent. `captions.json` is the exact filename
 * routes/projects.ts writes for YouTube captions resolved at project
 * creation (V2-B) — still "youtube" provenance even though it isn't this
 * module's own lazy-pull path. Anything else ending in `.srt`/`.vtt` is a
 * sidecar (whether captured automatically by lib/scan.ts or hand-picked);
 * everything else (`.json` pipeline transcripts, the BJJ-corpus/whisper
 * shapes) is "pipeline" — the pre-Phase-10 default, which is also exactly
 * what "absent = pipeline for backward compat" means for old projects.
 */
export function transcriptSourceForDeclaredPath(declaredPath: string): TranscriptSource {
  const base = path.basename(declaredPath).toLowerCase();
  if (base === "captions.json") return "youtube";
  const ext = path.extname(declaredPath).toLowerCase();
  if (ext === ".srt" || ext === ".vtt") return "sidecar";
  return "pipeline";
}

function cachedYoutubeTranscriptPath(dataDir: string, videoId: string): string {
  return path.join(dataDir, "transcripts", `${videoId}.json`);
}

interface CachedYoutubeTranscriptFile {
  videoId: string;
  cachedAt: string;
  segments: TranscriptSegment[];
}

async function readCachedYoutubeTranscript(dataDir: string, videoId: string): Promise<TranscriptSegment[] | null> {
  const raw = await readJsonIfExists<CachedYoutubeTranscriptFile>(cachedYoutubeTranscriptPath(dataDir, videoId));
  if (!raw || !Array.isArray(raw.segments)) return null;
  return raw.segments;
}

async function writeCachedYoutubeTranscript(dataDir: string, videoId: string, segments: TranscriptSegment[]): Promise<void> {
  const file: CachedYoutubeTranscriptFile = { videoId, cachedAt: new Date().toISOString(), segments };
  await writeJsonAtomic(cachedYoutubeTranscriptPath(dataDir, videoId), file);
}

/**
 * In-memory only ("cached-negative for the session only" — SPEC): a video id
 * that came back with no captions this process's lifetime is not retried on
 * every subsequent request. Never persisted — a server restart (or the
 * video's captions genuinely appearing later) gets a fresh attempt.
 */
const negativeYoutubeCache = new Set<string>();

/** Test-only: resets the in-memory negative-pull cache between test cases. */
export function __resetYoutubeNegativeCacheForTests(): void {
  negativeYoutubeCache.clear();
}

/**
 * Chain step 3: pulls YouTube captions for `videoId`, caching to
 * `<dataDir>/transcripts/<videoId>.json` on first success so it's never
 * re-fetched. Never throws — a network failure or a video with no caption
 * track both degrade to `null` (logged by the caller if it wants), same as
 * every other Innertube call in this codebase.
 */
async function pullYoutubeTranscript(dataDir: string, videoId: string): Promise<TranscriptSegment[] | null> {
  const cached = await readCachedYoutubeTranscript(dataDir, videoId);
  if (cached) return cached;
  if (negativeYoutubeCache.has(videoId)) return null;

  const resolved = await resolveVideo(videoId);
  if (!resolved.captions || resolved.captions.length === 0) {
    negativeYoutubeCache.add(videoId);
    return null;
  }
  await writeCachedYoutubeTranscript(dataDir, videoId, resolved.captions);
  return resolved.captions;
}

/** The video id this project's chain step 3 would fetch, if any. */
function derivableVideoId(project: Project): string | null {
  if (project.source.type === "youtube") return project.source.videoId;
  if (project.source.type === "local") return deriveYoutubeVideoId(project.source.path);
  return null;
}

async function readAndParseTranscriptFile(filePath: string): Promise<TranscriptSegment[] | null> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
  try {
    return loadTranscriptFromText(filePath, raw).segments;
  } catch {
    return null;
  }
}

/**
 * Resolves a project's effective transcript through the full Phase 10 chain
 * and applies Phase 2's terms correction uniformly before returning. This is
 * the one function every read site should call.
 */
export async function resolveEffectiveTranscript(
  dataDir: string,
  roots: ResolvedRoots,
  project: Project
): Promise<EffectiveTranscriptResult> {
  // Step 1: already-declared transcript file (pipeline, hand-picked, a
  // sidecar captured at scan/project-creation time, or pre-resolved YouTube
  // captions.json).
  if (project.transcript.type === "file") {
    const resolved = await resolveTranscriptPath(dataDir, roots, project.transcript.path, project.id);
    if (resolved.ok) {
      const segments = await readAndParseTranscriptFile(resolved.filePath);
      if (segments) {
        const corrected = await correctTranscriptSegments(dataDir, project.id, segments, project.domain);
        return { segments: corrected, source: transcriptSourceForDeclaredPath(project.transcript.path), transcribable: false };
      }
    }
    // Declared but unreadable/unparsable (moved/deleted/corrupt file) —
    // degrade through the rest of the chain rather than 404ing outright, same
    // "rail just shows less" policy as every other transcript read site.
  }

  // Step 2: same-dir sidecar — re-checked live (not only at scan time) so a
  // project stuck at transcript.type "none" picks up a sidecar that appears
  // (or that this phase didn't exist yet to capture) without recreating it.
  if (project.source.type === "local") {
    const sidecar = await findSidecarTranscript(project.source.path);
    if (sidecar) {
      const segments = await readAndParseTranscriptFile(sidecar.path);
      if (segments) {
        const corrected = await correctTranscriptSegments(dataDir, project.id, segments, project.domain);
        return { segments: corrected, source: "sidecar", transcribable: false };
      }
    }
  }

  // Step 3: lazy YouTube caption pull.
  const videoId = derivableVideoId(project);
  if (videoId) {
    const captions = await pullYoutubeTranscript(dataDir, videoId);
    if (captions) {
      const corrected = await correctTranscriptSegments(dataDir, project.id, captions, project.domain);
      return { segments: corrected, source: "youtube", transcribable: false };
    }
  }

  // Step 4: Phase 11 "Bring-your-own local ASR adapters" — a prior
  // transcribe job's cached output (see this module's header comment).
  if (project.source.type === "local") {
    const cached = await readAsrCache(dataDir, project.source.path);
    if (cached) {
      const corrected = await correctTranscriptSegments(dataDir, project.id, cached, project.domain);
      return { segments: corrected, source: "asr", transcribable: false };
    }
  }

  // Nothing in the chain resolved.
  return { segments: [], source: null, transcribable: true };
}
