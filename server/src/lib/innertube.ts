// V2-B "Fast YouTube layer" (SPEC): metadata + captions + related + search via
// youtubei.js's Innertube client — no API key, no yt-dlp subprocess. yt-dlp
// remains only for frame-grab stream URLs (see lib/frames.ts / capture route)
// and as the resolve fallback when Innertube comes back empty (routes/youtube.ts).
//
// One lazily-initialized Innertube instance, shared across calls. Every
// exported call is wrapped in a 10s timeout and never throws to the route
// level — a network block or an API-shape drift in youtubei.js degrades to
// null/[] fields, which routes/youtube.ts and lib/search.ts treat as "try the
// fallback" / "omit this section" rather than a 500.
//
// The real youtubei.js response is a deeply-nested, generator-produced class
// tree (see node_modules/youtubei.js/dist/src/parser/**) that changes shape
// between releases. Rather than depend on those exact classes throughout this
// file, we adapt through the narrow `InnertubeClient` interface below — it
// declares only the fields this module actually reads. `Innertube.create()`'s
// real return value structurally satisfies it. Tests inject a fake
// implementing the same interface (see __setInnertubeClientForTests), so
// caching/timeout/fallback behavior is testable without a network call.
import { Innertube } from "youtubei.js";
import type { TranscriptSegment } from "./transcripts.js";

// --- Narrow adapter types (subset of youtubei.js's real shapes) ------------

export interface RawTranscriptSegmentNode {
  type?: string;
  start_ms?: string;
  end_ms?: string;
  snippet?: { text?: string } | null;
}

export interface RawTranscriptInfo {
  /** Human-readable language names, e.g. ["English", "English (auto-generated)"]. */
  languages?: string[];
  selectedLanguage?: string;
  selectLanguage?(language: string): Promise<RawTranscriptInfo>;
  transcript?: {
    content?: {
      body?: {
        initial_segments?: RawTranscriptSegmentNode[];
      } | null;
    } | null;
  } | null;
}

export interface RawThumbnail {
  url?: string;
  width?: number;
}

export interface RawThumbnailOverlay {
  badges?: { text?: string }[];
}

export interface RawRelatedItem {
  content_type?: string;
  content_id?: string;
  metadata?: {
    title?: { text?: string } | null;
    metadata?: {
      metadata_rows?: { metadata_parts?: { text?: { text?: string } | null }[] }[];
    } | null;
  } | null;
  content_image?: {
    image?: RawThumbnail[];
    overlays?: RawThumbnailOverlay[];
  } | null;
}

export interface RawVideoInfo {
  basic_info?: {
    title?: string;
    author?: string;
    duration?: number;
    channel?: { name?: string } | null;
  };
  watch_next_feed?: RawRelatedItem[] | null;
  getTranscript(): Promise<RawTranscriptInfo>;
}

export interface RawSearchVideoItem {
  type?: string;
  video_id?: string;
  title?: { text?: string } | null;
  author?: { name?: string } | null;
  length_text?: { text?: string } | null;
  thumbnails?: RawThumbnail[];
}

export interface RawSearchResults {
  results?: RawSearchVideoItem[];
}

export interface InnertubeClient {
  getInfo(videoId: string): Promise<RawVideoInfo>;
  search(query: string): Promise<RawSearchResults>;
}

// --- Public normalized shapes ------------------------------------------------

export interface RelatedVideo {
  videoId: string;
  title: string;
  author: string;
  durationSeconds?: number;
  viewCountText?: string;
  thumbnailUrl?: string;
}

export interface ResolvedVideo {
  title: string | null;
  author: string | null;
  durationSeconds: number | null;
  /** Normalized caption segments, or `null` if no transcript is available. */
  captions: TranscriptSegment[] | null;
  related: RelatedVideo[];
}

// --- Client lifecycle (lazy singleton, test-injectable) ---------------------

let clientPromise: Promise<InnertubeClient> | null = null;
let clientOverride: InnertubeClient | null = null;

async function getClient(): Promise<InnertubeClient> {
  if (clientOverride) return clientOverride;
  if (!clientPromise) {
    clientPromise = Innertube.create()
      .then((c) => c as unknown as InnertubeClient)
      .catch((err: unknown) => {
        // Don't cache a permanently-failed client — a transient network blip
        // (or the sandboxed/offline dev environment) shouldn't poison every
        // subsequent call for the life of the process.
        clientPromise = null;
        throw err;
      });
  }
  return clientPromise;
}

/**
 * Test-only: injects a fake client (bypassing the real youtubei.js network
 * call) and clears both caches. Pass `null` to restore the real client on the
 * next call.
 */
export function __setInnertubeClientForTests(client: InnertubeClient | null): void {
  clientOverride = client;
  clientPromise = null;
  videoCache.clear();
  searchCache.clear();
}

// --- Caching + timeout plumbing ----------------------------------------------

