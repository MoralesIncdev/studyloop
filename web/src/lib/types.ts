// Client-side mirrors of server types (server/src/lib/models.ts, scan.ts, concepts.ts).
// Kept as plain interfaces here rather than importing across the workspace boundary —
// the two packages build independently and the API is the real contract between them.

export interface LibraryItem {
  videoPath: string;
  title: string;
  durationSeconds?: number;
  transcriptPath?: string;
  instructor?: string;
  series?: string;
}

export interface LibraryResponse {
  items: LibraryItem[];
  warnings: string[];
}

export type Source =
  | { type: "local"; path: string }
  | { type: "youtube"; videoId: string; url: string };

export type TranscriptRef = { type: "file"; path: string } | { type: "none" };

export type ConceptProfile = "bjj-curriculum" | "headings";

export interface ConceptDocRef {
  path?: string;
  profile?: ConceptProfile;
}

/** V2-B "Fast YouTube layer" related-video shape (server/src/lib/innertube.ts's normalized output). */
export interface RelatedVideo {
  videoId: string;
  title: string;
  author: string;
  durationSeconds?: number;
  viewCountText?: string;
  thumbnailUrl?: string;
}

export interface Project {
  id: string;
  title: string;
  source: Source;
  transcript: TranscriptRef;
  conceptDoc?: ConceptDocRef;
  createdAt: string;
  updatedAt: string;
  lastPosition: number;
  /** Furthest playback position ever reached (monotonic; drives "covered" concepts in compile). */
  watchedUpTo: number;
  /** YouTube channel/author name (source.type === "youtube" only) — drives the channel-row name. */
  author?: string;
  /** Cached Innertube related-video list (source.type === "youtube" only). */
  related?: RelatedVideo[];
}

export interface CreateProjectBody {
  title?: string;
  source: Source;
  transcriptPath?: string;
  conceptDocPath?: string;
  conceptDocProfile?: ConceptProfile;
  /** Pre-resolved YouTube captions to persist as captions.json — youtube sources only. */
  captions?: TranscriptSegment[];
  /** Channel/author name resolved by POST /api/youtube/resolve — youtube sources only. */
  author?: string;
  /** Related-video list resolved by POST /api/youtube/resolve — youtube sources only. */
  related?: RelatedVideo[];
}

export interface PatchProjectBody {
  title?: string;
  lastPosition?: number;
  watchedUpTo?: number;
  conceptDoc?: ConceptDocRef;
  transcript?: TranscriptRef;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptResponse {
  segments: TranscriptSegment[];
}

export interface ConceptAnchor {
  t: number | null;
}

export interface ConceptCard {
  id: string;
  title: string;
  body: string;
  anchors: ConceptAnchor[];
  raw: string;
}

export interface Bubble {
  id: string;
  t: number;
  text: string;
  shot?: string | null;
  createdAt: string;
}

/** GET/PUT /api/config response shape — the server never echoes the actual key back. */
export interface StudyLoopConfig {
  dataDir: string;
  libraryRoots: string[];
  transcriptRoots: string[];
  conceptDocs: string[];
  anthropicApiKeySet: boolean;
}

/** Body accepted by PUT /api/config — this is the only place the plaintext key travels. */
export interface StudyLoopConfigPatch {
  dataDir?: string;
  libraryRoots?: string[];
  transcriptRoots?: string[];
  conceptDocs?: string[];
  anthropicApiKey?: string | null;
}

export interface YoutubeResolveResponse {
  videoId: string | null;
  title: string | null;
  /** Channel/author name — populated when Innertube resolved the video (V2-B). */
  author?: string;
  durationSeconds?: number;
  captions?: TranscriptSegment[];
  /** Related videos — [] when Innertube didn't resolve this video (yt-dlp fallback path). */
  related?: RelatedVideo[];
  error?: string;
  /** True if yt-dlp isn't installed — the project should still be created (title = URL). */
  ytdlpMissing?: boolean;
}

/** GET /api/search?q= response (V2-B). */
export interface SearchResponse {
  library: LibraryItem[];
  youtube: RelatedVideo[];
}

/** GET /api/health — lets the UI disable ffmpeg/yt-dlp-dependent controls with a clear reason. */
export interface HealthResponse {
  ok: boolean;
  ffmpeg: boolean;
  ytdlp: boolean;
}

export interface RevealResponse {
  ok: boolean;
  message?: string;
}
