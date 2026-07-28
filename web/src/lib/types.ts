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
  /** V2-C: analysis engine model override; null => server default ("claude-opus-5"). */
  analysisModel: string | null;
  /** V2-C: author handle embedded in exported .studyloop.json bundles. */
  shareHandle: string;
}

/** Body accepted by PUT /api/config — this is the only place the plaintext key travels. */
export interface StudyLoopConfigPatch {
  dataDir?: string;
  libraryRoots?: string[];
  transcriptRoots?: string[];
  conceptDocs?: string[];
  anthropicApiKey?: string | null;
  analysisModel?: string | null;
  shareHandle?: string;
}

// --- V2-C: Analysis engine (SPEC "Analysis engine ('pearls & concept breakdown')") ---

export interface Pearl {
  t: number;
  label: string;
  insight: string;
  importance: 1 | 2 | 3;
}

export interface AnalysisConceptAnchor {
  t: number;
}

export interface AnalysisConcept {
  id: string;
  title: string;
  summary: string;
  anchors: AnalysisConceptAnchor[];
  body: string;
}

export interface AnalysisTheme {
  title: string;
  body: string;
}

export interface Analysis {
  generatedAt: string;
  model: string;
  version: 2;
  pearls: Pearl[];
  concepts: AnalysisConcept[];
  themes: AnalysisTheme[];
}

export type AnalyzeStatus =
  | { state: "idle" }
  | { state: "running"; pct: number }
  | { state: "done" }
  | { state: "error"; message: string };

// --- V2-C: Heatmap + shareable analysis (SPEC) ---

export interface HeatmapResponse {
  buckets: number[];
}

export type ShareSourceRef =
  | { type: "youtube"; videoId: string; url?: string }
  | { type: "local"; filename: string; durationSeconds?: number | null };

export interface ShareBundleBubble {
  id: string;
  t: number;
  text: string;
  thumbnailBase64?: string | null;
}

export interface ShareBundle {
  version: 1;
  createdAt: string;
  shareHandle: string;
  source: ShareSourceRef;
  title: string;
  notes: string;
  bubbles: ShareBundleBubble[];
  pearls: Pearl[];
  concepts: AnalysisConcept[];
  themes: AnalysisTheme[];
}

export interface OverlayMeta {
  fileName: string;
  bundle: ShareBundle;
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
