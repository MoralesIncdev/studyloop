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
}

export interface CreateProjectBody {
  title?: string;
  source: Source;
  transcriptPath?: string;
  conceptDocPath?: string;
  conceptDocProfile?: ConceptProfile;
}

export interface PatchProjectBody {
  title?: string;
  lastPosition?: number;
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

export interface StudyLoopConfig {
  dataDir: string;
  libraryRoots: string[];
  transcriptRoots: string[];
  conceptDocs: string[];
  anthropicApiKey: string | null;
}

export interface YoutubeResolveResponse {
  videoId: string | null;
  title: string | null;
  captions?: TranscriptSegment[];
  error?: string;
}
