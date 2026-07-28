// V2-C "Analysis engine" (SPEC "Analysis engine ('pearls & concept breakdown')"):
// chunks a transcript into ~8min windows (1min overlap), calls Claude per chunk
// to extract pearls + a concept breakdown, then a final merge pass dedupes,
// re-ranks importance, and synthesizes overarching themes.
//
// Deviation from the literal SPEC wording: structured outputs are requested via
// `output_config.format: {type:"json_schema", schema: ...}` on a plain
// `client.messages.create()` call, with the response hand-validated against our
// own zod schemas, rather than `client.messages.parse()` + the SDK's
// `zodOutputFormat()` helper. `zodOutputFormat()` internally imports `zod/v4`
// and calls `z.toJSONSchema()` / `.safeParse()` against the schema instance it's
// given; this repo is on zod v3's classic API (`server/package.json` pins
// `"zod": "^3.23.8"`, and every other schema in this codebase — models.ts,
// config.ts, concepts.ts — is a v3-classic instance). Mixing a v3-classic
// z.object(...) instance into zod/v4's introspection is exactly the "parse
// helper fights you" case the build brief calls out as an acceptable fallback —
// the manual json_schema + zod-validate path avoids that version-interop risk
// entirely and is what's implemented below.
//
// Both the per-chunk and merge Claude calls go through an injectable
// `AnalysisLLMClient` (same adapter-interface pattern as lib/innertube.ts's
// `InnertubeClient` — see __setAnalysisClientForTests there) so the chunking/
// merge/orchestration logic is fully unit-testable without a network call, and
// so `STUDYLOOP_FAKE_ANALYSIS=1` (see FakeAnalysisClient at the bottom) can
// drive the exact same code path for demos and the no-key-required dev flow.
import crypto from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { formatTimestamp } from "./time.js";
import type { TranscriptSegment } from "./transcripts.js";

// --- Public analysis.json shape (SPEC) --------------------------------------

export const PearlSchema = z.object({
  t: z.number().nonnegative(),
  label: z.string(),
  insight: z.string(),
  importance: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});
export type Pearl = z.infer<typeof PearlSchema>;

export const AnalysisConceptAnchorSchema = z.object({ t: z.number().nonnegative() });

export const AnalysisConceptSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  anchors: z.array(AnalysisConceptAnchorSchema),
  body: z.string(),
});
export type AnalysisConcept = z.infer<typeof AnalysisConceptSchema>;

export const AnalysisThemeSchema = z.object({
  title: z.string(),
  body: z.string(),
});
export type AnalysisTheme = z.infer<typeof AnalysisThemeSchema>;

export const AnalysisSchema = z.object({
  generatedAt: z.string(),
  model: z.string(),
  version: z.literal(2),
  pearls: z.array(PearlSchema),
  concepts: z.array(AnalysisConceptSchema),
  themes: z.array(AnalysisThemeSchema),
});
export type Analysis = z.infer<typeof AnalysisSchema>;

// --- Chunking ----------------------------------------------------------------

/** ~8-minute windows, 1-minute overlap (SPEC "Analysis engine"). */
export const CHUNK_WINDOW_SECONDS = 8 * 60;
export const CHUNK_OVERLAP_SECONDS = 60;

export interface TranscriptChunk {
  index: number;
  startSec: number;
  endSec: number;
  /** Segment texts joined with inline [mm:ss] timestamp prefixes, for the chunk prompt. */
  text: string;
}

/**
 * Slides a `windowSeconds`-wide window over the transcript's time range with
 * `overlapSeconds` of overlap between consecutive windows (stride =
 * windowSeconds - overlapSeconds). A window with no segments inside it (a gap
 * in the transcript) is skipped rather than sent to Claude empty. The final
 * window is clamped to the transcript's actual end, so it's frequently shorter
 * than `windowSeconds` — this is expected, not a bug (see chunking tests for
 * the exact edge-case shapes).
 */
