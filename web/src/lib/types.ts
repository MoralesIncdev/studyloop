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

/** V3-B B1: router-classified (then user-editable) subject-matter domain — mirrors server/src/lib/models.ts DomainSchema. */
export type Domain = "biology" | "history" | "music" | "physical_skill" | "generic";

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
  /** V3-A "Compile synthesis checkpoint": the learner's own-words summary, written (or skipped) in the compile flow's first step. */
  lessonSummary?: string;
  /** V3-B B1: the editable domain chip near the channel row. */
  domain?: Domain;
  /** V3-B B2: per-project toggle — worked-example-first vs generate-first proposal ordering. */
  noviceMode?: boolean;
  /** V3-C review fix #6: the real video duration, persisted once the player learns it (loadedmetadata / YT API). Preferred by the server's heatmap duration resolution over ffprobe/transcript/watchedUpTo/mark-time fallbacks. */
  durationSeconds?: number;
  /** V3-C review fix #8: `{[conceptId]: "why this grouping"}` — author-editable in the rail, PATCHed and merged per concept. */
  conceptRationales?: Record<string, string>;
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
  lessonSummary?: string;
  domain?: Domain;
  noviceMode?: boolean;
  durationSeconds?: number;
  conceptRationales?: Record<string, string>;
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

/** V3-C C1 "Concept Continuity rail" scorer weights (server/src/lib/continuity.ts). */
export interface ContinuityWeights {
  related: number;
  conceptSearch: number;
  teacherValidation: number;
  gapFill: number;
}

/** V3-D D3 "also in ⟨other project⟩" chip source — one other project a unit's canonical registry entry also spans. */
export interface MergedConceptRef {
  projectId: string;
  projectTitle: string;
  /** Console slice D item 7 "Echo pane timestamp jump": the OTHER project's own
   *  unit id for this same registry entry, and its first anchor time — absent
   *  when that unit no longer resolves (deleted/legacy analysis) or carries no
   *  anchor, in which case the jump degrades to "open the project" with no seek. */
  unitId?: string;
  t?: number;
}

/** GET /api/projects/:id/merged-concepts response: {[unitId]: other projects the same registry concept spans}. */
export type MergedConceptsResponse = Record<string, MergedConceptRef[]>;

// --- V3-D D3: Concept merge queue (mirrors server/src/routes/registry.ts) --

export interface MergeCandidateSide {
  projectId: string;
  projectTitle: string;
  unitId: string;
  label: string;
  summary: string;
}

export interface MergeCandidate {
  id: string;
  domain: Domain;
  similarity: number;
  left: MergeCandidateSide;
  right: MergeCandidateSide;
}

export interface MergeCandidatesResponse {
  candidates: MergeCandidate[];
}

export type MergeResolveAction = "merge" | "link" | "ignore";

export type LlmProviderId = "anthropic" | "openai" | "google" | "xai" | "deepseek" | "kimi" | "zai";
export type AnthropicAuthMode = "api-key" | "oauth";

/** UI metadata per provider — mirrors server/src/lib/providers.ts's registry (labels, defaults, suggestions only; the model field stays free text). */
export const LLM_PROVIDERS: Record<LlmProviderId, { label: string; keyPlaceholder: string; defaultModel: string; models: string[] }> = {
  anthropic: {
    label: "Anthropic (Claude)",
    keyPlaceholder: "sk-ant-…",
    defaultModel: "claude-opus-5",
    models: ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"],
  },
  openai: { label: "OpenAI (GPT)", keyPlaceholder: "sk-…", defaultModel: "gpt-5.1", models: ["gpt-5.1", "gpt-5-mini", "gpt-4.1"] },
  google: {
    label: "Google (Gemini)",
    keyPlaceholder: "AIza…",
    defaultModel: "gemini-2.5-pro",
    models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-3-pro-preview"],
  },
  xai: { label: "xAI (Grok)", keyPlaceholder: "xai-…", defaultModel: "grok-4", models: ["grok-4", "grok-3-mini"] },
  deepseek: { label: "DeepSeek", keyPlaceholder: "sk-…", defaultModel: "deepseek-chat", models: ["deepseek-chat", "deepseek-reasoner"] },
  kimi: { label: "Kimi (Kimi Code)", keyPlaceholder: "sk-…", defaultModel: "kimi-code", models: ["kimi-code"] },
  zai: { label: "Z.ai (GLM)", keyPlaceholder: "…", defaultModel: "glm-5", models: ["glm-5", "glm-5.1", "glm-5-turbo", "glm-4.7", "glm-4.6"] },
};