const CACHE_TTL_MS = 15 * 60 * 1000;
const CALL_TIMEOUT_MS = 10_000;

interface CacheEntry<T> {
  value: T;
  cachedAt: number;
}

function freshEntry<T>(map: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = map.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    map.delete(key);
    return null;
  }
  return entry.value;
}

const videoCache = new Map<string, CacheEntry<ResolvedVideo>>();
const searchCache = new Map<string, CacheEntry<RelatedVideo[]>>();

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Innertube call timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    );
  });
}

// --- Normalization ------------------------------------------------------------

/** "3:24" -> 204, "1:00:14" -> 3614. Returns undefined for anything unparseable. */
export function parseDurationText(text: string | null | undefined): number | undefined {
  if (!text) return undefined;
  const parts = text.trim().split(":");
  if (parts.length === 0 || parts.length > 3) return undefined;
  let seconds = 0;
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isFinite(n) || n < 0) return undefined;
    seconds = seconds * 60 + n;
  }
  return seconds;
}

/**
 * Normalizes the transcript/timedtext API's segment tree into the same
 * `{start, end, text}` shape used everywhere else (lib/transcripts.ts). The
 * segment list can interleave `TranscriptSectionHeader` nodes among
 * `TranscriptSegment` nodes — only the latter carry timing/text and are kept.
 * Returns `null` (not `[]`) when there's nothing usable, matching the "no
 * transcript" convention the rest of this module uses.
 */
export function normalizeCaptions(
  transcriptInfo: RawTranscriptInfo | null | undefined
): TranscriptSegment[] | null {
  const nodes = transcriptInfo?.transcript?.content?.body?.initial_segments;
  if (!nodes || nodes.length === 0) return null;
  const segments: TranscriptSegment[] = [];
  for (const node of nodes) {
    if (node.type !== "TranscriptSegment") continue;
    const start = Number(node.start_ms);
    const end = Number(node.end_ms);
    const text = node.snippet?.text?.trim();
    if (!Number.isFinite(start) || !Number.isFinite(end) || !text) continue;
    segments.push({ start: start / 1000, end: end / 1000, text });
  }
  return segments.length > 0 ? segments : null;
}

const AUTO_GENERATED_RE = /\(auto-generated\)/i;

/**
 * Prefers a manually-created caption track over an auto-generated one when
 * both exist. `getTranscript()` already tends to default to whichever track
 * caption_tracks lists first (usually the manual one, when present), but this
 * makes the preference explicit and testable rather than relying on incoming
 * track order.
 */
export async function preferManualTranscript(transcriptInfo: RawTranscriptInfo): Promise<RawTranscriptInfo> {
  const { languages, selectedLanguage, selectLanguage } = transcriptInfo;
  if (!languages || !selectedLanguage || !selectLanguage) return transcriptInfo;
  if (!AUTO_GENERATED_RE.test(selectedLanguage)) return transcriptInfo; // already manual (or unlabeled)
  const manual = languages.find((lang) => !AUTO_GENERATED_RE.test(lang));
  if (!manual) return transcriptInfo; // only auto-generated is available
  try {
    return await selectLanguage(manual);
  } catch {
    return transcriptInfo; // fall back to whatever we already had rather than losing captions entirely
  }
}

function bestThumbnail(images: RawThumbnail[] | null | undefined): string | undefined {
  const candidates = (images ?? []).filter((i): i is RawThumbnail & { url: string } => !!i.url);
  if (candidates.length === 0) return undefined;
  const sorted = [...candidates].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  // Rail thumbs render at 168x94 (SPEC) — prefer the smallest image that's
  // still at least that wide, falling back to the largest available.
  return sorted.find((i) => (i.width ?? 0) >= 168)?.url ?? sorted[sorted.length - 1].url;
}

function durationFromOverlays(overlays: RawThumbnailOverlay[] | null | undefined): number | undefined {
  for (const overlay of overlays ?? []) {
    for (const badge of overlay.badges ?? []) {
      const parsed = parseDurationText(badge.text);
      if (parsed !== undefined) return parsed;
    }
  }
  return undefined;
}

