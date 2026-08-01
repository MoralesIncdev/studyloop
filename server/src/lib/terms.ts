// Phase 2 "Terminology layer v1" (design/EXECUTION-PLAN-post-review-v1.md):
// the unanimous #1 blocker from four external reviews — ASR-mangled terms
// (drug names, lab tests, routes) poison extraction/search/merge downstream.
// This module is the whole rewrite pass: a pure, idempotent `applyTerms`
// plus the per-project terms.json load/save helpers (store.ts conventions),
// the domain-glossary merge (lib/glossary/nursing.json), and the diff log
// that records which corrections actually fired (termCorrections.json,
// alongside project.json — same "sidecar file in the project dir" shape as
// bubbles.json/attestations.json).
//
// The raw transcript file on disk is NEVER mutated by any function here —
// every rewrite happens at read time, against segments already loaded from
// disk by lib/transcripts.ts. See routes/transcript.ts and routes/analyze.ts
// for the two call sites that apply this before segments reach the web app
// and the analysis pipeline, respectively.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { TermsFileSchema, type TermsFile } from "./models.js";
import { analysisJsonPath, readJsonIfExists, termCorrectionsJsonPath, termsJsonPath, writeJsonAtomic } from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Pure rewrite pass -------------------------------------------------------

/** A flat `{garbledText: correctText}` map — the shape `applyTerms` actually operates on (TermsFile's metadata is irrelevant to the rewrite itself; see `flattenTermsFile`). */
export type FlatTermsMap = Record<string, string>;

export interface TermHit {
  /** The garbled key (terms.json's own casing) that matched at least once. */
  garbled: string;
  correct: string;
  count: number;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Reapplies the matched text's casing pattern to the replacement, "where
 * sensible" (SPEC): an ALL-CAPS match gets an ALL-CAPS replacement; a match
 * that merely starts with a capital letter (a sentence-initial word, a
 * garbled multi-word phrase where every word got capitalized, ...) gets its
 * replacement's first letter capitalized; anything else (lowercase,
 * mid-sentence) gets the replacement exactly as authored in terms.json.
 * Deliberately simple — this is a transcript-readability nicety, not a full
 * casing-inference engine.
 */