export const LLM_PROVIDER_IDS = Object.keys(LLM_PROVIDERS) as LlmProviderId[];

/** GET/PUT /api/config response shape — the server never echoes actual keys back, only per-provider `…ApiKeySet` booleans. */
export interface StudyLoopConfig {
  dataDir: string;
  libraryRoots: string[];
  transcriptRoots: string[];
  conceptDocs: string[];
  /** Which LLM provider the analyze/card-transform pipelines call. */
  llmProvider: LlmProviderId;
  /** Anthropic only: "api-key" uses the saved key; "oauth" uses the server's ambient sign-in (ANTHROPIC_AUTH_TOKEN / ant auth login). */
  anthropicAuthMode: AnthropicAuthMode;
  anthropicApiKeySet: boolean;
  openaiApiKeySet: boolean;
  googleApiKeySet: boolean;
  xaiApiKeySet: boolean;
  deepseekApiKeySet: boolean;
  kimiApiKeySet: boolean;
  zaiApiKeySet: boolean;
  /** Analysis model override; null => the selected provider's default. */
  analysisModel: string | null;
  /** V2-C: author handle embedded in exported .studyloop.json bundles. */
  shareHandle: string;
  /** V3-C C1: Concept Continuity scorer weights (hot-reloadable via PUT /api/config). */
  continuityWeights: ContinuityWeights;
}

/** True when the selected provider has (or plausibly has, for OAuth) credentials — the client-side gate before Analyze/Improve calls. */
export function llmConfigured(config: StudyLoopConfig): boolean {
  switch (config.llmProvider) {
    case "anthropic":
      // OAuth mode can only be verified server-side; treat it as configured
      // and let the server's no_api_key 400 surface if the token is missing.
      return config.anthropicAuthMode === "oauth" || config.anthropicApiKeySet;
    case "openai":
      return config.openaiApiKeySet;
    case "google":
      return config.googleApiKeySet;
    case "xai":
      return config.xaiApiKeySet;
    case "deepseek":
      return config.deepseekApiKeySet;
    case "kimi":
      return config.kimiApiKeySet;
    case "zai":
      return config.zaiApiKeySet;
  }
}

/** Body accepted by PUT /api/config — this is the only place plaintext keys travel. */
export interface StudyLoopConfigPatch {
  dataDir?: string;
  libraryRoots?: string[];
  transcriptRoots?: string[];
  conceptDocs?: string[];
  llmProvider?: LlmProviderId;
  anthropicAuthMode?: AnthropicAuthMode;
  anthropicApiKey?: string | null;
  openaiApiKey?: string | null;
  googleApiKey?: string | null;
  xaiApiKey?: string | null;
  deepseekApiKey?: string | null;
  kimiApiKey?: string | null;
  zaiApiKey?: string | null;
  analysisModel?: string | null;
  shareHandle?: string;
  continuityWeights?: ContinuityWeights;
}

// --- V2-C: Analysis engine (SPEC "Analysis engine ('pearls & concept breakdown')") ---

