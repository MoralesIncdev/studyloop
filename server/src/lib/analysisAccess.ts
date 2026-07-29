// V3-C thin accessor for analysis.json (SPEC: "Do NOT touch analysis
// internals/review scheduling (V3-B owns those). Reads analysis output only
// through existing loaders (tolerate both v2 and v3 shapes via a thin
// accessor)"). Deliberately does NOT import lib/analysis.ts's version-locked
// `AnalysisSchema` (version: z.literal(2)) — that schema is owned by V3-B and
// will grow a `version: 3` + typed-unit shape there. This module instead
// parses analysis.json (and, forward-compatibly, attestations.json) with a
// loose, passthrough zod schema that only asserts the handful of fields C1
// (continuity), C4 (overlay diff), and C5 (attention heatmap) actually read —
// every other field, known or not-yet-invented, is ignored rather than
// rejected. A v3 analysis.json that swaps `concepts` for typed `units` (per
// SPEC.md V3-B "B1. Analysis v3") still yields sensible titles/labels here
// without any change to this file once that lands.
import { z } from "zod";

const LooseAnchorSchema = z.object({ t: z.number() }).passthrough();

const LoosePearlSchema = z
  .object({ t: z.number(), label: z.string().optional(), importance: z.number().optional() })
  .passthrough();

/** Covers both v2's `concepts: [{id,title,...}]` and v3's likely `units: [{id,label,...}]`. */
const LooseUnitLikeSchema = z
  .object({
    id: z.string().optional(),
    title: z.string().optional(),
    label: z.string().optional(),
    anchors: z.array(LooseAnchorSchema).optional(),
  })
  .passthrough();

const LooseThemeSchema = z.object({ title: z.string() }).passthrough();

const LooseAnalysisSchema = z
  .object({
    version: z.number().optional(),
    pearls: z.array(LoosePearlSchema).optional(),
    concepts: z.array(LooseUnitLikeSchema).optional(),
    units: z.array(LooseUnitLikeSchema).optional(),
    themes: z.array(LooseThemeSchema).optional(),
  })
  .passthrough();

export type LooseAnalysis = z.infer<typeof LooseAnalysisSchema>;

export function parseLooseAnalysis(raw: unknown): LooseAnalysis | null {
  if (raw === null || raw === undefined) return null;
  const parsed = LooseAnalysisSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

interface UnitLikeEntry {
  id?: string;
  label: string;
}

/** Normalized {id?, label} for every concept/unit — id kept for the attestations cross-reference below. */
function unitLikeEntries(analysis: LooseAnalysis): UnitLikeEntry[] {
  const fromConcepts = (analysis.concepts ?? [])
    .map((c): UnitLikeEntry | null => {
      const label = c.title ?? c.label;
      return label ? { id: c.id, label } : null;
    })
    .filter((c): c is UnitLikeEntry => c !== null);
  const fromUnits = (analysis.units ?? [])
    .map((u): UnitLikeEntry | null => {
      const label = u.label ?? u.title;
      return label ? { id: u.id, label } : null;
    })
    .filter((u): u is UnitLikeEntry => u !== null);
  return [...fromConcepts, ...fromUnits];
}

/**
 * Top concept/unit/theme titles (SPEC C1: "Innertube searches for the
 * project's top concepts/themes (max 3 queries)"). Concepts/units come first
 * (the video's actual topics), themes fill any remaining slots.
 */
export function topConceptTitles(analysisRaw: unknown, max = 3): string[] {
  const analysis = parseLooseAnalysis(analysisRaw);
  if (!analysis) return [];
  const unitTitles = unitLikeEntries(analysis).map((u) => u.label);
  const themeTitles = (analysis.themes ?? []).map((t) => t.title);
  return [...unitTitles, ...themeTitles].slice(0, max);
}

export interface LooseAnalysisPearl {
  t: number;
  label: string;
  importance: number;
}

/** Normalized pearls (t/label/importance) — tolerant of a v3 `unitId?` field (or any other addition) alongside them. */
export function loosePearls(analysisRaw: unknown): LooseAnalysisPearl[] {
  const analysis = parseLooseAnalysis(analysisRaw);
  if (!analysis) return [];
  return (analysis.pearls ?? [])
    .filter((p): p is { t: number; label: string; importance: number } => typeof p.label === "string" && typeof p.importance === "number")
    .map((p) => ({ t: p.t, label: p.label, importance: p.importance }));
}

// --- V3-B forward-compat hook: gapFill from attestations.json ---------------

const LooseAttestationEntrySchema = z.object({ status: z.string().optional() }).passthrough();
const LooseAttestationsSchema = z.record(LooseAttestationEntrySchema);

/**
 * SPEC C1 gapFill: "0 for v1 unless analysis provides units the user marked
 * dismissed/unattested — read-only hook, degrade to 0 without analysis."
 * V3-B's attestations.json doesn't exist in this worktree yet, so this is
 * inert (returns []) until it lands — this function never writes
 * attestations.json, only reads it defensively (missing/corrupt file, or an
 * analysis.json with no unit-like entries at all, both degrade to []).
 *
 * A unit counts as a "gap" when it's either explicitly dismissed, or has no
 * attestation entry at all *and an attestations.json file exists* (i.e. the
 * learner has started reviewing this project's material but hasn't reached
 * this unit) — but only once real attestation data is present; an entirely
 * absent attestations.json is "V3-B hasn't landed / this project has no
 * Study Path yet", not "everything is a gap", so it still yields [].
 * Capped at 5 (kept small since these feed conceptSearch-style queries and
 * a local-library gapFill match, not a UI list).
 */
export function gapConceptsFromAttestations(analysisRaw: unknown, attestationsRaw: unknown, max = 5): string[] {
  if (attestationsRaw === null || attestationsRaw === undefined) return [];
  const analysis = parseLooseAnalysis(analysisRaw);
  if (!analysis) return [];
  const attestations = LooseAttestationsSchema.safeParse(attestationsRaw);
  if (!attestations.success) return [];

  const units = unitLikeEntries(analysis).filter((u): u is { id: string; label: string } => !!u.id);
  const gaps: string[] = [];
  for (const unit of units) {
    const entry = attestations.data[unit.id];
    const isGap = !entry || entry.status === "dismissed";
    if (isGap) gaps.push(unit.label);
    if (gaps.length >= max) break;
  }
  return gaps;
}
