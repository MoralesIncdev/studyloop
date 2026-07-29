// V2-C "Heatmap + shareable analysis — the data layer" (SPEC): the
// `.studyloop.json` export/import bundle format. This IS the wire format for
// the future community-aggregation service the SPEC calls out, so the shape
// here is deliberately versioned and self-contained (never the video bytes).
import { z } from "zod";
import { AnalysisConceptSchema, AnalysisThemeSchema, PearlSchema } from "./analysis.js";
import type { Bubble, Project } from "./models.js";

// --- Source ref (SPEC: "source ref (videoId/url or filename+duration hash — never the video bytes)") ---

export const ShareSourceRefSchema = z.union([
  z.object({ type: z.literal("youtube"), videoId: z.string(), url: z.string().optional() }),
  z.object({ type: z.literal("local"), filename: z.string(), durationSeconds: z.number().nullable().optional() }),
]);
export type ShareSourceRef = z.infer<typeof ShareSourceRefSchema>;

/** Derives the bundle's source ref from a project + a best-effort resolved duration (local sources only). */
export function buildSourceRef(project: Project, localDurationSeconds: number | null): ShareSourceRef {
  if (project.source.type === "youtube") {
    return { type: "youtube", videoId: project.source.videoId, url: project.source.url };
  }
  const filename = project.source.path.split("/").pop() ?? project.source.path;
  return { type: "local", filename, durationSeconds: localDurationSeconds };
}

/**
 * Compares a bundle's declared source against the current project's source
 * ref. Returns a human-readable mismatch reason, or null if they match
 * closely enough (SPEC: "source match warning if videoId/duration mismatch").
 * A youtube<->local type mismatch, a different videoId, a different local
 * filename, or a local duration differing by more than 5s are all flagged;
 * everything else (including "duration unknown on one side") is treated as a
 * match rather than a false-positive warning.
 */
export function detectSourceMismatch(bundleSource: ShareSourceRef, currentSource: ShareSourceRef): string | null {
  if (bundleSource.type !== currentSource.type) {
    return `This overlay was captured from a ${bundleSource.type} source; this project is ${currentSource.type}.`;
  }
  if (bundleSource.type === "youtube" && currentSource.type === "youtube") {
    return bundleSource.videoId !== currentSource.videoId
      ? `This overlay was captured from a different YouTube video (${bundleSource.videoId}).`
      : null;
  }
  if (bundleSource.type === "local" && currentSource.type === "local") {
    if (bundleSource.filename !== currentSource.filename) {
      return `This overlay was captured from a differently-named file (${bundleSource.filename}).`;
    }
    if (
      bundleSource.durationSeconds != null &&
      currentSource.durationSeconds != null &&
      Math.abs(bundleSource.durationSeconds - currentSource.durationSeconds) > 5
    ) {
      return "This overlay's source video duration differs by more than 5 seconds — it may be a different cut of the file.";
    }
    return null;
  }
  return null;
}

// --- Bundle shape --------------------------------------------------------------

export const ShareBundleBubbleSchema = z.object({
  id: z.string(),
  t: z.number().nonnegative(),
  text: z.string(),
  /** base64-encoded JPEG, ≤480px wide (SPEC), or null when the bubble had no shot / thumbnailing failed. */
  thumbnailBase64: z.string().nullable().optional(),
});
export type ShareBundleBubble = z.infer<typeof ShareBundleBubbleSchema>;

export const ShareBundleSchema = z.object({
  version: z.literal(1),
  createdAt: z.string(),
  /** Author handle (config `shareHandle`, default "anonymous" — SPEC). */
  shareHandle: z.string().min(1),
  source: ShareSourceRefSchema,
  title: z.string(),
  /** V3-A: the learner's own-words synthesis, if written — optional so bundle version stays 1 and older/absent values still validate. */
  lessonSummary: z.string().optional(),
  notes: z.string(),
  bubbles: z.array(ShareBundleBubbleSchema),
  pearls: z.array(PearlSchema),
  concepts: z.array(AnalysisConceptSchema),
  themes: z.array(AnalysisThemeSchema),
  /**
   * V3-C C6 "Bundle narrative fields": author-editable "why this grouping"
   * text per own concept, entered in the rail right before export (SPEC:
   * "author-editable in the rail before export via small 'why this
   * grouping' input on own concepts") — keyed by `AnalysisConcept.id`.
   * Optional, and NOT part of the immutable `AnalysisConcept` shape itself
   * (that schema is V3-B's) — a concept with no rationale entry simply has
   * none, and bundle version stays 1 (matches lessonSummary's precedent
   * above: an additive optional field, old/absent bundles still validate).
   */
  conceptRationales: z.record(z.string()).optional(),
});
export type ShareBundle = z.infer<typeof ShareBundleSchema>;