export function chunkTranscript(
  segments: readonly TranscriptSegment[],
  windowSeconds: number = CHUNK_WINDOW_SECONDS,
  overlapSeconds: number = CHUNK_OVERLAP_SECONDS
): TranscriptChunk[] {
  if (segments.length === 0) return [];
  if (windowSeconds <= 0) throw new Error("windowSeconds must be positive");
  if (overlapSeconds < 0 || overlapSeconds >= windowSeconds) {
    throw new Error("overlapSeconds must be >= 0 and less than windowSeconds");
  }
  const stride = windowSeconds - overlapSeconds;
  const totalEnd = Math.max(...segments.map((s) => s.end));

  const chunks: TranscriptChunk[] = [];
  let windowStart = 0;
  let index = 0;
  // Bounded by totalEnd/stride — always terminates for a positive stride.
  for (;;) {
    const windowEnd = Math.min(windowStart + windowSeconds, totalEnd);
    const inWindow = segments.filter((s) => s.start < windowEnd && s.end > windowStart);
    if (inWindow.length > 0) {
      const text = inWindow.map((s) => `[${formatTimestamp(s.start)}] ${s.text}`).join("\n");
      chunks.push({ index, startSec: windowStart, endSec: windowEnd, text });
      index++;
    }
    if (windowEnd >= totalEnd) break;
    windowStart += stride;
  }
  return chunks;
}

// --- Per-chunk / merge wire shapes (raw, pre-id-assignment) -----------------

const ChunkPearlSchema = PearlSchema;
type ChunkPearl = Pearl;

const ChunkConceptSchema = z.object({
  title: z.string(),
  summary: z.string(),
  body: z.string(),
  anchorSeconds: z.array(z.number().nonnegative()),
});
type ChunkConcept = z.infer<typeof ChunkConceptSchema>;

const ChunkResultSchema = z.object({
  pearls: z.array(ChunkPearlSchema),
  concepts: z.array(ChunkConceptSchema),
});
export type ChunkResult = z.infer<typeof ChunkResultSchema>;

const MergeResultSchema = z.object({
  pearls: z.array(PearlSchema),
  concepts: z.array(ChunkConceptSchema),
  themes: z.array(AnalysisThemeSchema),
});
export type MergeResult = z.infer<typeof MergeResultSchema>;

// Hand-written JSON Schemas for output_config.format (see the file-header note
// on why this replaces client.messages.parse()+zodOutputFormat()). Structured
// outputs require additionalProperties:false and don't support length/range
// constraints — those are re-checked by the zod schemas above once parsed.
const CHUNK_JSON_SCHEMA = {
  type: "object",
  properties: {
    pearls: {
      type: "array",
      items: {
        type: "object",
        properties: {
          t: { type: "number" },
          label: { type: "string" },
          insight: { type: "string" },
          importance: { type: "integer", enum: [1, 2, 3] },
        },
        required: ["t", "label", "insight", "importance"],
        additionalProperties: false,
      },
    },
    concepts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
          body: { type: "string" },
          anchorSeconds: { type: "array", items: { type: "number" } },
        },
        required: ["title", "summary", "body", "anchorSeconds"],
        additionalProperties: false,
      },
    },
  },
  required: ["pearls", "concepts"],
  additionalProperties: false,
} as const;

const MERGE_JSON_SCHEMA = {
  type: "object",
  properties: {
    pearls: CHUNK_JSON_SCHEMA.properties.pearls,
    concepts: CHUNK_JSON_SCHEMA.properties.concepts,
    themes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          body: { type: "string" },
        },
        required: ["title", "body"],
        additionalProperties: false,
      },
    },
  },
  required: ["pearls", "concepts", "themes"],
  additionalProperties: false,
} as const;

// --- Prompts (domain-agnostic — no BJJ-specific wording anywhere here) ------

const CHUNK_SYSTEM_PROMPT = `You are analyzing one segment of an instructional video's transcript to help a learner study it later. The subject matter could be anything — cooking, martial arts, software, history, music theory, a lecture — extract what is actually being taught in THIS segment, never assume a fixed domain or template.

Extract:
- "pearls": specific, memorable insights worth remembering, each anchored to the timestamp (in seconds) where it's said. A label under 60 characters, a 1-3 sentence insight, and an importance rating: 3 = critical/central point, 2 = useful supporting point, 1 = minor/incidental detail.
- "concepts": distinct topics, techniques, or ideas covered in this segment. Each has a title, a 1-2 sentence summary, one or more anchor timestamps (in seconds) where it's discussed, and a longer markdown "body" explaining it in more depth.

Every timestamp you output (pearl "t", concept "anchorSeconds") MUST fall within this segment's own time range — never extrapolate a timestamp from outside what you were given. If the segment has little of substance, return short (or empty) pearls/concepts arrays rather than inventing content.`;

