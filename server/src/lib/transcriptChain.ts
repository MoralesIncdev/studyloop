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
//
// Phase 04.1 "Anchor Fidelity Repair" (D-01 item 1, F-09, Open Question 3):
// `dedupeRollingCaptions` (rollingCaptions.ts) is ALSO applied uniformly
// here, on all four branches, immediately before `correctTranscriptSegments`
// — see each branch below for the shared reasoning and the Open Question 3
// determination.
import fs from "node:fs/promises";
import path from "node:path";
import type { ResolvedRoots } from "../config.js";
import { readAsrCache } from "./asr.js";
import type { Project } from "./models.js";
import { resolveVideo } from "./innertube.js";
import { dedupeRollingCaptions } from "./rollingCaptions.js";
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
  //
  // Phase 04.1 Open Question 3 determination (D-01 item 1): is Innertube's
  // caption path (step 3 below, `pullYoutubeTranscript` -> `resolveVideo` ->
  // `innertube.ts`'s `normalizeCaptions`) also susceptible to F-09-style
  // rolling duplication? `normalizeCaptions` builds segments directly from
  // the transcript/timedtext API's own `initial_segments` node tree
  // (`start_ms`/`end_ms`/`snippet.text` per node) — this is Innertube's own
  // pre-segmented structure, never VTT/SRT cue TEXT. It is a genuinely
  // DIFFERENT shape than the yt-dlp VTT path this phase's dedup was
  // designed against, and a static read of `normalizeCaptions` cannot prove
  // whether Innertube's own segment tree carries a reset/grow alternation
  // for a video whose Innertube caption pull actually succeeds — this
  // machine's Innertube calls have twice fallen through to yt-dlp on the
  // proof project's own network (FINDINGS.md F-02), so no live rolling
  // Innertube data was ever observed to check against. Recorded here as
  // CHECKED-BUT-UNRESOLVED, not assumed either way.
  //
  // `dedupeRollingCaptions` is applied uniformly on ALL FOUR branches below
  // regardless of how that open question resolves, for two independent
  // reasons that hold either way:
  //   1. It is provably a no-op on non-rolling input (Task 1's real-fixture
  //      deep-equality regression) — applying it where it isn't needed
  //      costs nothing.
  //   2. An already-written rolling `captions.json` — exactly what the
  //      2026-08-10 proof project holds — reaches this function through
  //      chain step 1's JSON file path, which `loadTranscriptFromText`
  //      routes to the JSON parser (transcripts.ts) and NEVER through the
  //      cue-block parser (captionParse.ts) Task 1's parse-time dedup lives
  //      in. Parse-time dedup alone would leave every existing rolling
  //      project stuttering forever, since its captions.json is never
  //      re-parsed as VTT/SRT text again.
  //
  // Ordering is deliberate and identical on all four branches: dedup runs
  // BEFORE `correctTranscriptSegments` (Phase 2's terms rewrite), not after.
  // Terms correction rewrites words (e.g. "metro pro law" -> "metoprolol"),
  // so running dedup first means the overlap comparison sees the same text
  // YouTube/the ASR adapter actually emitted, not a post-correction rewrite
  // that could shift word boundaries the overlap search depends on.
  if (project.transcript.type === "file") {
    const resolved = await resolveTranscriptPath(dataDir, roots, project.transcript.path, project.id);
    if (resolved.ok) {
      const segments = await readAndParseTranscriptFile(resolved.filePath);
      if (segments) {
        const deduped = dedupeRollingCaptions(segments);
        const corrected = await correctTranscriptSegments(dataDir, project.id, deduped, project.domain);
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
  // dedup-then-terms-correction ordering: see step 1's comment above.
  if (project.source.type === "local") {
    const sidecar = await findSidecarTranscript(project.source.path);
    if (sidecar) {
      const segments = await readAndParseTranscriptFile(sidecar.path);
      if (segments) {
        const deduped = dedupeRollingCaptions(segments);
        const corrected = await correctTranscriptSegments(dataDir, project.id, deduped, project.domain);
        return { segments: corrected, source: "sidecar", transcribable: false };
      }
    }
  }

  // Step 3: lazy YouTube caption pull — the Innertube path Open Question 3
  // (see step 1's comment above) is about; dedup applied uniformly for the
  // same two reasons regardless of that question's unresolved status.
  // dedup-then-terms-correction ordering: see step 1's comment above.
  const videoId = derivableVideoId(project);
  if (videoId) {
    const captions = await pullYoutubeTranscript(dataDir, videoId);
    if (captions) {
      const deduped = dedupeRollingCaptions(captions);
      const corrected = await correctTranscriptSegments(dataDir, project.id, deduped, project.domain);
      return { segments: corrected, source: "youtube", transcribable: false };
    }
  }

  // Step 4: Phase 11 "Bring-your-own local ASR adapters" — a prior
  // transcribe job's cached output (see this module's header comment).
  // dedup-then-terms-correction ordering: see step 1's comment above.
  if (project.source.type === "local") {
    const cached = await readAsrCache(dataDir, project.source.path);
    if (cached) {
      const deduped = dedupeRollingCaptions(cached);
      const corrected = await correctTranscriptSegments(dataDir, project.id, deduped, project.domain);
      return { segments: corrected, source: "asr", transcribable: false };
    }
  }

  // Nothing in the chain resolved.
  return { segments: [], source: null, transcribable: true };
}
