import { z } from "zod";

/**
 * `:id` / `projectId` route params, everywhere a project id is accepted.
 * Project ids are always server-generated UUIDs (see lib/store.ts newId()) —
 * constraining the param to that shape closes off path-traversal via a
 * crafted id (e.g. URL-encoded `..%2F..%2Fetc` segments) before it ever
 * reaches projectDir()/path.join(). Belt-and-braces: store.ts's projectDir()
 * and readProject() also independently guard against traversal and id
 * spoofing, but this is the first and cheapest gate.
 */
export const ProjectIdParamSchema = z.object({ id: z.string().uuid() });

export const SourceSchema = z.union([
  z.object({ type: z.literal("local"), path: z.string() }),
  z.object({ type: z.literal("youtube"), videoId: z.string(), url: z.string() }),
]);
export type Source = z.infer<typeof SourceSchema>;

export const TranscriptRefSchema = z.union([
  z.object({ type: z.literal("file"), path: z.string() }),
  z.object({ type: z.literal("none") }),
]);
export type TranscriptRef = z.infer<typeof TranscriptRefSchema>;

export const ConceptDocRefSchema = z.object({
  path: z.string().optional(),
  profile: z.enum(["bjj-curriculum", "headings"]).optional(),
});
export type ConceptDocRef = z.infer<typeof ConceptDocRefSchema>;

/**
 * V3-B B1 "Analysis v3 (typed extraction)": the subject-matter domain a
 * ROUTER call classifies once per analyze run (PEDAGOGY §2 "domain lenses are
 * prompt modules, not separate engines"). Stored on the project (not just
 * analysis.json) because it's user-editable independent of re-analyzing —
 * SPEC: "editable chip near the channel row; PATCH `domain`".
 *
 * Phase 5 "Lens registry + clinical as first data-driven lens"
 * (design/EXECUTION-PLAN-post-review-v1.md, AMENDED): this was a fixed
 * `z.enum([...five ids])` before Phase 5 — the domain/lens set is now data
 * (server/lenses/*.json + `<dataDir>/lenses/*.json`, see lib/lenses.ts), not
 * a closed list known at compile time, so the schema is a plain validated
 * string here. The real "is this a known lens id" check happens at the
 * boundaries that actually need it (the analyze router's structured-output
 * enum, and routes/projects.ts's PATCH `domain` validation via
 * lib/lenses.ts's `isKnownLensId`) — never here, so a project stored under
 * an OLD build's five literal enum values keeps parsing unchanged (the ids
 * are identical strings, just no longer enum-checked at this layer).
 */
export const DomainSchema = z.string().min(1);
export type Domain = z.infer<typeof DomainSchema>;

/**
 * Phase 5 "Lens registry": one overlay field a lens wants the model to try
 * to fill in on a unit (see AnalysisUnitSchema's `overlay` in lib/analysis.ts)
 * — `key` must be one of UnitOverlaySchema's known keys (loosely checked;
 * an unknown key is simply never populated since the model prompt/schema
 * only names keys UnitOverlaySchema itself declares), `label` is the web
 * unit-card's human-readable row label, `hint` is optional extra guidance
 * text (currently informational only — not yet threaded into the chunk
 * prompt beyond the lens's own `unitTypeEmphasis` prose).
 */
export const LensOverlayFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  hint: z.string().optional(),
});
export type LensOverlayField = z.infer<typeof LensOverlayFieldSchema>;

/**
 * Phase 5 "Lens registry + clinical as first data-driven lens" (AMENDED
 * spec): a subject-matter lens is now a data file (server/lenses/<id>.json,
 * repo-shipped, merged with user overrides from `<dataDir>/lenses/<id>.json`
 * — see lib/lenses.ts) rather than a hardcoded DOMAIN_MODULES prompt-string
 * record. `id` doubles as the Domain value stored on a project/analysis.
 * `safetyTier` is data that only ever REFERENCES a code-level capability
 * (lib/conceptRegistry.ts's never-auto-merge extension, the web unit card's
 * unconditional verbatim-quote display) — a lens cannot redefine what the
 * tier DOES, only which of its own unit types opt into it.
 */