function buildChunkUserPrompt(chunk: TranscriptChunk): string {
  return [
    `This segment covers ${formatTimestamp(chunk.startSec)}–${formatTimestamp(chunk.endSec)} of the video (${chunk.startSec}s–${chunk.endSec}s).`,
    "Transcript for this segment (each line prefixed with its timestamp):",
    "",
    chunk.text,
  ].join("\n");
}

const MERGE_SYSTEM_PROMPT = `You are merging pearls and concept notes collected from multiple overlapping segments of ONE instructional video's transcript into a single coherent analysis. The segments overlap by design, so the same insight or topic may appear more than once — merge/deduplicate near-identical entries rather than listing them twice (when merging duplicate pearls, keep the more precise or earlier timestamp; when merging duplicate concepts, keep the most complete title/summary/body and union their anchor timestamps).

Re-rank "importance" (1-3) across the whole video now that you can see everything, not just what looked important within one segment. Then identify 2-6 overarching themes that span the entire video — these are unanchored, big-picture takeaways, not tied to a specific timestamp. Do not invent new pearls or concepts that aren't grounded in the input you were given; you are consolidating, not generating fresh content.`;

function buildMergeUserPrompt(pearls: readonly ChunkPearl[], concepts: readonly ChunkConcept[]): string {
  return [
    "Collected pearls (JSON, possibly containing near-duplicates from overlapping segments):",
    JSON.stringify(pearls),
    "",
    "Collected concepts (JSON, possibly containing near-duplicates from overlapping segments):",
    JSON.stringify(concepts),
  ].join("\n");
}

// --- Injectable LLM client abstraction ---------------------------------------

export type AnalysisSkipReason = "refusal" | "max_tokens" | "parse_error";

export type AnalysisOutcome<T> =
  | { kind: "ok"; data: T }
  | { kind: "skipped"; reason: AnalysisSkipReason; detail: string };

export interface AnalysisLLMClient {
  runChunk(chunk: TranscriptChunk, model: string): Promise<AnalysisOutcome<ChunkResult>>;
  runMerge(pearls: readonly ChunkPearl[], concepts: readonly ChunkConcept[], model: string): Promise<AnalysisOutcome<MergeResult>>;
}

/** max_tokens per chunk/merge call (SPEC "max_tokens 16000 per chunk call"). */
export const ANALYSIS_MAX_TOKENS = 16000;

/**
 * Real implementation, backed by @anthropic-ai/sdk. `thinking` is deliberately
 * omitted from every request (SPEC: "omit `thinking` param entirely" — Claude
 * Opus 5 runs adaptive thinking by default when the field is absent).
 */
