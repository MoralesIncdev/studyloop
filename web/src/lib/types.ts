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
}

export interface CreateProjectBody {
  title?: string;
  source: Source;
  transcriptPath?: string;
  conceptDocPath?: string;
  conceptDocProfile?: ConceptProfile;
  /** Pre-resolved YouTube captions to persist as captions.json — youtube sources only. */
  captions?: TranscriptSegment[];
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
  captions?: TranscriptSegment[];
  error?: string;
  /** True if yt-dlp isn't installed — the project should still be created (title = URL). */
  ytdlpMissing?: boolean;
}

export interface RevealResponse {
  ok: boolean;
  message?: string;
}
