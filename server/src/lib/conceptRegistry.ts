// V3-D D3 "Concept merge queue (cross-video identity)" (SPEC): after each
// analyze run, every extracted unit is fingerprinted and matched against a
// dataDir-wide canonical registry (`<dataDir>/conceptRegistry.json`) —
// exact fingerprint match auto-merges (alias + project ref); similarity
// >=0.85 (token Jaccard, no embeddings — SPEC is explicit about this, no ML
// model/embedding call here) queues a candidate for the learner to resolve;
// BOUNDARY-typed or threshold-flagged units never auto-merge even on an
// exact match (PEDAGOGY §2 "auto-inferred prerequisites are fallible...
// never locked" — the same carefulness extends to identity claims here).
//
// Pure/side-effect-free (no fs) — matches this codebase's "routes stay
// thin, lib/ holds the logic + tests" convention (see lib/review.ts,
// lib/attestation.ts). I/O lives in lib/conceptRegistryStore.ts;
// routes/registry.ts + routes/analyze.ts's post-analyze hook do the reading/
// writing and resolve live label/summary text for the UI.
import { z } from "zod";
import { fingerprintLabel, type AnalysisUnit } from "./analysis.js";
import { DomainSchema, type Domain } from "./models.js";

/** SPEC D3: "similarity >=0.85 (token Jaccard, no embeddings)". */
export const MERGE_SIMILARITY_THRESHOLD = 0.85;

export const RegistryProjectRefSchema = z.object({ projectId: z.string(), unitId: z.string() });
export type RegistryProjectRef = z.infer<typeof RegistryProjectRefSchema>;

/** SPEC D3's exact canonical-unit shape: `{id, label, aliases, domain, fingerprint, projectRefs:[{projectId, unitId}]}`. */
export const RegistryUnitSchema = z.object({
  id: z.string(),
  label: z.string(),
  aliases: z.array(z.string()),
  domain: DomainSchema,
  fingerprint: z.string(),
  projectRefs: z.array(RegistryProjectRefSchema),
});
export type RegistryUnit = z.infer<typeof RegistryUnitSchema>;

/**
 * A pending merge decision: a newly-seen unit (`incoming`) that fingerprint-
 * matched an existing canonical unit (`registryUnitId`) closely enough to
 * queue (exact-but-blocked, or Jaccard >= threshold) but not closely enough
 * (or safely enough) to auto-merge. Only `projectId`/`unitId` are persisted
 * for `incoming` — label/summary are resolved live from the owning
 * project's analysis.json at GET-time (routes/registry.ts), so a later edit
 * to that unit's text is always reflected instead of going stale in the
 * registry file.
 */
export const MergeCandidateSchema = z.object({
  id: z.string(),
  domain: DomainSchema,
  similarity: z.number().min(0).max(1),
  createdAt: z.string(),
  registryUnitId: z.string(),
  incoming: RegistryProjectRefSchema,
});
export type MergeCandidate = z.infer<typeof MergeCandidateSchema>;

export const ConceptRegistrySchema = z.object({
  version: z.literal(1),
  units: z.record(RegistryUnitSchema),
  candidates: z.array(MergeCandidateSchema),
});
export type ConceptRegistryFile = z.infer<typeof ConceptRegistrySchema>;

export function emptyConceptRegistry(): ConceptRegistryFile {
  return { version: 1, units: {}, candidates: [] };
}

// --- fingerprint + similarity (pure text ops, no embeddings) ---------------

function tokenize(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(Boolean));
}

/** First sentence (up to and including the first ./!/?, or the whole string if none) — SPEC D3: "lowercased lemma-ish label + first summary sentence + domain". */
export function firstSentence(text: string): string {
  const match = text.match(/^[^.!?]*[.!?]?/);
  return (match?.[0] ?? text).trim();
}

/** SPEC D3's fingerprint: lowercased lemma-ish label + first summary sentence + domain, joined so two units only fingerprint-match when all three agree. */
export function unitFingerprint(label: string, summary: string, domain: Domain): string {
  return [fingerprintLabel(label), fingerprintLabel(firstSentence(summary)), domain].join("::");
}

