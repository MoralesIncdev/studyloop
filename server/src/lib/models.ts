import { z } from "zod";

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