/** Normalizes VideoInfo.watch_next_feed's `LockupView` nodes into RelatedVideo[]. */
export function normalizeRelated(items: RawRelatedItem[] | null | undefined, limit = 20): RelatedVideo[] {
  if (!items) return [];
  const out: RelatedVideo[] = [];
  for (const item of items) {
    if (item.content_type !== "VIDEO" || !item.content_id) continue;
    const title = item.metadata?.title?.text?.trim();
    if (!title) continue;
    const rows = item.metadata?.metadata?.metadata_rows ?? [];
    const author = rows[0]?.metadata_parts?.[0]?.text?.text?.trim() ?? "";
    const viewCountText = rows[1]?.metadata_parts?.[0]?.text?.text?.trim();
    out.push({
      videoId: item.content_id,
      title,
      author,
      durationSeconds: durationFromOverlays(item.content_image?.overlays),
      viewCountText,
      thumbnailUrl: bestThumbnail(item.content_image?.image),
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** Normalizes Search.results' `VideoRenderer` nodes into RelatedVideo[]. */
export function normalizeSearchResults(items: RawSearchVideoItem[] | null | undefined, limit = 12): RelatedVideo[] {
  if (!items) return [];
  const out: RelatedVideo[] = [];
  for (const item of items) {
    if (item.type !== "Video" || !item.video_id) continue;
    const title = item.title?.text?.trim();
    if (!title) continue;
    out.push({
      videoId: item.video_id,
      title,
      author: item.author?.name?.trim() ?? "",
      durationSeconds: parseDurationText(item.length_text?.text),
      thumbnailUrl: bestThumbnail(item.thumbnails),
    });
    if (out.length >= limit) break;
  }
  return out;
}

// --- Public API ----------------------------------------------------------------

/**
 * Resolves title/author/duration/captions/related for a YouTube video via
 * Innertube. Never throws: any failure (timeout, network block, an
 * unrecognized response shape) resolves to the all-null/empty shape so
 * routes/youtube.ts can cleanly fall through to the yt-dlp path. Successful
 * results are cached in-memory for 15 minutes, keyed by videoId.
 */
export async function resolveVideo(
  videoId: string,
  options?: { bypassCache?: boolean }
): Promise<ResolvedVideo> {
  if (!options?.bypassCache) {
    const cached = freshEntry(videoCache, videoId);
    if (cached) return cached;
  }
  const empty: ResolvedVideo = { title: null, author: null, durationSeconds: null, captions: null, related: [] };

  let info: RawVideoInfo;
  try {
    const client = await withTimeout(getClient(), CALL_TIMEOUT_MS);
    info = await withTimeout(client.getInfo(videoId), CALL_TIMEOUT_MS);
  } catch {
    return empty;
  }

  const title = info.basic_info?.title?.trim() || null;
  const author = (info.basic_info?.author || info.basic_info?.channel?.name || "").trim() || null;
  const durationSeconds = typeof info.basic_info?.duration === "number" ? info.basic_info.duration : null;
  const related = normalizeRelated(info.watch_next_feed);

  let captions: TranscriptSegment[] | null = null;
  try {
    let transcriptInfo = await withTimeout(info.getTranscript(), CALL_TIMEOUT_MS);
    transcriptInfo = await preferManualTranscript(transcriptInfo);
    captions = normalizeCaptions(transcriptInfo);
  } catch {
    captions = null; // no transcript track, or the get_transcript call failed/timed out — not fatal.
  }

  const result: ResolvedVideo = { title, author, durationSeconds, captions, related };
  // Only cache genuinely useful results — an empty/failed resolve should be
  // retried on the next call rather than cached as a 15-minute dead end.
  if (title || captions || related.length > 0) {
    videoCache.set(videoId, { value: result, cachedAt: Date.now() });
  }
  return result;
}

/** Related videos for `videoId` — used by POST /api/youtube/related's refresh. */
export async function relatedFor(videoId: string, options?: { bypassCache?: boolean }): Promise<RelatedVideo[]> {
  const resolved = await resolveVideo(videoId, options);
  return resolved.related;
}

export interface SearchYoutubeResult {
  results: RelatedVideo[];
  /** True when this result came straight from the 15min searchCache rather than a fresh Innertube call — see continuityService.ts's teacher-score-freshness fix (V3-C review finding #1): a cache hit must never re-earn a persisted "prior validation" bonus for results already counted the last time they were fetched. */
  fromCache: boolean;
}

/**
 * Searches YouTube via Innertube, with cache-freshness metadata. Never
 * throws — a failure (or a query that turns up nothing) resolves to
 * `{results: [], fromCache: false}`.
 */
export async function searchYoutubeWithMeta(query: string, limit = 12): Promise<SearchYoutubeResult> {
  const key = `${limit}:${query}`;
  const cached = freshEntry(searchCache, key);
  if (cached) return { results: cached, fromCache: true };
  try {
    const client = await withTimeout(getClient(), CALL_TIMEOUT_MS);
    const results = await withTimeout(client.search(query), CALL_TIMEOUT_MS);
    const normalized = normalizeSearchResults(results.results, limit);
    if (normalized.length > 0) searchCache.set(key, { value: normalized, cachedAt: Date.now() });
    return { results: normalized, fromCache: false };
  } catch {
    return { results: [], fromCache: false };
  }
}

/**
 * Searches YouTube via Innertube. Never throws — a failure (or a query that
 * turns up nothing) resolves to `[]`, which GET /api/search treats as "omit
 * the youtube section" rather than an error. Thin wrapper over
 * searchYoutubeWithMeta for callers that don't care about cache freshness.
 */
export async function searchYoutube(query: string, limit = 12): Promise<RelatedVideo[]> {
  const { results } = await searchYoutubeWithMeta(query, limit);
  return results;
}