/** Token Jaccard similarity — |intersection| / |union|, 1 for two empty sets (both "nothing to compare" — treated as identical rather than divide-by-zero). */
export function jaccardSimilarity(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Tokens for an existing registry unit — label + every alias accumulated so far, so the comparison gets richer (not staler) as more units merge into it. */
function registryUnitTokens(unit: RegistryUnit): Set<string> {
  return tokenize([unit.label, ...unit.aliases].join(" "));
}

// --- evaluating one incoming unit against the registry ----------------------

export interface EvaluateUnitParams {
  projectId: string;
  domain: Domain;
  unit: AnalysisUnit;
  nowIso: string;
  newId: () => string;
  /**
   * Phase 5 "Lens registry + clinical as first data-driven lens" (safety
   * tier, item 5): unit types the ACTIVE LENS flags as safety-critical
   * (server/lenses/clinical.json's `safetyTier`, e.g. DOSAGE/
   * CONTRAINDICATION/LAB_VALUE) — extends the pre-existing "BOUNDARY or
   * threshold never auto-merges" rule to cover these too. A lens only ever
   * REFERENCES this set (its `safetyTier` field); the never-auto-merge
   * behavior itself stays a code path here, not lens-authored data. Absent
   * (or empty) preserves the exact pre-Phase-5 behavior.
   */
  safetyUnitTypes?: ReadonlySet<string>;
}

export type EvaluateUnitOutcome = "auto-merged" | "candidate" | "registered" | "already-known";

export interface EvaluateUnitResult {
  registry: ConceptRegistryFile;
  outcome: EvaluateUnitOutcome;
}

function isAlreadyKnown(registry: ConceptRegistryFile, projectId: string, unitId: string): boolean {
  for (const r of Object.values(registry.units)) {
    if (r.projectRefs.some((ref) => ref.projectId === projectId && ref.unitId === unitId)) return true;
  }
  return registry.candidates.some((c) => c.incoming.projectId === projectId && c.incoming.unitId === unitId);
}

/**
 * Evaluates ONE newly-extracted unit against the current registry state and
 * returns the updated registry (new object; input is never mutated) plus
 * what happened. Idempotent: re-processing the same (projectId, unitId) pair
 * (e.g. a re-analyze) is a no-op once it's already registered/candidated.
 */
export function evaluateNewUnit(registry: ConceptRegistryFile, params: EvaluateUnitParams): EvaluateUnitResult {
  const { projectId, domain, unit, nowIso, newId, safetyUnitTypes } = params;

  if (isAlreadyKnown(registry, projectId, unit.id)) {
    return { registry, outcome: "already-known" };
  }

  const fp = unitFingerprint(unit.label, unit.summary, domain);
  const incomingTokens = tokenize(`${unit.label} ${firstSentence(unit.summary)}`);
  // SPEC D3: "never auto-merge BOUNDARY or threshold units" — even on an
  // exact fingerprint match. Phase 5 "Safety tier" extends this to whichever
  // unit types the active lens flags as safety-critical.
  const autoMergeBlocked = unit.type === "BOUNDARY" || unit.threshold === true || Boolean(safetyUnitTypes?.has(unit.type));

  let best: { registryUnit: RegistryUnit; similarity: number; exact: boolean } | null = null;
  for (const candidate of Object.values(registry.units)) {
    if (candidate.domain !== domain) continue;
    const exact = candidate.fingerprint === fp;
    const similarity = exact ? 1 : jaccardSimilarity(incomingTokens, registryUnitTokens(candidate));
    if (!exact && similarity < MERGE_SIMILARITY_THRESHOLD) continue;
    if (!best || similarity > best.similarity || (similarity === best.similarity && exact && !best.exact)) {
      best = { registryUnit: candidate, similarity, exact };
    }
  }

  if (best && best.exact && !autoMergeBlocked) {
    const target = best.registryUnit;
    const aliases = target.aliases.includes(unit.label) || target.label === unit.label ? target.aliases : [...target.aliases, unit.label];
    const nextUnit: RegistryUnit = { ...target, aliases, projectRefs: [...target.projectRefs, { projectId, unitId: unit.id }] };
    return { registry: { ...registry, units: { ...registry.units, [target.id]: nextUnit } }, outcome: "auto-merged" };
  }

  if (best) {
    const candidate: MergeCandidate = {
      id: newId(),
      domain,
      similarity: best.similarity,
      createdAt: nowIso,
      registryUnitId: best.registryUnit.id,
      incoming: { projectId, unitId: unit.id },
    };
    return { registry: { ...registry, candidates: [...registry.candidates, candidate] }, outcome: "candidate" };
  }

  const newUnit: RegistryUnit = {
    id: newId(),
    label: unit.label,
    aliases: [],
    domain,
    fingerprint: fp,
    projectRefs: [{ projectId, unitId: unit.id }],
  };
  return { registry: { ...registry, units: { ...registry.units, [newUnit.id]: newUnit } }, outcome: "registered" };
}

/** Folds evaluateNewUnit over every unit from one analyze run, in order — later units in the SAME run can match units registered earlier in it, so within-run duplicates (not just cross-video ones) get caught too. */
export function updateRegistryForProject(
  registry: ConceptRegistryFile,
  projectId: string,
  domain: Domain,
  units: readonly AnalysisUnit[],
  nowIso: string,
  newId: () => string,
  /** Phase 5 "Safety tier" — see EvaluateUnitParams.safetyUnitTypes. */
  safetyUnitTypes?: ReadonlySet<string>
): ConceptRegistryFile {
  let next = registry;
  for (const unit of units) {
    next = evaluateNewUnit(next, { projectId, domain, unit, nowIso, newId, safetyUnitTypes }).registry;
  }
  return next;
}

// --- resolving a pending candidate -------------------------------------------

export type MergeResolveAction = "merge" | "link" | "ignore";

export interface ResolvedIncoming {
  label: string;
  summary: string;
}

/**
 * Applies a learner's merge-queue decision (SPEC D3: "action: merge|link|
 * ignore"). `incoming` is the live-resolved {label, summary} for the
 * candidate's `incoming` unit — this function stays pure (no fs), so the
 * caller (routes/registry.ts) resolves it from disk first.
 *
 * - merge: folds the incoming unit into the target — its label becomes an
 *   alias (if new) and its project ref joins the target's projectRefs.
 *   ("also in ⟨project⟩" chips render off projectRefs, so this is exactly
 *   what auto-merge does too.)
 * - link: joins projectRefs WITHOUT aliasing the label — the two concepts
 *   stay visibly distinct but the "also in ⟨project⟩" chip still connects
 *   them (SPEC's UI copy only shows Merge/Keep-separate; `link` exists as a
 *   distinct backend action for a future UI, per SPEC's three-action route
 *   contract).
 * - ignore ("Keep separate"): the incoming unit is registered as its OWN
 *   new canonical entry instead, so it stops re-surfacing as a candidate
 *   against the same target on the next analyze run.
 *
 * Returns null only when the candidate id doesn't exist (already resolved,
 * or never existed) — the caller 404s in that case.
 */
export function resolveMergeCandidate(
  registry: ConceptRegistryFile,
  candidateId: string,
  action: MergeResolveAction,
  incoming: ResolvedIncoming,
  newId: () => string
): ConceptRegistryFile | null {
  const candidate = registry.candidates.find((c) => c.id === candidateId);
  if (!candidate) return null;
  const candidates = registry.candidates.filter((c) => c.id !== candidateId);
  const target = registry.units[candidate.registryUnitId];

  if (!target) {
    // Target vanished (shouldn't normally happen — units are never deleted
    // from the registry) — nothing sensible to merge/link into; just drop
    // the stale candidate.
    return { ...registry, candidates };
  }

  if (action === "merge") {
    const aliases =
      target.aliases.includes(incoming.label) || target.label === incoming.label ? target.aliases : [...target.aliases, incoming.label];
    const nextUnit: RegistryUnit = { ...target, aliases, projectRefs: [...target.projectRefs, candidate.incoming] };
    return { ...registry, candidates, units: { ...registry.units, [target.id]: nextUnit } };
  }

  if (action === "link") {
    const nextUnit: RegistryUnit = { ...target, projectRefs: [...target.projectRefs, candidate.incoming] };
    return { ...registry, candidates, units: { ...registry.units, [target.id]: nextUnit } };
  }

  // ignore -> "Keep separate": register the incoming unit as its own canonical entry.
  const newUnit: RegistryUnit = {
    id: newId(),
    label: incoming.label,
    aliases: [],
    domain: candidate.domain,
    fingerprint: unitFingerprint(incoming.label, incoming.summary, candidate.domain),
    projectRefs: [candidate.incoming],
  };
  return { ...registry, candidates, units: { ...registry.units, [newUnit.id]: newUnit } };
}
