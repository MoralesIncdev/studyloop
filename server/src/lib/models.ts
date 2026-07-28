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
});
export type PatchProjectBody = z.infer<typeof PatchProjectBodySchema>;

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