export const LensSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  /** Short clause used inside the router's classification prompt: `"${id}" (${routerDescription})`. */
  routerDescription: z.string().min(1),
  /** The per-chunk system-prompt module text (verbatim migration of the old DOMAIN_MODULES[domain] string for the original five lenses) — which unit types/edges to favor and which overlay fields to fill in. */
  unitTypeEmphasis: z.string().min(1),
  overlayFields: z.array(LensOverlayFieldSchema).default([]),
  /** Dispatch key for cardTransform.ts's question-style prompt selection. "default" (or any value other than a recognized special style) preserves the pre-Phase-5 domain-flavored behavior for the original five lenses. */
  questionStyle: z.string().min(1).default("default"),
  /** When set, activates lib/terms.ts's nursing glossary merge for projects whose active lens declares this ref (currently only "nursing" has a glossary file). */
  glossaryRef: z.string().optional(),
  masteryNotes: z.string().optional(),
  /** Unit types (lib/analysis.ts's UnitTypeSchema values) this lens flags as safety-critical — see the schema-level doc comment above. */
  safetyTier: z.array(z.string()).optional(),
});
export type Lens = z.infer<typeof LensSchema>;

/**
 * V2-B "Fast YouTube layer": related-video shape returned by both Innertube's
 * watch-next feed and its search results (server/src/lib/innertube.ts). Kept
 * as a zod schema (not just a TS interface) because it's persisted as-is into
 * project.json's `related` field and must validate on read the same way every
 * other on-disk shape does.
 */
export const RelatedVideoSchema = z.object({
  videoId: z.string(),
  title: z.string(),
  author: z.string(),
  durationSeconds: z.number().nonnegative().optional(),
  viewCountText: z.string().optional(),
  thumbnailUrl: z.string().optional(),
});
export type RelatedVideo = z.infer<typeof RelatedVideoSchema>;