export interface BuildShareBundleInput {
  project: Project;
  notes: string;
  bubbles: readonly Bubble[];
  shareHandle: string;
  localDurationSeconds: number | null;
  pearls?: import("./analysis.js").Pearl[];
  concepts?: import("./analysis.js").AnalysisConcept[];
  themes?: import("./analysis.js").AnalysisTheme[];
  /** V3-C C6: author-entered "why this grouping" text per own concept id — see ShareBundleSchema.conceptRationales. */
  conceptRationales?: Record<string, string>;
  /** Resolves a bubble's shot (project-relative path, e.g. "shots/shot-1200.jpg") to a base64 thumbnail, or null. */
  resolveThumbnail: (shotRelPath: string) => Promise<string | null>;
}

/** Assembles a share bundle. Thumbnailing runs concurrently across bubbles; a failure for one never blocks the rest. */
export async function buildShareBundle(input: BuildShareBundleInput): Promise<ShareBundle> {
  const bubbles = await Promise.all(
    input.bubbles.map(async (b): Promise<ShareBundleBubble> => ({
      id: b.id,
      t: b.t,
      text: b.text,
      thumbnailBase64: b.shot ? await input.resolveThumbnail(b.shot) : null,
    }))
  );
  // Only keep non-blank rationale strings, and only for concepts that
  // actually exist in this bundle — a stale/mistargeted id from the client
  // (e.g. left over after a re-analyze changed concept ids) shouldn't ship
  // an orphaned rationale entry nobody can ever render against a concept.
  const conceptIds = new Set((input.concepts ?? []).map((c) => c.id));
  const trimmedRationales = Object.fromEntries(
    Object.entries(input.conceptRationales ?? {}).filter(([id, text]) => conceptIds.has(id) && text.trim().length > 0)
  );

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    shareHandle: input.shareHandle,
    source: buildSourceRef(input.project, input.localDurationSeconds),
    title: input.project.title,
    lessonSummary: input.project.lessonSummary,
    notes: input.notes,
    bubbles,
    pearls: input.pearls ?? [],
    concepts: input.concepts ?? [],
    themes: input.themes ?? [],
    conceptRationales: Object.keys(trimmedRationales).length > 0 ? trimmedRationales : undefined,
  };
}

export type ValidateBundleResult = { ok: true; bundle: ShareBundle } | { ok: false; error: string };

/** Parses+validates raw JSON text as a `.studyloop.json` bundle (SPEC: "validated (zod, version gate, ...)"). */
export function validateShareBundle(raw: string): ValidateBundleResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    return { ok: false, error: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (typeof data === "object" && data !== null && "version" in data && (data as { version: unknown }).version !== 1) {
    return { ok: false, error: `Unsupported bundle version: ${String((data as { version: unknown }).version)} (expected 1)` };
  }
  const parsed = ShareBundleSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: `Bundle failed validation: ${parsed.error.message}` };
  }
  return { ok: true, bundle: parsed.data };
}

// --- Overlay storage (`<project>/overlays/<handle>-<hash8>.studyloop.json`) ---

function slugifyHandle(handle: string): string {
  const base = handle
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "anonymous";
}

/** Deterministic overlay filename for a given handle + bundle content (SPEC: "<handle>-<hash8>.studyloop.json"). */
export function overlayFileName(handle: string, bundleRawJson: string, hash8Fn: (input: string) => string): string {
  return `${slugifyHandle(handle)}-${hash8Fn(bundleRawJson)}.studyloop.json`;
}
