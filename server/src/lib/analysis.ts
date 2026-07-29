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
import { DomainSchema, type Domain } from "./models.js";
import type { TranscriptSegment } from "./transcripts.js";

// --- Public analysis.json shape (SPEC) --------------------------------------

export const PearlSchema = z.object({
  t: z.number().nonnegative(),
  label: z.string(),
  insight: z.string(),
  importance: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  /** V3-B B1: links this pearl to a typed unit (analysis.units) when the merge pass could resolve one — see resolvePearlUnitId. Absent for v2 analyses and for v3 pearls with no matching unit. */
  unitId: z.string().optional(),
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

export const AnalysisSourceSchema = z.enum(["model", "stub"]);
export type AnalysisSource = z.infer<typeof AnalysisSourceSchema>;

// --- V3-B B1: typed spine (units/edges) — see PEDAGOGY.md §2 ---------------

export const UnitTypeSchema = z.enum(["CLAIM", "MECHANISM", "PROCEDURE", "EXAMPLE", "BOUNDARY"]);
export type UnitType = z.infer<typeof UnitTypeSchema>;

export const EdgeTypeSchema = z.enum(["REQUIRES", "PART_OF", "EXAMPLE_OF", "PROCEDURE_STEP"]);
export type EdgeType = z.infer<typeof EdgeTypeSchema>;

export const UnitAnchorSchema = z.object({ t: z.number().nonnegative(), quote: z.string() });
export type UnitAnchor = z.infer<typeof UnitAnchorSchema>;

export const AnalysisUnitSchema = z.object({
  id: z.string(),
  type: UnitTypeSchema,
  label: z.string(),
  summary: z.string(),
  body: z.string(),
  anchors: z.array(UnitAnchorSchema),
  confidence: z.number().min(0).max(1),
});
export type AnalysisUnit = z.infer<typeof AnalysisUnitSchema>;

export const AnalysisEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  type: EdgeTypeSchema,
  quote: z.string(),
  confidence: z.number().min(0).max(1),
});
export type AnalysisEdge = z.infer<typeof AnalysisEdgeSchema>;

/**
 * `version: 2 | 3`. Deviation from a literal discriminated union: `pearls`/
 * `concepts`/`themes` stay REQUIRED on every version (not just v2) — v3 runs
 * populate `concepts` as a deterministic mirror of `units` (see
 * unitsToConceptsMirror below) purely so the several V3-C-owned surfaces this
 * analysis type feeds (lib/heatmap.ts, lib/shareBundle.ts, routes/heatmap.ts,
 * routes/share.ts, routes/compile.ts) keep reading `.pearls`/`.concepts`/
 * `.themes` off a single non-optional shape without needing per-version
 * branching in files this build explicitly must not touch. `domain`/`units`/
 * `edges` are the genuinely-new v3-only fields (optional — absent on v2).
 */