export const ProjectSchema = z.object({
  id: z.string(),
  title: z.string(),
  source: SourceSchema,
  transcript: TranscriptRefSchema,
  conceptDoc: ConceptDocRefSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastPosition: z.number().nonnegative().default(0),
  /** Furthest playback position ever reached (monotonic; drives compiled "covered" concepts). */
  watchedUpTo: z.number().nonnegative().default(0),
  /** YouTube channel/author name (source.type === "youtube" only) — drives the channel-row name. */
  author: z.string().optional(),
  /** Cached Innertube related-video list (source.type === "youtube" only); refreshed via POST /api/youtube/related. */
  related: z.array(RelatedVideoSchema).optional(),
  /**
   * V3-A "Compile synthesis checkpoint": the learner's own-words synthesis of
   * the lesson, written (or skipped) in the compile flow's first step.
   * Prefills on re-compile; renders as the compiled doc's first section.
   */
  lessonSummary: z.string().optional(),
  /** V3-B B1: router-classified (then user-editable) subject-matter domain — see DomainSchema. Absent for pre-v3 projects until the next analyze run. */
  domain: DomainSchema.optional(),
  /**
   * V3-B B2 "Attestation + reveal-gating": per-project toggle that flips
   * proposal-card ordering — off (default): generation prompt first, AI
   * body revealed after; on ("I'm new to this subject"): worked example
   * (the AI body) shown first, then a "restate it" prompt (PEDAGOGY §1
   * expertise-reversal rule).
   */
  noviceMode: z.boolean().optional(),
  /**
   * V3-C review fix #6 "YouTube heatmaps positioned against the last mark,
   * not video duration": the real video length, persisted once the player
   * learns it (loadedmetadata for local `<video>`, the IFrame API's
   * getDuration() for YouTube) via a small PATCH from the web app. Preferred
   * over every other duration source (ffprobe, transcript end, watchedUpTo,
   * mark times) by lib/heatmap.ts's resolveHeatmapDuration.
   */
  durationSeconds: z.number().nonnegative().optional(),
  /**
   * V3-C review fix #8 "C6 rationales are neither rail-editable nor retained
   * for editing": `{[conceptId]: "why this grouping"}` — author-editable in
   * the rail (AnalysisSections.tsx's AiBreakdownSection) on each own
   * concept, PATCHed one concept at a time and merged (see
   * routes/projects.ts's mergeConceptRationales) rather than replacing the
   * whole map. ShareFlow.tsx prefills its export-step drafts from this.
   */
  conceptRationales: z.record(z.string()).optional(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const TranscriptSegmentSchema = z.object({
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  text: z.string(),
});
export type TranscriptSegmentInput = z.infer<typeof TranscriptSegmentSchema>;

export const CreateProjectBodySchema = z.object({
  title: z.string().optional(),
  source: SourceSchema,
  transcriptPath: z.string().optional(),
  conceptDocPath: z.string().optional(),
  conceptDocProfile: z.enum(["bjj-curriculum", "headings"]).optional(),
  /**
   * Pre-resolved YouTube captions (from POST /api/youtube/resolve, called by
   * the client before project creation) to persist as captions.json — only
   * used when source.type === "youtube". See lib/store.ts writeCaptions.
   */
  captions: z.array(TranscriptSegmentSchema).optional(),
  /** Channel/author name resolved by POST /api/youtube/resolve — youtube sources only. */
  author: z.string().optional(),
  /** Related-video list resolved by POST /api/youtube/resolve — youtube sources only. */
  related: z.array(RelatedVideoSchema).optional(),
});
export type CreateProjectBody = z.infer<typeof CreateProjectBodySchema>;

export const PatchProjectBodySchema = z.object({
  title: z.string().optional(),
  lastPosition: z.number().nonnegative().optional(),
  watchedUpTo: z.number().nonnegative().optional(),
  conceptDoc: ConceptDocRefSchema.optional(),
  transcript: TranscriptRefSchema.optional(),
  /** V3-A: the compile checkpoint's synthesis paragraph — saved on "Save & continue", untouched on "Skip". */
  lessonSummary: z.string().optional(),
  /** V3-B B1: the editable domain chip near the channel row. */
  domain: DomainSchema.optional(),
  /** V3-B B2: the per-project novice-mode toggle. */
  noviceMode: z.boolean().optional(),
  /** V3-C review fix #6: the player-learned real video duration. */
  durationSeconds: z.number().nonnegative().optional(),
  /** V3-C review fix #8: one (or more) concept rationale(s) to merge into the existing map — see ProjectSchema.conceptRationales. */
  conceptRationales: z.record(z.string()).optional(),
});
export type PatchProjectBody = z.infer<typeof PatchProjectBodySchema>;

/**
 * Phase 2 "Terminology layer v1" (design/EXECUTION-PLAN-post-review-v1.md):
 * one garbled->correct mapping entry persisted in a project's `terms.json`
 * (see lib/terms.ts). `source` distinguishes a learner-authored correction
 * (via PATCH /api/projects/:id/terms) from a domain-glossary default merged
 * in at read time (lib/glossary/nursing.json, for `domain === "clinical"`
 * projects — that domain value ships in Phase 5) — a "user" entry for a
 * given garbled key always wins over a "glossary" entry for the same key
 * (see lib/terms.ts's mergeGlossaryDefaults).
 */
export const TermEntrySchema = z.object({
  correct: z.string().min(1),
  source: z.enum(["user", "glossary"]),
  createdAt: z.string(),
});
export type TermEntry = z.infer<typeof TermEntrySchema>;

/** Per-project `terms.json` — `{[garbledText]: TermEntry}` (see lib/terms.ts). */
export const TermsFileSchema = z.record(TermEntrySchema);
export type TermsFile = z.infer<typeof TermsFileSchema>;

/**
 * Body for PATCH /api/projects/:id/terms. `upsert` adds or edits mappings
 * (keyed by the garbled string, valued by the correct term — always
 * persisted with `source: "user"`, see routes/terms.ts); `remove` deletes
 * mappings by garbled key. Both may be sent in the same request.
 */
export const PatchTermsBodySchema = z.object({
  upsert: z.record(z.string().min(1)).optional(),
  remove: z.array(z.string().min(1)).optional(),
});
export type PatchTermsBody = z.infer<typeof PatchTermsBodySchema>;

export const BubbleSchema = z.object({
  id: z.string(),
  t: z.number().nonnegative(),
  text: z.string().default(""),
  shot: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type Bubble = z.infer<typeof BubbleSchema>;

export const CreateBubbleBodySchema = z.object({
  t: z.number().nonnegative(),
  text: z.string().default(""),
  shot: z.string().nullable().optional(),
});

export const PatchBubbleBodySchema = z.object({
  t: z.number().nonnegative().optional(),
  text: z.string().optional(),
  shot: z.string().nullable().optional(),
});