function applyCasingPattern(matched: string, replacement: string): string {
  const hasLetters = /[a-z]/i.test(matched);
  if (hasLetters && matched === matched.toUpperCase() && matched !== matched.toLowerCase()) {
    return replacement.toUpperCase();
  }
  if (/^[A-Z]/.test(matched)) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

/**
 * Case-insensitive, word-boundary, longest-match-first rewrite of `text`
 * against `termsMap`. A single left-to-right pass: every key is tried at
 * every position via one alternation regex (keys sorted longest-first, so a
 * shorter key can never pre-empt a longer one that also matches at the same
 * spot — e.g. "metro" never wins over "metro pro law"), and replaced spans
 * don't overlap, so this never re-scans its own output — idempotent as long
 * as no `correct` value is itself one of the map's garbled keys (a
 * degenerate config this function doesn't need to defend against).
 */
export function applyTerms(text: string, termsMap: FlatTermsMap): { text: string; hits: TermHit[] } {
  const keys = Object.keys(termsMap).filter((k) => k.trim().length > 0);
  if (keys.length === 0 || !text) return { text, hits: [] };

  const sortedKeys = [...keys].sort((a, b) => b.length - a.length);
  const lookup = new Map(sortedKeys.map((k) => [k.toLowerCase(), { correct: termsMap[k], original: k }]));
  const pattern = new RegExp(`\\b(?:${sortedKeys.map(escapeRegExp).join("|")})\\b`, "gi");

  const hitCounts = new Map<string, TermHit>();
  const rewritten = text.replace(pattern, (matched) => {
    const found = lookup.get(matched.toLowerCase());
    if (!found) return matched;
    const existing = hitCounts.get(found.original);
    hitCounts.set(found.original, {
      garbled: found.original,
      correct: found.correct,
      count: (existing?.count ?? 0) + 1,
    });
    return applyCasingPattern(matched, found.correct);
  });

  return { text: rewritten, hits: [...hitCounts.values()] };
}

export interface TranscriptSegmentLike {
  start: number;
  end: number;
  text: string;
}

/** Same rewrite, applied per-segment across a transcript, with hits aggregated (counts summed) across every segment. */
export function applyTermsToSegments<T extends TranscriptSegmentLike>(
  segments: readonly T[],
  termsMap: FlatTermsMap
): { segments: T[]; hits: TermHit[] } {
  if (Object.keys(termsMap).length === 0) return { segments: [...segments], hits: [] };

  const aggregated = new Map<string, TermHit>();
  const nextSegments = segments.map((segment) => {
    const { text, hits } = applyTerms(segment.text, termsMap);
    for (const hit of hits) {
      const existing = aggregated.get(hit.garbled);
      aggregated.set(hit.garbled, { garbled: hit.garbled, correct: hit.correct, count: (existing?.count ?? 0) + hit.count });
    }
    return text === segment.text ? segment : { ...segment, text };
  });

  return { segments: nextSegments, hits: [...aggregated.values()] };
}

/** Drops per-entry metadata (source/createdAt) — the rewrite pass only needs garbled->correct. */
export function flattenTermsFile(file: TermsFile): FlatTermsMap {
  const out: FlatTermsMap = {};
  for (const [garbled, entry] of Object.entries(file)) out[garbled] = entry.correct;
  return out;
}

// --- terms.json load/save (store.ts conventions: readJsonIfExists / writeJsonAtomic, degrade-on-corruption) ---

/** A missing file or a shape that fails schema validation both degrade to `{}` — same "corruption never throws" rule attestationStore.ts/reviewStore.ts apply to their own per-project JSON files. */
export async function readTerms(dataDir: string, id: string): Promise<TermsFile> {
  const raw = await readJsonIfExists<unknown>(termsJsonPath(dataDir, id));
  if (raw === null) return {};
  const parsed = TermsFileSchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
}

export async function writeTerms(dataDir: string, id: string, terms: TermsFile): Promise<void> {
  TermsFileSchema.parse(terms);
  await writeJsonAtomic(termsJsonPath(dataDir, id), terms);
}

// --- Seed glossary (Phase 2 item 5): defaults merged in for domain "clinical" projects ---
// "clinical" doesn't exist in models.ts's DomainSchema yet — it ships in
// Phase 5. `domain` is deliberately typed as `string | undefined` (not
// `Domain | undefined`) here so this activates the moment Phase 5 adds the
// literal, with no change needed in this file — comparing against the
// current DomainSchema union would make `domain === "clinical"` a TypeScript
// error today (no overlap between the two literal types).
const CLINICAL_DOMAIN = "clinical";

export function isClinicalDomain(domain: string | undefined | null): boolean {
  return domain === CLINICAL_DOMAIN;
}

const GlossaryEntrySchema = z.object({
  correct: z.string().min(1),
  variants: z.array(z.string().min(1)),
});
const GlossaryFileSchema = z.array(GlossaryEntrySchema);

/** Seed data has no real authorship timestamp — a fixed constant, not "now", so re-loading the glossary is deterministic and doesn't make every clinical project's effective terms map look freshly created on every read. */
const GLOSSARY_SEED_CREATED_AT = "2026-01-01T00:00:00.000Z";

let cachedNursingGlossary: TermsFile | null = null;

/** Flattens `lib/glossary/nursing.json` (`[{correct, variants: [...]}]`) into a `TermsFile` (`source: "glossary"`), memoized — it's static seed data, read from disk at most once per process. */
export function loadNursingGlossary(): TermsFile {
  if (cachedNursingGlossary) return cachedNursingGlossary;
  const glossaryPath = path.join(__dirname, "glossary", "nursing.json");
  const raw = JSON.parse(fs.readFileSync(glossaryPath, "utf8"));
  const parsed = GlossaryFileSchema.parse(raw);
  const out: TermsFile = {};
  for (const { correct, variants } of parsed) {
    for (const variant of variants) {
      // A variant that collides with an earlier entry's variant is a data
      // bug in the seed file, not a runtime concern — first entry wins
      // rather than silently overwriting, so a bad duplicate doesn't wipe
      // out an already-loaded (and presumably more specific) mapping.
      if (out[variant]) continue;
      out[variant] = { correct, source: "glossary", createdAt: GLOSSARY_SEED_CREATED_AT };
    }
  }
  cachedNursingGlossary = out;
  return out;
}

/** Test-only hook to reset the memoized glossary between fixture runs (mirrors lib/innertube.ts's `__setAnalysisClientForTests`-style escape hatches). */
export function __resetNursingGlossaryCacheForTests(): void {
  cachedNursingGlossary = null;
}

/**
 * Merges glossary defaults *under* the project's own terms.json — a user
 * entry for a given garbled key always wins over a glossary entry for the
 * same key (SPEC: "user overrides glossary"). Inert (returns `userTerms`
 * unchanged) unless `domain` is `"clinical"` — see `isClinicalDomain` above.
 */
export function mergeGlossaryDefaults(userTerms: TermsFile, domain: string | undefined | null): TermsFile {
  if (!isClinicalDomain(domain)) return userTerms;
  return { ...loadNursingGlossary(), ...userTerms };
}

/** The project's terms.json merged with glossary defaults (if applicable) — this is what the rewrite pass should actually apply. */
export async function loadEffectiveTerms(dataDir: string, id: string, domain: string | undefined | null): Promise<TermsFile> {
  const userTerms = await readTerms(dataDir, id);
  return mergeGlossaryDefaults(userTerms, domain);
}

// --- Diff log (Phase 2 item: "record a diff log ... into the project") -----

export const TermCorrectionLogEntrySchema = z.object({
  at: z.string(),
  hits: z.array(z.object({ garbled: z.string(), correct: z.string(), count: z.number().int().nonnegative() })),
});
export type TermCorrectionLogEntry = z.infer<typeof TermCorrectionLogEntrySchema>;

export const TermCorrectionsFileSchema = z.array(TermCorrectionLogEntrySchema);
export type TermCorrectionsFile = z.infer<typeof TermCorrectionsFileSchema>;

/** Bounded the same way pearlReviewStore-style append-only logs are — the diff log answers "what changed lately," not "what changed ever." */
const MAX_LOG_ENTRIES = 50;

export async function readTermCorrections(dataDir: string, id: string): Promise<TermCorrectionsFile> {
  const raw = await readJsonIfExists<unknown>(termCorrectionsJsonPath(dataDir, id));
  if (raw === null) return [];
  const parsed = TermCorrectionsFileSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

/** Appends one log entry (skipped entirely when `hits` is empty — a read that corrected nothing isn't worth a disk write), capped to the most recent `MAX_LOG_ENTRIES`. */
export async function recordTermCorrections(dataDir: string, id: string, hits: readonly TermHit[]): Promise<void> {
  if (hits.length === 0) return;
  const existing = await readTermCorrections(dataDir, id);
  const entry: TermCorrectionLogEntry = { at: new Date().toISOString(), hits: [...hits] };
  const next = [...existing, entry].slice(-MAX_LOG_ENTRIES);
  await writeJsonAtomic(termCorrectionsJsonPath(dataDir, id), next);
}

// --- Downstream invalidation (Phase 2 item 5) -------------------------------

/**
 * Marks this project's existing analysis.json stale after a term mapping
 * changed — the smallest honest invalidation mechanism: it never triggers a
 * re-run, only sets a flag (see analysis.ts's AnalysisSchema `staleReason`)
 * for the web app to surface as a "re-analyze" banner later. A raw
 * read-merge-write (not routed through the heavier AnalysisSchema in
 * lib/analysis.ts) — same "don't import the Anthropic-SDK-carrying module
 * just to touch one field" reasoning routes/attestation.ts already applies
 * via analysisAccess.ts's loose accessor. Returns `false` (nothing written)
 * when there's no analysis.json yet — no analysis exists to go stale.
 */
export async function markAnalysisStale(dataDir: string, id: string): Promise<boolean> {
  const path = analysisJsonPath(dataDir, id);
  const raw = await readJsonIfExists<Record<string, unknown>>(path);
  if (raw === null) return false;
  await writeJsonAtomic(path, { ...raw, staleReason: "terms-changed" });
  return true;
}

/**
 * The one-call convenience wrapper both read sites (routes/transcript.ts,
 * routes/analyze.ts) use: load this project's effective terms map, rewrite
 * `segments` against it, and best-effort log the diff. Never mutates the
 * transcript file itself — `segments` in is always freshly loaded from disk,
 * segments out is a new array (or the same segments, referentially, when
 * nothing matched).
 */
export async function correctTranscriptSegments<T extends TranscriptSegmentLike>(
  dataDir: string,
  id: string,
  segments: readonly T[],
  domain: string | undefined | null
): Promise<T[]> {
  const effectiveTerms = await loadEffectiveTerms(dataDir, id, domain);
  const flat = flattenTermsFile(effectiveTerms);
  if (Object.keys(flat).length === 0) return [...segments];
  const { segments: corrected, hits } = applyTermsToSegments(segments, flat);
  await recordTermCorrections(dataDir, id, hits);
  return corrected;
}