export const AnalysisSchema = z.object({
  generatedAt: z.string(),
  model: z.string(),
  version: z.union([z.literal(2), z.literal(3)]).default(2),
  // codex P0-2 "stub-analysis leakage": provenance flag so the web app can
  // hide FakeAnalysisClient output (STUDYLOOP_FAKE_ANALYSIS=1) outside dev
  // builds instead of rendering it as if it were a real model result.
  // Defaulted for backward compatibility with analysis.json files written
  // before this field existed — those were all real model runs (the fake
  // client didn't exist yet), so "model" is the correct historical default.
  source: AnalysisSourceSchema.default("model"),
  pearls: z.array(PearlSchema),
  concepts: z.array(AnalysisConceptSchema),
  themes: z.array(AnalysisThemeSchema),
  /** V3-B B1: router-classified domain (see models.ts DomainSchema) — present on v3 analyses only. */
  domain: DomainSchema.optional(),
  /** V3-B B1: typed spine units — present on v3 analyses only. */
  units: z.array(AnalysisUnitSchema).optional(),
  /** V3-B B1: typed spine edges — present on v3 analyses only. */
  edges: z.array(AnalysisEdgeSchema).optional(),
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

// --- V3-B B1: per-chunk / merge wire shapes for the typed spine -------------
// Units/edges are identified by LABEL at the wire level (models don't emit
// stable ids) — the same "raw, pre-id-assignment" shape the v2 concepts wire
// format already uses. Unlike v2's concept merge (an LLM call reconciles
// near-duplicate titles), unit/edge merging here is fully deterministic
// (`mergeUnitsByFingerprint`/`mergeEdgesByFingerprint` below) — SPEC's own
// wording, "dedups by label-fingerprint, averages confidence, keeps all
// anchors", describes a pure string-fingerprint + arithmetic-mean operation,
// not a semantic LLM merge, so there's no need to spend a model call on it.
// Only pearls/themes still go through an LLM merge pass (re-ranking
// importance and synthesizing themes needs judgment a fingerprint can't do).

const ChunkPearlV3Schema = PearlSchema.extend({
  /**
   * Chunk-local label of the unit this pearl illustrates, if the model tied
   * one — resolved to a real unitId post-merge (see resolvePearlUnitId).
   * Required (not `.optional()`) at the wire level and empty-string when
   * N/A: structured-output json_schema mode wants every property present,
   * so genuine optionality is modeled as "" rather than an absent key.
   */
  unitLabel: z.string(),
});
type ChunkPearlV3 = z.infer<typeof ChunkPearlV3Schema>;

const ChunkUnitRawSchema = z.object({
  type: UnitTypeSchema,
  label: z.string(),
  summary: z.string(),
  body: z.string(),
  anchors: z.array(UnitAnchorSchema),
  confidence: z.number().min(0).max(1),
});
type ChunkUnitRaw = z.infer<typeof ChunkUnitRawSchema>;

const ChunkEdgeRawSchema = z.object({
  sourceLabel: z.string(),
  targetLabel: z.string(),
  type: EdgeTypeSchema,
  quote: z.string(),
  confidence: z.number().min(0).max(1),
});
type ChunkEdgeRaw = z.infer<typeof ChunkEdgeRawSchema>;

const ChunkV3ResultSchema = z.object({
  pearls: z.array(ChunkPearlV3Schema),
  units: z.array(ChunkUnitRawSchema),
  edges: z.array(ChunkEdgeRawSchema),
});
export type ChunkV3Result = z.infer<typeof ChunkV3ResultSchema>;

const MergeV3ResultSchema = z.object({
  pearls: z.array(ChunkPearlV3Schema),
  themes: z.array(AnalysisThemeSchema),
});
export type MergeV3Result = z.infer<typeof MergeV3ResultSchema>;

const ROUTER_RESULT_SCHEMA = z.object({ domain: DomainSchema });
export type RouterResult = z.infer<typeof ROUTER_RESULT_SCHEMA>;

const ROUTER_JSON_SCHEMA = {
  type: "object",
  properties: {
    domain: { type: "string", enum: ["biology", "history", "music", "physical_skill", "generic"] },
  },
  required: ["domain"],
  additionalProperties: false,
} as const;

const UNIT_ANCHOR_JSON_SCHEMA = {
  type: "object",
  properties: { t: { type: "number" }, quote: { type: "string" } },
  required: ["t", "quote"],
  additionalProperties: false,
} as const;

const CHUNK_V3_JSON_SCHEMA = {
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
          unitLabel: { type: "string" },
        },
        required: ["t", "label", "insight", "importance", "unitLabel"],
        additionalProperties: false,
      },
    },
    units: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["CLAIM", "MECHANISM", "PROCEDURE", "EXAMPLE", "BOUNDARY"] },
          label: { type: "string" },
          summary: { type: "string" },
          body: { type: "string" },
          anchors: { type: "array", items: UNIT_ANCHOR_JSON_SCHEMA },
          confidence: { type: "number" },
        },
        required: ["type", "label", "summary", "body", "anchors", "confidence"],
        additionalProperties: false,
      },
    },
    edges: {
      type: "array",
      items: {
        type: "object",
        properties: {
          sourceLabel: { type: "string" },
          targetLabel: { type: "string" },
          type: { type: "string", enum: ["REQUIRES", "PART_OF", "EXAMPLE_OF", "PROCEDURE_STEP"] },
          quote: { type: "string" },
          confidence: { type: "number" },
        },
        required: ["sourceLabel", "targetLabel", "type", "quote", "confidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["pearls", "units", "edges"],
  additionalProperties: false,
} as const;

const MERGE_V3_JSON_SCHEMA = {
  type: "object",
  properties: {
    pearls: CHUNK_V3_JSON_SCHEMA.properties.pearls,
    themes: MERGE_JSON_SCHEMA.properties.themes,
  },
  required: ["pearls", "themes"],
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

// --- V3-B B1: router + typed-spine prompts ----------------------------------

const ROUTER_SYSTEM_PROMPT = `Classify the dominant subject-matter domain of an instructional video from a sample of its transcript. Choose exactly one of: "biology" (life sciences, physiology, systems/mechanisms), "history" (historical events, causation, sourcing), "music" (music theory, notation, ear training), "physical_skill" (martial arts, sports, dance, or other physical technique/movement instruction), or "generic" (anything else, mixed subject matter, or unclear from the sample). This is a coarse routing signal, not a final judgment — the learner can change it later, so prefer your best single guess over hedging.`;

function buildRouterUserPrompt(sampleText: string): string {
  return `Transcript sample:\n\n${sampleText}`;
}

/**
 * PEDAGOGY §2 "domain lenses are prompt modules, not separate engines" — one
 * line of emphasis appended to the shared v3 chunk system prompt per domain.
 * The JSON schema stays identical across domains (CHUNK_V3_JSON_SCHEMA);
 * only this text changes which unit types/edge types the model reaches for.
 */
const DOMAIN_MODULES: Record<Domain, string> = {
  biology:
    "Domain lens: biology/systems. Favor MECHANISM units for causal chains, feedback loops, and levels of organization; use REQUIRES/PART_OF edges to connect a mechanism to the components or prerequisite mechanisms it depends on.",
  history:
    "Domain lens: history. Favor CLAIM units, and in each unit's body note who is claiming it and on what basis (primary/secondary sourcing, corroboration, perspective) where the transcript supports it; use REQUIRES edges for causal chains between events.",
  music:
    "Domain lens: music theory. Favor CLAIM units for theory statements and EXAMPLE units for the passages/sounds that illustrate them; use EXAMPLE_OF edges to link a specific example to the concept it demonstrates, and note notation-to-sound pairings in the body where audible.",
  physical_skill:
    "Domain lens: physical skill. Favor PROCEDURE units for ordered steps, triggers, and failure modes; use PROCEDURE_STEP edges between consecutive steps of the same procedure.",
  generic:
    "No specific domain lens applies — keep unit-type emphasis balanced across CLAIM/MECHANISM/PROCEDURE/EXAMPLE/BOUNDARY rather than favoring one.",
};

function buildChunkV3SystemPrompt(domain: Domain): string {
  return `You are analyzing one segment of an instructional video's transcript to help a learner study it later. The subject matter could be anything — cooking, martial arts, software, history, music theory, a lecture — extract what is actually being taught in THIS segment, never assume a fixed domain or template beyond the lens noted below.

Extract:
- "pearls": specific, memorable insights worth remembering, each anchored to the timestamp (in seconds) where it's said. A label under 60 characters, a 1-3 sentence insight, an importance rating (3 = critical/central point, 2 = useful supporting point, 1 = minor/incidental detail), and "unitLabel": the exact label of the unit below this pearl illustrates, or "" if none fits.
- "units": typed knowledge units on a universal spine — each is exactly one of CLAIM (an assertion), MECHANISM (how/why something works), PROCEDURE (an ordered how-to), EXAMPLE (a concrete instance), or BOUNDARY (a limit, exception, or "this doesn't apply when…"). Each unit has a short "label" (used to link edges/pearls to it — keep it stable and specific, not a generic phrase), a 1-2 sentence "summary", a longer markdown "body", one or more "anchors" (each an exact "quote" from the transcript plus its timestamp "t" in seconds), and a "confidence" 0-1 for how clearly the transcript supports this unit as extracted.
- "edges": relationships between two units you extracted THIS segment — "sourceLabel"/"targetLabel" must exactly match "label" fields above, "type" is one of REQUIRES (source requires target as a prerequisite), PART_OF (source is part of target), EXAMPLE_OF (source is an example of target), or PROCEDURE_STEP (source is the step before target in the same procedure), plus the supporting "quote" and a "confidence" 0-1. Only emit edges between two units both present in this same segment's "units" list.

${DOMAIN_MODULES[domain]}

Every timestamp you output MUST fall within this segment's own time range — never extrapolate a timestamp from outside what you were given. If the segment has little of substance, return short (or empty) arrays rather than inventing content.`;
}

function buildMergeV3UserPrompt(pearls: readonly ChunkPearlV3[]): string {
  return [
    "Collected pearls (JSON, possibly containing near-duplicates from overlapping segments — each may carry a unitLabel field; copy it through unchanged on whichever merged pearl you keep):",
    JSON.stringify(pearls),
  ].join("\n");
}

const MERGE_V3_SYSTEM_PROMPT = `You are merging pearls collected from multiple overlapping segments of ONE instructional video's transcript into a single coherent set. The segments overlap by design, so the same insight may appear more than once — merge/deduplicate near-identical pearls rather than listing them twice (keep the more precise or earlier timestamp, and preserve a non-empty "unitLabel" field from whichever duplicate has one).

Re-rank "importance" (1-3) across the whole video now that you can see everything, not just what looked important within one segment. Then identify 2-6 overarching themes that span the entire video — these are unanchored, big-picture takeaways, not tied to a specific timestamp. Do not invent new pearls that aren't grounded in the input you were given; you are consolidating, not generating fresh content.`;

// --- Injectable LLM client abstraction ---------------------------------------

export type AnalysisSkipReason = "refusal" | "max_tokens" | "parse_error";

export type AnalysisOutcome<T> =
  | { kind: "ok"; data: T }
  | { kind: "skipped"; reason: AnalysisSkipReason; detail: string };

export interface AnalysisLLMClient {
  runChunk(chunk: TranscriptChunk, model: string): Promise<AnalysisOutcome<ChunkResult>>;
  runMerge(pearls: readonly ChunkPearl[], concepts: readonly ChunkConcept[], model: string): Promise<AnalysisOutcome<MergeResult>>;
}

/**
 * V3-B B1: the typed-spine counterpart to `AnalysisLLMClient` above — kept as
 * a SEPARATE interface (not folded into `AnalysisLLMClient`) so existing
 * tests/callers that construct a minimal `{runChunk, runMerge}` object
 * literal typed as `AnalysisLLMClient` (see test/analysis.test.ts) keep
 * compiling unchanged. `AnthropicAnalysisClient` and `FakeAnalysisClient`
 * both implement this in addition to the v2 interface.
 */
export interface AnalysisLLMClientV3 {
  runRouter(sampleText: string, model: string): Promise<AnalysisOutcome<RouterResult>>;
  runChunkV3(chunk: TranscriptChunk, domain: Domain, model: string): Promise<AnalysisOutcome<ChunkV3Result>>;
  runMergeV3(pearls: readonly ChunkPearlV3[], model: string): Promise<AnalysisOutcome<MergeV3Result>>;
}

/** SPEC: "ONE cheap router call per project" — small max_tokens, distinct from the per-chunk/merge budget. */
export const ROUTER_MAX_TOKENS = 200;

/** max_tokens per chunk/merge call (SPEC "max_tokens 16000 per chunk call"). */
export const ANALYSIS_MAX_TOKENS = 16000;

/**
 * Real implementation, backed by @anthropic-ai/sdk. `thinking` is deliberately
 * omitted from every request (SPEC: "omit `thinking` param entirely" — Claude
 * Opus 5 runs adaptive thinking by default when the field is absent).
 */
export class AnthropicAnalysisClient implements AnalysisLLMClient, AnalysisLLMClientV3 {
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  private async runStructured<T>(
    system: string,
    userPrompt: string,
    schema: z.ZodType<T>,
    jsonSchema: Record<string, unknown>,
    model: string,
    maxTokens: number = ANALYSIS_MAX_TOKENS
  ): Promise<AnalysisOutcome<T>> {
    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model,
        max_tokens: maxTokens,
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

  // --- V3-B B1: typed-spine methods -----------------------------------------

  async runRouter(sampleText: string, model: string): Promise<AnalysisOutcome<RouterResult>> {
    return this.runStructured(
      ROUTER_SYSTEM_PROMPT,
      buildRouterUserPrompt(sampleText),
      ROUTER_RESULT_SCHEMA,
      ROUTER_JSON_SCHEMA,
      model,
      ROUTER_MAX_TOKENS
    );
  }

  async runChunkV3(chunk: TranscriptChunk, domain: Domain, model: string): Promise<AnalysisOutcome<ChunkV3Result>> {
    return this.runStructured(
      buildChunkV3SystemPrompt(domain),
      buildChunkUserPrompt(chunk),
      ChunkV3ResultSchema,
      CHUNK_V3_JSON_SCHEMA,
      model
    );
  }

  async runMergeV3(pearls: readonly ChunkPearlV3[], model: string): Promise<AnalysisOutcome<MergeV3Result>> {
    return this.runStructured(MERGE_V3_SYSTEM_PROMPT, buildMergeV3UserPrompt(pearls), MergeV3ResultSchema, MERGE_V3_JSON_SCHEMA, model);
  }
}

/**
 * Deterministic fake client — no network call, no API key required. Used when
 * `STUDYLOOP_FAKE_ANALYSIS=1` (see routes/analyze.ts), and directly injectable
 * in tests. Derives pearls/concepts from the chunk's own text so output still
 * varies sensibly across a real transcript, without any randomness (two runs
 * over the same input produce byte-identical output).
 */
export class FakeAnalysisClient implements AnalysisLLMClient, AnalysisLLMClientV3 {
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
            insight: `A notable point comes up around ${formatTimestamp(mid)}, worth revisiting.`,
            importance,
          },
        ],
        concepts: [
          {
            title: labelSeed ? `Topic: ${labelSeed.slice(0, 40)}` : `Topic at ${formatTimestamp(chunk.startSec)}`,
            summary: `Covers the material discussed between ${formatTimestamp(chunk.startSec)} and ${formatTimestamp(chunk.endSec)}.`,
            body: `A closer look at this segment, walking through the key points raised between ${formatTimestamp(chunk.startSec)} and ${formatTimestamp(chunk.endSec)}.`,
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
            title: "Overarching theme",
            body: "A synthesized, whole-video takeaway drawn from the pearls and concepts above.",
          },
        ],
      },
    };
  }

  // --- V3-B B1: typed-spine methods (also deterministic, no randomness) ----

  /** Simple keyword-count heuristic — deterministic, no network call, mirrors the real router's five-way classification without needing a model. */
  async runRouter(sampleText: string, _model?: string): Promise<AnalysisOutcome<RouterResult>> {
    const lower = sampleText.toLowerCase();
    const keywordsByDomain: Record<Exclude<Domain, "generic">, string[]> = {
      biology: ["cell", "organism", "enzyme", "protein", "mechanism", "biology", "dna", "tissue", "membrane"],
      history: ["century", "war", "empire", "revolution", "treaty", "historian", "era", "dynasty"],
      music: ["chord", "scale", "note", "melody", "rhythm", "harmony", "key signature", "cadence"],
      physical_skill: ["grip", "stance", "technique", "drill", "posture", "balance", "guard", "submission", "takedown"],
    };
    let best: Domain = "generic";
    let bestCount = 0;
    for (const [domain, keywords] of Object.entries(keywordsByDomain) as [Exclude<Domain, "generic">, string[]][]) {
      const count = keywords.reduce((sum, kw) => sum + (lower.includes(kw) ? 1 : 0), 0);
      if (count > bestCount) {
        best = domain;
        bestCount = count;
      }
    }
    return { kind: "ok", data: { domain: best } };
  }

  async runChunkV3(chunk: TranscriptChunk, _domain: Domain, _model?: string): Promise<AnalysisOutcome<ChunkV3Result>> {
    const mid = chunk.startSec + (chunk.endSec - chunk.startSec) / 2;
    const words = chunk.text.replace(/\[[^\]]*\]/g, "").trim().split(/\s+/).filter(Boolean);
    const labelSeed = words.slice(0, 6).join(" ").trim();
    const primaryLabel = (labelSeed || `Segment at ${formatTimestamp(mid)}`).slice(0, 60);
    const secondaryLabel = `Example: ${primaryLabel}`.slice(0, 60);
    const unitTypes: UnitType[] = ["CLAIM", "MECHANISM", "PROCEDURE", "EXAMPLE", "BOUNDARY"];
    const primaryType = unitTypes[chunk.index % unitTypes.length];
    const importance: 1 | 2 | 3 = (((chunk.index % 3) + 1) as 1 | 2 | 3);
    // Confidence cycles through a band straddling the 0.6 low-confidence
    // threshold (SPEC B3: "low-confidence (<0.6) edges do not affect
    // ordering") so both branches of that rule are exercisable in fake mode.
    const confidence = Math.round((0.5 + (chunk.index % 5) * 0.08) * 100) / 100;
    const leadQuote = words.slice(0, 12).join(" ") || primaryLabel;
    const tailQuote = words.slice(-12).join(" ") || secondaryLabel;
    return {
      kind: "ok",
      data: {
        pearls: [
          {
            t: Math.round(mid),
            label: primaryLabel,
            insight: `A notable point comes up around ${formatTimestamp(mid)}, worth revisiting.`,
            importance,
            unitLabel: primaryLabel,
          },
        ],
        units: [
          {
            type: primaryType,
            label: primaryLabel,
            summary: `Covers the material discussed between ${formatTimestamp(chunk.startSec)} and ${formatTimestamp(chunk.endSec)}.`,
            body: `A closer look at this segment, walking through the key points raised between ${formatTimestamp(chunk.startSec)} and ${formatTimestamp(chunk.endSec)}.`,
            anchors: [{ t: chunk.startSec, quote: leadQuote }],
            confidence,
          },
          {
            type: "EXAMPLE",
            label: secondaryLabel,
            summary: `A concrete example illustrating "${primaryLabel}".`,
            body: `An example drawn from around ${formatTimestamp(chunk.endSec)} that illustrates the point above.`,
            anchors: [{ t: chunk.endSec, quote: tailQuote }],
            confidence: Math.min(1, confidence + 0.1),
          },
        ],
        edges: [
          {
            sourceLabel: secondaryLabel,
            targetLabel: primaryLabel,
            type: "EXAMPLE_OF",
            quote: tailQuote,
            confidence,
          },
        ],
      },
    };
  }

  async runMergeV3(pearls: readonly ChunkPearlV3[], _model?: string): Promise<AnalysisOutcome<MergeV3Result>> {
    const dedupedPearls = new Map<string, ChunkPearlV3>();
    for (const p of pearls) {
      const key = p.label;
      const existing = dedupedPearls.get(key);
      if (!existing || p.t < existing.t) dedupedPearls.set(key, p);
    }
    return {
      kind: "ok",
      data: {
        pearls: [...dedupedPearls.values()].sort((a, b) => a.t - b.t),
        themes: [
          {
            title: "Overarching theme",
            body: "A synthesized, whole-video takeaway drawn from the pearls above.",
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

let injectedClientForTestsV3: AnalysisLLMClientV3 | null = null;

/** Test-only: force `resolveAnalysisClientV3` to return a fake/spy implementation — decoupled from `__setAnalysisClientForTests` (see AnalysisLLMClientV3's doc comment for why). */
export function __setAnalysisClientV3ForTests(client: AnalysisLLMClientV3 | null): void {
  injectedClientForTestsV3 = client;
}

/** V3-B B1 counterpart to `resolveAnalysisClient` — same priority order, resolving the typed-spine interface instead. */
export function resolveAnalysisClientV3(apiKey: string | null): AnalysisLLMClientV3 {
  if (injectedClientForTestsV3) return injectedClientForTestsV3;
  if (process.env.STUDYLOOP_FAKE_ANALYSIS === "1") return new FakeAnalysisClient();
  if (!apiKey) throw new NoApiKeyError();
  return new AnthropicAnalysisClient(apiKey);
}

export function isFakeAnalysisMode(): boolean {
  return (
    injectedClientForTests !== null || injectedClientForTestsV3 !== null || process.env.STUDYLOOP_FAKE_ANALYSIS === "1"
  );
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
  /** Provenance to stamp on the resulting analysis.json (default "model" — see AnalysisSchema). */
  source?: AnalysisSource;
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
    source: params.source ?? "model",
    pearls: merge.data.pearls,
    concepts: assignConceptIds(merge.data.concepts),
    themes: merge.data.themes,
  };
}

// --- V3-B B1: deterministic typed-spine merge (label-fingerprint) ----------

/** Same slug shape as slugifyTitle, but returns "" for a label with no alphanumeric characters instead of a "concept" fallback — callers decide how to handle that case (see mergeUnitsByFingerprint). */
function fingerprintLabel(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function average(values: readonly number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * SPEC B1: "Merge pass dedups by label-fingerprint, averages confidence,
 * keeps all anchors." Deterministic (no LLM call) — groups raw chunk units by
 * a slugified label, then per group: the most-common unit type wins (ties go
 * to the first occurrence), the longest summary/body is kept (a proxy for
 * "most complete"), anchors are unioned and deduped by timestamp, and
 * confidence is the arithmetic mean across the group. A label with no
 * alphanumeric characters at all gets its own synthetic, never-colliding
 * fingerprint (`unit-<n>`) rather than silently merging every such unit into
 * one — mirrors assignConceptIds' "concept" fallback, but without the false
 * merge that reusing one shared fallback string would cause here.
 */
export function mergeUnitsByFingerprint(units: readonly ChunkUnitRaw[]): AnalysisUnit[] {
  const order: string[] = [];
  const groups = new Map<string, ChunkUnitRaw[]>();
  let emptyCounter = 0;
  for (const u of units) {
    const slug = fingerprintLabel(u.label);
    const fp = slug || `unit-${emptyCounter++}`;
    if (!groups.has(fp)) {
      groups.set(fp, []);
      order.push(fp);
    }
    groups.get(fp)!.push(u);
  }
  return order.map((fp) => {
    const group = groups.get(fp)!;
    const typeCounts = new Map<UnitType, number>();
    for (const g of group) typeCounts.set(g.type, (typeCounts.get(g.type) ?? 0) + 1);
    let bestType = group[0].type;
    let bestCount = 0;
    for (const [type, count] of typeCounts) {
      if (count > bestCount) {
        bestType = type;
        bestCount = count;
      }
    }
    const summary = group.reduce((a, b) => (b.summary.length > a.summary.length ? b : a)).summary;
    const body = group.reduce((a, b) => (b.body.length > a.body.length ? b : a)).body;
    const anchorByT = new Map<number, string>();
    for (const g of group) for (const a of g.anchors) if (!anchorByT.has(a.t)) anchorByT.set(a.t, a.quote);
    const anchors = [...anchorByT.entries()].sort((a, b) => a[0] - b[0]).map(([t, quote]) => ({ t, quote }));
    return {
      id: fp,
      type: bestType,
      label: group[0].label,
      summary,
      body,
      anchors,
      confidence: average(group.map((g) => g.confidence)),
    };
  });
}

/**
 * Resolves raw chunk edges' sourceLabel/targetLabel against the final
 * (post-merge) unit id set via the same fingerprint function, deduping by
 * (source, target, type) and averaging confidence — same "label-fingerprint
 * + averages confidence" rule as units. Edges whose source or target doesn't
 * resolve to a known unit (a model referencing a unit that got filtered, or
 * a cross-chunk reference that was never in scope — SPEC: "Only emit edges
 * between two units both present in this same segment") or that would
 * self-loop are dropped rather than surfaced as broken data.
 */
export function mergeEdgesByFingerprint(edges: readonly ChunkEdgeRaw[], units: readonly AnalysisUnit[]): AnalysisEdge[] {
  const knownIds = new Set(units.map((u) => u.id));
  const order: string[] = [];
  const groups = new Map<string, ChunkEdgeRaw[]>();
  for (const e of edges) {
    const source = fingerprintLabel(e.sourceLabel);
    const target = fingerprintLabel(e.targetLabel);
    if (!knownIds.has(source) || !knownIds.has(target) || source === target) continue;
    const key = `${source}::${target}::${e.type}`;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(e);
  }
  return order.map((key) => {
    const [source, target, type] = key.split("::") as [string, string, EdgeType];
    const group = groups.get(key)!;
    const quote = group.reduce((a, b) => (b.quote.length > a.quote.length ? b : a)).quote;
    return { source, target, type, quote, confidence: average(group.map((g) => g.confidence)) };
  });
}

/** SPEC B1: "pearls get unitId? linking them to a unit when applicable." Resolves a chunk pearl's unitLabel to a final unit id via the same fingerprint, or undefined if it's empty/unresolved. */
export function resolvePearlUnitId(unitLabel: string, knownUnitIds: ReadonlySet<string>): string | undefined {
  if (!unitLabel.trim()) return undefined;
  const fp = fingerprintLabel(unitLabel);
  return knownUnitIds.has(fp) ? fp : undefined;
}

/** Deterministic mirror of merged units into the legacy AnalysisConcept shape — see AnalysisSchema's doc comment for why v3 still populates `concepts`. */
export function unitsToConceptsMirror(units: readonly AnalysisUnit[]): AnalysisConcept[] {
  return units.map((u) => ({
    id: u.id,
    title: u.label,
    summary: u.summary,
    body: u.body,
    anchors: u.anchors.map((a) => ({ t: a.t })),
  }));
}

export interface AnalysisJobParamsV3 {
  segments: readonly TranscriptSegment[];
  model: string;
  client: AnalysisLLMClientV3;
  onProgress?: (pct: number) => void;
  /** Provenance to stamp on the resulting analysis.json (default "model" — see AnalysisSchema). */
  source?: AnalysisSource;
}

/**
 * V3-B B1: the typed-spine pipeline — one router call, then one typed
 * extraction call per chunk (same chunk count as v2's runAnalysisJob), then
 * a deterministic in-code merge for units/edges plus one LLM merge call for
 * pearls/themes. A router failure degrades to "generic" rather than aborting
 * the run (same "skip with warning, never abort" philosophy runAnalysisJob
 * already applies to individual chunks) — domain is a lens, not a
 * requirement, and the user can edit it afterward regardless.
 */
export async function runAnalysisJobV3(params: AnalysisJobParamsV3): Promise<Analysis> {
  const chunks = chunkTranscript(params.segments);
  if (chunks.length === 0) {
    throw new AnalysisRunError("Transcript has no content to analyze");
  }

  const sampleText = chunks
    .map((c) => c.text)
    .join("\n")
    .replace(/\[[^\]]*\]/g, "")
    .slice(0, 4000);
  const routerOutcome = await params.client.runRouter(sampleText, params.model);
  const domain: Domain = routerOutcome.kind === "ok" ? routerOutcome.data.domain : "generic";
  if (routerOutcome.kind !== "ok") {
    // eslint-disable-next-line no-console
    console.warn(`[analysis] router call skipped (${routerOutcome.reason} — ${routerOutcome.detail}); defaulting domain to "generic"`);
  }

  const collectedPearls: ChunkPearlV3[] = [];
  const collectedUnits: ChunkUnitRaw[] = [];
  const collectedEdges: ChunkEdgeRaw[] = [];
  let succeeded = 0;
  const skippedDetails: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    // eslint-disable-next-line no-await-in-loop -- chunks are analyzed sequentially by design (progress reporting, bounded concurrency to the API)
    const outcome = await params.client.runChunkV3(chunk, domain, params.model);
    if (outcome.kind === "ok") {
      succeeded++;
      collectedPearls.push(...outcome.data.pearls);
      collectedUnits.push(...outcome.data.units);
      collectedEdges.push(...outcome.data.edges);
    } else {
      const warning = `chunk ${i} (${formatTimestamp(chunk.startSec)}–${formatTimestamp(chunk.endSec)}) skipped: ${outcome.reason} — ${outcome.detail}`;
      skippedDetails.push(warning);
      // eslint-disable-next-line no-console
      console.warn(`[analysis] ${warning}`);
    }
    // +2 in the denominator: one slot already spent on the router call above, one reserved for the merge call below.
    params.onProgress?.(Math.round(((i + 1) / (chunks.length + 2)) * 100));
  }

  if (succeeded === 0) {
    throw new AnalysisRunError(
      `All ${chunks.length} transcript chunk(s) were skipped — no analysis could be produced. ${skippedDetails.join("; ")}`
    );
  }

  const mergedUnits = mergeUnitsByFingerprint(collectedUnits);
  const knownUnitIds = new Set(mergedUnits.map((u) => u.id));
  const mergedEdges = mergeEdgesByFingerprint(collectedEdges, mergedUnits);

  const merge = await params.client.runMergeV3(collectedPearls, params.model);
  if (merge.kind !== "ok") {
    throw new AnalysisRunError(`Merge pass failed (${merge.reason}): ${merge.detail}`);
  }
  params.onProgress?.(100);

  const finalPearls: Pearl[] = merge.data.pearls.map((p) => ({
    t: p.t,
    label: p.label,
    insight: p.insight,
    importance: p.importance,
    unitId: resolvePearlUnitId(p.unitLabel, knownUnitIds),
  }));

  return {
    generatedAt: new Date().toISOString(),
    model: params.model,
    version: 3,
    source: params.source ?? "model",
    domain,
    pearls: finalPearls,
    concepts: unitsToConceptsMirror(mergedUnits),
    themes: merge.data.themes,
    units: mergedUnits,
    edges: mergedEdges,
  };
}

/** Stable content hash (first 8 hex chars of sha256) — used for overlay filenames (see lib/shareBundle.ts). */
export function shortHash(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 8);
}