export class AnthropicAnalysisClient implements AnalysisLLMClient {
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  private async runStructured<T>(
    system: string,
    userPrompt: string,
    schema: z.ZodType<T>,
    jsonSchema: Record<string, unknown>,
    model: string
  ): Promise<AnalysisOutcome<T>> {
    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model,
        max_tokens: ANALYSIS_MAX_TOKENS,
        system,
        messages: [{ role: "user", content: userPrompt }],
        // `thinking` is deliberately omitted (SPEC: "omit `thinking` param
        // entirely") — Claude Opus 5 runs adaptive thinking by default.
        output_config: { format: { type: "json_schema", schema: jsonSchema } },
      });
    } catch (err) {
      return { kind: "skipped", reason: "parse_error", detail: err instanceof Error ? err.message : String(err) };
    }
    if (response.stop_reason === "refusal") {
      return { kind: "skipped", reason: "refusal", detail: "Claude declined this chunk (safety classifier)" };
    }
    if (response.stop_reason === "max_tokens") {
      return { kind: "skipped", reason: "max_tokens", detail: "Hit max_tokens before finishing this chunk" };
    }
    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text" && typeof b.text === "string");
    if (!textBlock?.text) {
      return { kind: "skipped", reason: "parse_error", detail: "No text content in response" };
    }
    let raw: unknown;
    try {
      raw = JSON.parse(textBlock.text);
    } catch (err) {
      return { kind: "skipped", reason: "parse_error", detail: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}` };
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return { kind: "skipped", reason: "parse_error", detail: parsed.error.message };
    }
    return { kind: "ok", data: parsed.data };
  }

  async runChunk(chunk: TranscriptChunk, model: string): Promise<AnalysisOutcome<ChunkResult>> {
    return this.runStructured(CHUNK_SYSTEM_PROMPT, buildChunkUserPrompt(chunk), ChunkResultSchema, CHUNK_JSON_SCHEMA, model);
  }

  async runMerge(pearls: readonly ChunkPearl[], concepts: readonly ChunkConcept[], model: string): Promise<AnalysisOutcome<MergeResult>> {
    return this.runStructured(MERGE_SYSTEM_PROMPT, buildMergeUserPrompt(pearls, concepts), MergeResultSchema, MERGE_JSON_SCHEMA, model);
  }
}

/**
 * Deterministic fake client — no network call, no API key required. Used when
 * `STUDYLOOP_FAKE_ANALYSIS=1` (see routes/analyze.ts), and directly injectable
 * in tests. Derives pearls/concepts from the chunk's own text so output still
 * varies sensibly across a real transcript, without any randomness (two runs
 * over the same input produce byte-identical output).
 */
export class FakeAnalysisClient implements AnalysisLLMClient {
  async runChunk(chunk: TranscriptChunk, _model?: string): Promise<AnalysisOutcome<ChunkResult>> {
    const mid = chunk.startSec + (chunk.endSec - chunk.startSec) / 2;
    const words = chunk.text.replace(/\[[^\]]*\]/g, "").trim().split(/\s+/).filter(Boolean);
    const labelSeed = words.slice(0, 6).join(" ").trim();
    const label = (labelSeed || `Segment at ${formatTimestamp(mid)}`).slice(0, 60);
    const importance: 1 | 2 | 3 = (((chunk.index % 3) + 1) as 1 | 2 | 3);
    return {
      kind: "ok",
      data: {
        pearls: [
          {
            t: Math.round(mid),
            label,
            insight: `A key point discussed around ${formatTimestamp(mid)} (fake demo data).`,
            importance,
          },
        ],
        concepts: [
          {
            title: labelSeed ? `Topic: ${labelSeed.slice(0, 40)}` : `Topic at ${formatTimestamp(chunk.startSec)}`,
            summary: `Summary of the content between ${formatTimestamp(chunk.startSec)} and ${formatTimestamp(chunk.endSec)} (fake demo data).`,
            body: `Detailed (fake) breakdown of this segment, generated deterministically for demo/dev use — no live model call was made.`,
            anchorSeconds: [chunk.startSec],
          },
        ],
      },
    };
  }

  async runMerge(pearls: readonly ChunkPearl[], concepts: readonly ChunkConcept[], _model?: string): Promise<AnalysisOutcome<MergeResult>> {
    const dedupedConcepts = new Map<string, ChunkConcept>();
    for (const c of concepts) {
      const existing = dedupedConcepts.get(c.title);
      if (existing) {
        existing.anchorSeconds = [...new Set([...existing.anchorSeconds, ...c.anchorSeconds])].sort((a, b) => a - b);
      } else {
        dedupedConcepts.set(c.title, { ...c, anchorSeconds: [...c.anchorSeconds] });
      }
    }
    const dedupedPearls = new Map<string, ChunkPearl>();
    for (const p of pearls) {
      const key = p.label;
      const existing = dedupedPearls.get(key);
      if (!existing || p.t < existing.t) dedupedPearls.set(key, p);
    }
    return {
      kind: "ok",
      data: {
        pearls: [...dedupedPearls.values()].sort((a, b) => a.t - b.t),
        concepts: [...dedupedConcepts.values()],
        themes: [
          {
            title: "Overarching theme (fake demo data)",
            body: "A synthesized, whole-video takeaway generated deterministically for demo/dev use — no live model call was made.",
          },
        ],
      },
    };
  }
}

let injectedClientForTests: AnalysisLLMClient | null = null;

/** Test-only: force `resolveAnalysisClient` to return a fake/spy implementation. */
export function __setAnalysisClientForTests(client: AnalysisLLMClient | null): void {
  injectedClientForTests = client;
}

export class NoApiKeyError extends Error {
  constructor() {
    super("No Anthropic API key configured");
    this.name = "NoApiKeyError";
  }
}

/**
 * Resolves which LLM client an analyze run should use: a test-injected fake
 * (highest priority — never touches env/network from a test), then the
 * deterministic fake when `STUDYLOOP_FAKE_ANALYSIS=1` (dev/demo mode — no key
 * required), then the real Anthropic-backed client (throws NoApiKeyError if
 * `apiKey` is null; callers should have already gated on this — see
 * routes/analyze.ts's `evaluateAnalyzeGuard`).
 */
export function resolveAnalysisClient(apiKey: string | null): AnalysisLLMClient {
  if (injectedClientForTests) return injectedClientForTests;
  if (process.env.STUDYLOOP_FAKE_ANALYSIS === "1") return new FakeAnalysisClient();
  if (!apiKey) throw new NoApiKeyError();
  return new AnthropicAnalysisClient(apiKey);
}

export function isFakeAnalysisMode(): boolean {
  return injectedClientForTests !== null || process.env.STUDYLOOP_FAKE_ANALYSIS === "1";
}

// --- Concept id assignment (deterministic, not model-generated) -------------

function slugifyTitle(title: string): string {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "concept";
}

/** Assigns stable, unique ids to merged concepts (slug of the title, deduped with -2/-3/... suffixes). */
export function assignConceptIds(concepts: readonly ChunkConcept[]): AnalysisConcept[] {
  const seen = new Map<string, number>();
  return concepts.map((c) => {
    const base = slugifyTitle(c.title);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    const id = count === 1 ? base : `${base}-${count}`;
    return {
      id,
      title: c.title,
      summary: c.summary,
      body: c.body,
      anchors: c.anchorSeconds.map((t) => ({ t })),
    };
  });
}

// --- Orchestration -------------------------------------------------------------

export interface AnalysisJobParams {
  segments: readonly TranscriptSegment[];
  model: string;
  client: AnalysisLLMClient;
  onProgress?: (pct: number) => void;
}

export class AnalysisRunError extends Error {}

/**
 * Runs the full chunk -> per-chunk-extract -> merge pipeline. Per-chunk
 * refusal/max_tokens/parse failures are logged and skipped (SPEC: "skip
 * chunk with warning, never abort whole run") — the run only fails outright
 * if every chunk was skipped (nothing to merge) or the merge call itself
 * fails.
 */
export async function runAnalysisJob(params: AnalysisJobParams): Promise<Analysis> {
  const chunks = chunkTranscript(params.segments);
  if (chunks.length === 0) {
    throw new AnalysisRunError("Transcript has no content to analyze");
  }

  const collectedPearls: ChunkPearl[] = [];
  const collectedConcepts: ChunkConcept[] = [];
  let succeeded = 0;
  const skippedDetails: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    // eslint-disable-next-line no-await-in-loop -- chunks are analyzed sequentially by design (progress reporting, bounded concurrency to the API)
    const outcome = await params.client.runChunk(chunk, params.model);
    if (outcome.kind === "ok") {
      succeeded++;
      collectedPearls.push(...outcome.data.pearls);
      collectedConcepts.push(...outcome.data.concepts);
    } else {
      const warning = `chunk ${i} (${formatTimestamp(chunk.startSec)}–${formatTimestamp(chunk.endSec)}) skipped: ${outcome.reason} — ${outcome.detail}`;
      skippedDetails.push(warning);
      // eslint-disable-next-line no-console
      console.warn(`[analysis] ${warning}`);
    }
    params.onProgress?.(Math.round(((i + 1) / (chunks.length + 1)) * 100));
  }

  if (succeeded === 0) {
    throw new AnalysisRunError(
      `All ${chunks.length} transcript chunk(s) were skipped — no analysis could be produced. ${skippedDetails.join("; ")}`
    );
  }

  const merge = await params.client.runMerge(collectedPearls, collectedConcepts, params.model);
  if (merge.kind !== "ok") {
    throw new AnalysisRunError(`Merge pass failed (${merge.reason}): ${merge.detail}`);
  }
  params.onProgress?.(100);

  return {
    generatedAt: new Date().toISOString(),
    model: params.model,
    version: 2,
    pearls: merge.data.pearls,
    concepts: assignConceptIds(merge.data.concepts),
    themes: merge.data.themes,
  };
}

/** Stable content hash (first 8 hex chars of sha256) — used for overlay filenames (see lib/shareBundle.ts). */
export function shortHash(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 8);
}