export interface Pearl {
  t: number;
  label: string;
  insight: string;
  importance: 1 | 2 | 3;
  /** V3-B B1: links this pearl to a typed unit (analysis.units), when the merge pass could resolve one. */
  unitId?: string;
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

// --- V3-B B1: typed spine (units/edges) — see PEDAGOGY.md §2 ---------------

export type UnitType = "CLAIM" | "MECHANISM" | "PROCEDURE" | "EXAMPLE" | "BOUNDARY";
export type EdgeType = "REQUIRES" | "PART_OF" | "EXAMPLE_OF" | "PROCEDURE_STEP";

export interface UnitAnchor {
  t: number;
  quote: string;
}

/**
 * V3-D D1 "Domain overlay fields" — mirrors server/src/lib/analysis.ts's
 * UnitOverlaySchema 1:1. Flat across every domain (a unit only ever
 * populates the subset its project's domain cares about); every field
 * optional — rendered as the unit card's collapsed-by-default "Advanced"
 * fold (see concepts/UnitProposalCard.tsx).
 */
export interface UnitOverlay {
  // biology
  levelOfOrganization?: string;
  mechanismType?: string;
  entities?: string[];
  // history
  sourceType?: string;
  causationType?: string;
  actors?: string[];
  perspectiveFlag?: string;
  // music
  schema?: string;
  notation?: string;
  keyContext?: string;
  // physical_skill
  triggers?: string[];
  failureModes?: string[];
  drillPairing?: string;
}

export interface AnalysisUnit {
  id: string;
  type: UnitType;
  label: string;
  summary: string;
  body: string;
  anchors: UnitAnchor[];
  confidence: number;
  /** V3-D D1: absent when nothing in the transcript supported an overlay field for this unit's domain. */
  overlay?: UnitOverlay;
  /** V3-D D2 "Threshold-concept tagging": true when this unit "unlocks later material" (PEDAGOGY). */
  threshold: boolean;
}

export interface AnalysisEdge {
  source: string;
  target: string;
  type: EdgeType;
  quote: string;
  confidence: number;
}

export interface Analysis {
  generatedAt: string;
  model: string;
  version: 2 | 3;
  /** codex P0-2: provenance — "stub" is the offline deterministic demo
   * generator (STUDYLOOP_FAKE_ANALYSIS=1), never rendered outside dev. */
  source: "model" | "stub";
  pearls: Pearl[];
  /** Kept on every version — v3 populates this as a deterministic mirror of `units` (see server/src/lib/analysis.ts unitsToConceptsMirror). */
  concepts: AnalysisConcept[];
  themes: AnalysisTheme[];
  /** V3-B B1: present on version:3 analyses only. */
  domain?: Domain;
  units?: AnalysisUnit[];
  edges?: AnalysisEdge[];
  /** Phase 2 "Terminology layer v1": set when a term mapping changed since this analysis ran (PATCH /api/projects/:id/terms) — the web app's cue for a future "re-analyze" banner. `null`/absent means not stale. */
  staleReason?: "terms-changed" | null;
}

// --- Phase 2 "Terminology layer v1" (design/EXECUTION-PLAN-post-review-v1.md) ---
// Mirrors server/src/lib/models.ts's TermEntrySchema/TermsFileSchema/PatchTermsBodySchema.

/** One garbled->correct mapping entry — `source` distinguishes a learner's own correction from a domain-glossary default (merged in server-side for clinical projects, Phase 5). */
export interface TermEntry {
  correct: string;
  source: "user" | "glossary";
  createdAt: string;
}

/** GET /api/projects/:id/terms's `terms` field, and PATCH's request/response shape — `{[garbledText]: TermEntry}`. */
export type TermsFile = Record<string, TermEntry>;

export interface TermsResponse {
  terms: TermsFile;
}

/** PATCH /api/projects/:id/terms body — `upsert` adds/edits mappings (always persisted as `source: "user"`), `remove` deletes by garbled key. */
export interface PatchTermsBody {
  upsert?: Record<string, string>;
  remove?: string[];
}

export interface PatchTermsResponse {
  terms: TermsFile;
  /** True when this project already had an analysis that just got flagged stale (see Analysis.staleReason). */
  analysisMarkedStale: boolean;
}

export type AnalyzeStatus =
  | { state: "idle" }
  | { state: "running"; pct: number }
  | { state: "done" }
  | { state: "error"; message: string };

// --- V2-C / V3-C C5: Heatmap + shareable analysis (SPEC) ---

/** V3-C C5 "Attention heatmap": one mark composing a bucket, for the click-to-inspect popover. */
export interface HeatmapMark {
  t: number;
  kind: "bubble" | "pearl";
  importance?: 1 | 2 | 3;
  text: string;
  /** "You" for the learner's own marks; the overlay's shareHandle otherwise. */
  author: string;
}

/**
 * V3-C C5 "Attention heatmap" (PEDAGOGY.md §7): own and overlay marks are
 * bucketed/normalized as two INDEPENDENT layers, never merged — "render user
 * layer and overlay layer separately (smooth within, never across)".
 * `bucketCount`/`duration` are echoed back so the client can resolve
 * "which marks does bucket N correspond to" locally (see lib/attentionHeatmap.ts).
 */
export interface HeatmapResponse {
  own: number[];
  overlays: number[];
  marks: { own: HeatmapMark[]; overlays: HeatmapMark[] };
  bucketCount: number;
  duration: number;
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
  /** V3-A: the learner's own-words synthesis, if written. */
  lessonSummary?: string;
  notes: string;
  bubbles: ShareBundleBubble[];
  pearls: Pearl[];
  concepts: AnalysisConcept[];
  themes: AnalysisTheme[];
  /** V3-C C6: author-entered "why this grouping" text per own concept id. */
  conceptRationales?: Record<string, string>;
}

/** V3-C C4 "Overlay diff-on-import": one imported mark the learner hasn't marked themselves (±15s). */
export interface OverlayDiffMark {
  t: number;
  kind: "bubble" | "pearl";
  importance?: 1 | 2 | 3;
  text: string;
  author: string;
}

export interface OverlayMeta {
  fileName: string;
  bundle: ShareBundle;
  /** V3-C C4: moments this overlay marked that the learner's own bubbles/pearls don't cover yet. */
  diff: OverlayDiffMark[];
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

// --- F11: Review Mode (SPEC "F11 — Review Mode (spaced resurfacing)") -----------
// Mirrors server/src/lib/review.ts's public shapes. Scheduling internals
// (interval/lapses/reps/due) are deliberately never sent to the client —
// SRS mechanics stay hidden per SPEC ("no decks, ease factors, or scheduling UI").

export type ReviewGrade = "again" | "good";

/** V3-B B4 "Card transformation": LLM-generated cloze/question front cached per card in review.json — see server/src/lib/cardTransform.ts. Falls back to the card's own front/back when absent. */
export interface ReviewCardTransform {
  front: string;
  back: string;
  why: string;
}

interface ReviewCardBase {
  id: string;
  projectId: string;
  projectTitle: string;
  sourceType: "local" | "youtube";
  /** Local sources only — builds a video-stream/clip-loop URL without a second round trip. */
  sourcePath?: string;
  /** YouTube sources only — builds an "Open at timestamp" link. */
  sourceVideoId?: string;
  t: number;
  /** V3-B B4: present when a cached LLM transformation exists for this card. */
  transformed?: ReviewCardTransform;
}

export interface ReviewBubbleCard extends ReviewCardBase {
  kind: "bubble";
  text: string;
  shot: string | null;
}

export interface ReviewPearlCard extends ReviewCardBase {
  kind: "pearl";
  label: string;
  insight: string;
  importance: 1 | 2 | 3;
}

/** V3-B B4: "Attested units become reviewable as generation cards: front = 'your take' prompt for the unit, back = unit summary + user's own take." */
export interface ReviewUnitCard extends ReviewCardBase {
  kind: "unit";
  unitType: UnitType;
  label: string;
  summary: string;
  userTake: string | null;
  /** V3-D D2: carried through from the underlying unit's threshold flag. */
  threshold: boolean;
}

export type ReviewCard = ReviewBubbleCard | ReviewPearlCard | ReviewUnitCard;

export interface ReviewQueueCounts {
  due: number;
  new: number;
  total: number;
}

export interface ReviewStreak {
  count: number;
  lastDay: string;
}

export interface ReviewQueueResponse {
  due: ReviewCard[];
  counts: ReviewQueueCounts;
  streak: ReviewStreak | null;
  /** V3-B B4 "Mastery over streaks": cards graduated past the 30-day interval, across every project — the summary screen's headline number. */
  masteryCount: number;
}

// --- V3-B B2: Attestation + reveal-gating -----------------------------------

export type AttestationStatus = "attested" | "dismissed";

export interface AttestationEntry {
  status?: AttestationStatus;
  userTake?: string;
  userBody?: string;
  at: string;
}

/** `{[unitId]: AttestationEntry}` — GET/PATCH /api/projects/:id/attestations. */
export type AttestationsFile = Record<string, AttestationEntry>;

export interface AttestationPatchBody {
  status?: AttestationStatus;
  userTake?: string;
  userBody?: string;
}

// --- V3-B review fix #7: pearl "Add to review" (PEDAGOGY §5 path (b)) -----

/** GET/POST `/api/projects/:id/pearls/...review-add(s)` — the set of pearl anchor timestamps (as strings — see server/src/lib/review.ts's pearlReviewKey) the learner explicitly added to their review queue. */
export interface PearlReviewAddsResponse {
  added: string[];
}

// --- V3-C C2: search intent toggles (SPEC/PEDAGOGY.md §6) -----------------

export type SearchIntent = "overview" | "deep_dive" | "troubleshooting";

// --- V3-C C1: Concept Continuity rail (SPEC/PEDAGOGY.md §6) ---------------

export type ContinuityCandidateKind = "youtube" | "local";

export interface ContinuityCandidate {
  kind: ContinuityCandidateKind;
  /** youtube: the real videoId. local: the library item's videoPath (also mirrored in `videoPath`). */
  videoId: string;
  title: string;
  author: string;
  durationSeconds?: number;
  thumbnailUrl?: string;
  /** Local-library suggestions only — lets the client open the project the same way search/library rows do. */
  videoPath?: string;
  transcriptPath?: string;
  score: number;
  /** Human-readable "why" chips, e.g. "teaches closed guard", "channel ranks for 3 of your topics". */
  reasons: string[];
}

export interface ContinuityResponse {
  candidates: ContinuityCandidate[];
}
