// Phase 5 "Lens registry + clinical as first data-driven lens"
// (design/EXECUTION-PLAN-post-review-v1.md, AMENDED — supersedes the
// original hardcoded-clinical spec): loads subject-matter lenses from data
// files instead of a hardcoded DOMAIN_MODULES record. Two sources, merged
// with user winning on id collision:
//   - repo-shipped: server/lenses/*.json (ships with the app — biology,
//     history, music, physical_skill, generic, clinical)
//   - user-authored: <dataDir>/lenses/*.json (Phase 9 "lens autogeneration"
//     will also write here; hand-editable/deletable today)
//
// Loaded synchronously (readFileSync, like lib/terms.ts's loadNursingGlossary
// does for its seed glossary) and memoized per dataDir — SPEC: "loaded at
// startup (module-level cached loader is fine; hot reload not required)".
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { LensOverlayFieldSchema, LensSchema, type Lens, type LensOverlayField } from "./models.js";
import { createStructuredCaller, type ProviderAuth, type StructuredLLMCaller } from "./providers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * server/lenses/ — a sibling of both src/ and dist/, not inside either, so
 * this same relative walk (`lib/` -> package root -> `lenses/`) resolves
 * correctly whether this module is running as source (tsx, dev) or as
 * compiled dist/lib/lenses.js (build) without needing a copy-to-dist build
 * step (contrast lib/glossary/nursing.json, which DOES need copying because
 * it lives inside src/).
 */
const REPO_LENSES_DIR = path.join(__dirname, "..", "..", "lenses");

export const DEFAULT_LENS_ID = "generic";

/** Defensive last-resort fallback if the repo's own generic.json is ever missing/corrupt — keeps the analyze pipeline degrading gracefully instead of throwing on a lens lookup miss. */
const GENERIC_FALLBACK_LENS: Lens = {
  id: DEFAULT_LENS_ID,
  label: "Generic",
  routerDescription: "anything else, mixed subject matter, or unclear from the sample",
  unitTypeEmphasis:
    "No specific domain lens applies — keep unit-type emphasis balanced across CLAIM/MECHANISM/PROCEDURE/EXAMPLE/BOUNDARY rather than favoring one. Leave every overlay field empty; this lens doesn't use them.",
  overlayFields: [],
  questionStyle: "default",
};

export interface LensRegistry {
  /** Every loaded lens (repo + user overrides), sorted by id — deterministic order for prompt assembly (router prompt text, structured-output enum). */
  list: Lens[];
  byId: Map<string, Lens>;
}

function readLensFile(filePath: string): Lens | null {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[lenses] failed to read/parse ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
  const parsed = LensSchema.safeParse(raw);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.warn(`[lenses] ${filePath} failed LensSchema validation: ${parsed.error.message}`);
    return null;
  }
  const idFromFilename = path.basename(filePath, ".json");
  if (parsed.data.id !== idFromFilename) {
    // Same invariant Obsidian-style vault notes use (id === filename) —
    // cheap to enforce here and keeps "which file defines lens X" unambiguous.
    // eslint-disable-next-line no-console
    console.warn(`[lenses] ${filePath}: id "${parsed.data.id}" does not match its filename "${idFromFilename}" — skipping`);
    return null;
  }
  return parsed.data;
}

function readLensDir(dir: string): Lens[] {
  let entries: string[];
  try {
    entries = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return []; // missing dir is normal — no user lenses yet, or a repo checkout without server/lenses (shouldn't happen, but degrade rather than throw)
  }
  const lenses: Lens[] = [];
  for (const entry of entries) {
    const lens = readLensFile(path.join(dir, entry));
    if (lens) lenses.push(lens);
  }
  return lenses;
}

function mergeLenses(repoLenses: readonly Lens[], userLenses: readonly Lens[]): LensRegistry {
  const byId = new Map<string, Lens>();
  for (const l of repoLenses) byId.set(l.id, l);
  // SPEC: "merged with a user dir ... user wins on id collision".
  for (const l of userLenses) byId.set(l.id, l);
  const list = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  return { list, byId };
}

const registryCache = new Map<string, LensRegistry>();

/** Loads (and memoizes, per dataDir) the merged lens registry — repo lenses first, user lenses layered on top. */
export function loadLensRegistry(dataDir: string): LensRegistry {
  const cached = registryCache.get(dataDir);
  if (cached) return cached;
  const repoLenses = readLensDir(REPO_LENSES_DIR);
  const userLenses = readLensDir(path.join(dataDir, "lenses"));
  const registry = mergeLenses(repoLenses, userLenses);
  registryCache.set(dataDir, registry);
  return registry;
}

/** Test-only: forces the next `loadLensRegistry` call (for any dataDir) to re-read from disk — mirrors lib/terms.ts's `__resetNursingGlossaryCacheForTests`. */
export function __resetLensRegistryCacheForTests(): void {
  registryCache.clear();
}

/**
 * Phase 9 "Lens autogeneration": targeted invalidation for ONE dataDir —
 * `generateAndPersistLens` calls this right after writing a new lens file so
 * the SAME analyze run's later `getLens`/`resolveLensOrGeneric` calls (the
 * per-chunk system prompt) see it immediately, without dropping every other
 * dataDir's cached registry the way `__resetLensRegistryCacheForTests` does
 * (that one stays test-only; this one is a real runtime call site).
 */
export function invalidateLensRegistryCache(dataDir: string): void {
  registryCache.delete(dataDir);
}

export function listLenses(dataDir: string): Lens[] {
  return loadLensRegistry(dataDir).list;
}

export function getLens(dataDir: string, id: string): Lens | undefined {
  return loadLensRegistry(dataDir).byId.get(id);
}

/** Boundary check (SPEC: "validated against the loaded registry at the boundaries ... NOT a z.enum") — routes/analyze.ts's router output and routes/projects.ts's PATCH `domain` both use this. */
export function isKnownLensId(dataDir: string, id: string): boolean {
  return loadLensRegistry(dataDir).byId.has(id);
}

/** Resolves a domain string to its lens, falling back to the registry's "generic" lens, then to a hardcoded last-resort if even that's missing (see GENERIC_FALLBACK_LENS above). Never throws — a lens lookup miss degrades the prompt, it never blocks the analyze run. */
export function resolveLensOrGeneric(dataDir: string, domain: string): Lens {
  const registry = loadLensRegistry(dataDir);
  return registry.byId.get(domain) ?? registry.byId.get(DEFAULT_LENS_ID) ?? GENERIC_FALLBACK_LENS;
}

/** Same fallback reasoning as `resolveLensOrGeneric`, for callers that need the whole list (e.g. building the router prompt) rather than one lookup. */
export function listLensesOrFallback(dataDir: string): Lens[] {
  const list = listLenses(dataDir);
  return list.length > 0 ? list : [GENERIC_FALLBACK_LENS];
}

// --- Phase 9 "Lens autogeneration for unknown subjects" ---------------------
// (design/EXECUTION-PLAN-post-review-v1.md): when the analyze router decides
// none of the loaded lenses plausibly fit a video's subject matter, ONE
// follow-up LLM call (the "meta-schema" call below) generates a new lens on
// the fly, persists it to <dataDir>/lenses/<id>.json, and the SAME analyze
// run uses it immediately (see analysis.ts's runAnalysisJobV3). Guardrail-
// heavy by design (SPEC: "all code-enforced, all tested"): a generated lens
// can never set safetyTier, can never overwrite an existing lens file, and
// any failure anywhere in this path (LLM refusal/parse error, schema
// validation, disk IO) degrades to "generic" rather than failing the run.

/**
 * Dispatch keys cardTransform.ts's questionStyle switch actually implements
 * (see buildCardTransformSystemPrompt there) — a generated lens MUST pick one
 * of these; it has no way to invent a new code path. "nclex" stays in the
 * enum (nothing stops a generated lens from genuinely being NCLEX-shaped),
 * but the generation prompt steers the model toward "default" unless the
 * subject is truly clinical/nursing material.
 */
export const IMPLEMENTED_QUESTION_STYLES = ["default", "nclex"] as const;
export type ImplementedQuestionStyle = (typeof IMPLEMENTED_QUESTION_STYLES)[number];

/**
 * The universal unit-type spine (lib/analysis.ts's UnitTypeSchema values),
 * duplicated here as a plain string list rather than imported — analysis.ts
 * imports FROM this module (listLensesOrFallback/resolveLensOrGeneric/
 * getLens), so an import the other way would be a circular dependency. Used
 * only to phrase the generation prompt; the model can't emit a unit type
 * outside this set regardless (analysis.ts's CHUNK_V3_JSON_SCHEMA enum is
 * the real enforcement point).
 */
const SPINE_UNIT_TYPES = [
  "CLAIM",
  "MECHANISM",
  "PROCEDURE",
  "EXAMPLE",
  "BOUNDARY",
  "CLUSTER",
  "DOSAGE",
  "CONTRAINDICATION",
  "LAB_VALUE",
  "PRIORITIZATION",
] as const;

/** SPEC: "overlayFields (≤6, subject-appropriate)". */
const MAX_GENERATED_OVERLAY_FIELDS = 6;

/** One entry of a generated lens's optional starter glossary — same on-disk shape as lib/glossary/nursing.json's seed data (see lib/terms.ts's `loadNursingGlossary`). */
const LensGlossaryEntrySchema = z.object({
  correct: z.string().min(1),
  variants: z.array(z.string().min(1)),
});
export type LensGlossaryEntry = z.infer<typeof LensGlossaryEntrySchema>;

/**
 * The raw shape the meta-schema LLM call must return. Deliberately does NOT
 * include `id` (derived deterministically from the router's subject label —
 * see `deriveGeneratedLensId` — rather than trusting the model to also
 * invent a collision-safe kebab-case id) and does NOT include `safetyTier`
 * AT ALL (the strongest guardrail available: there's no slot in this schema
 * for the model to put it in, so `generateAndPersistLens` below never has a
 * `safetyTier` value to accidentally copy through — even for a provider
 * whose JSON-mode schema is merely prompt-embedded/advisory rather than
 * natively enforced).
 */
const LensMetaDraftSchema = z.object({
  label: z.string().min(1),
  routerDescription: z.string().min(1),
  unitTypeEmphasis: z.string().min(1),
  overlayFields: z.array(LensOverlayFieldSchema).max(MAX_GENERATED_OVERLAY_FIELDS),
  questionStyle: z.enum(IMPLEMENTED_QUESTION_STYLES),
  glossary: z.array(LensGlossaryEntrySchema),
});
export type LensMetaDraft = z.infer<typeof LensMetaDraftSchema>;

/**
 * Wire JSON schema for the meta-schema call — same "structured outputs want
 * every property present" convention analysis.ts uses throughout: `hint` is
 * always present (empty string sentinel for "no hint", cleaned up post-parse
 * below) and `overlayFields`/`glossary` are always arrays (possibly empty).
 */
const LENS_META_JSON_SCHEMA = {
  type: "object",
  properties: {
    label: { type: "string" },
    routerDescription: { type: "string" },
    unitTypeEmphasis: { type: "string" },
    overlayFields: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          label: { type: "string" },
          hint: { type: "string" },
        },
        required: ["key", "label", "hint"],
        additionalProperties: false,
      },
    },
    questionStyle: { type: "string", enum: [...IMPLEMENTED_QUESTION_STYLES] },
    glossary: {
      type: "array",
      items: {
        type: "object",
        properties: {
          correct: { type: "string" },
          variants: { type: "array", items: { type: "string" } },
        },
        required: ["correct", "variants"],
        additionalProperties: false,
      },
    },
  },
  required: ["label", "routerDescription", "unitTypeEmphasis", "overlayFields", "questionStyle", "glossary"],
  additionalProperties: false,
} as const;

function buildLensMetaSystemPrompt(): string {
  return `You are defining a new subject-matter "lens" for an instructional-video study app, because this video's subject didn't plausibly fit any of the app's existing lenses. A lens is a small prompt module that shapes how the app's extraction pipeline reads a transcript for this one subject.

Produce:
- "label": a short human-readable name for this subject (e.g. "Organic Chemistry", "Woodworking").
- "routerDescription": a short clause (a few words) describing what kind of content this subject covers — used inside a future router prompt as: "your-id" (that clause).
- "unitTypeEmphasis": one paragraph of guidance on which of the app's FIXED unit types to favor for this subject: ${SPINE_UNIT_TYPES.join(", ")} (you cannot invent a new one). Most subjects should favor CLAIM/MECHANISM/PROCEDURE/EXAMPLE/BOUNDARY/CLUSTER; only mention DOSAGE/CONTRAINDICATION/LAB_VALUE/PRIORITIZATION if this subject is genuinely safety-critical/clinical in nature (most subjects are not). Also say which of this lens's own "overlayFields" below to fill in.
- "overlayFields": up to ${MAX_GENERATED_OVERLAY_FIELDS} small structured fields specific to this subject (e.g. for cooking: "ingredient", "technique"; for law: "jurisdiction", "citation") — each has a short "key" (camelCase, used as a JSON field name), a human "label", and a "hint" (empty string if none needed).
- "questionStyle": MUST be exactly one of: ${IMPLEMENTED_QUESTION_STYLES.join(", ")} — these are the ONLY question-generation code paths this app implements; you cannot invent a new one. Choose "nclex" only if this subject is genuinely NCLEX-style clinical/nursing material; choose "default" for everything else.
- "glossary": OPTIONAL — up to about 30 subject-specific terms likely to be mangled by automatic speech recognition, each with the correct spelling ("correct") and a list of plausible ASR-mangled variants ("variants", lowercase). Return an empty array if this subject has no notably ASR-fragile vocabulary (most don't).

Do not produce anything resembling a "safety tier" or similar field — that capability is reserved for the app's own built-in clinical lens and is not something a generated lens can define.`;
}

function buildLensMetaUserPrompt(subject: string): string {
  return `The video's subject matter, as classified by the router: "${subject}". Define a lens for it.`;
}

export type LensGenerationSkipReason = "refusal" | "max_tokens" | "parse_error";

export type LensGenerationOutcome =
  | { kind: "ok"; data: LensMetaDraft }
  | { kind: "skipped"; reason: LensGenerationSkipReason; detail: string };

export interface LensGenerationLLMClient {
  generateLensMeta(subject: string, model: string): Promise<LensGenerationOutcome>;
}

/** SPEC: "one LLM call" — small max_tokens, distinct from analysis.ts's per-chunk/merge/router budgets. */
export const LENS_GENERATION_MAX_TOKENS = 2048;

/** Real implementation — same StructuredLLMCaller abstraction analysis.ts/cardTransform.ts use (Anthropic native structured outputs, JSON-mode elsewhere; the zod safeParse below is the real validation gate regardless of provider). */
export class LLMLensGenerationClient implements LensGenerationLLMClient {
  constructor(private readonly caller: StructuredLLMCaller) {}

  async generateLensMeta(subject: string, model: string): Promise<LensGenerationOutcome> {
    const result = await this.caller.call({
      system: buildLensMetaSystemPrompt(),
      userPrompt: buildLensMetaUserPrompt(subject),
      jsonSchema: LENS_META_JSON_SCHEMA as unknown as Record<string, unknown>,
      model,
      maxTokens: LENS_GENERATION_MAX_TOKENS,
    });
    if (result.kind === "skipped") return result;
    let raw: unknown;
    try {
      raw = JSON.parse(result.text);
    } catch (err) {
      return { kind: "skipped", reason: "parse_error", detail: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}` };
    }
    const parsed = LensMetaDraftSchema.safeParse(raw);
    if (!parsed.success) return { kind: "skipped", reason: "parse_error", detail: parsed.error.message };
    return { kind: "ok", data: parsed.data };
  }
}

/**
 * Deterministic fake — no network call. Used when `STUDYLOOP_FAKE_ANALYSIS=1`
 * and directly injectable in tests (mirrors analysis.ts's FakeAnalysisClient
 * / cardTransform.ts's FakeCardTransformClient). Produces a small but
 * genuinely subject-shaped draft (including a tiny starter glossary) so the
 * whole generation path — including glossary persistence + loading — is
 * exercisable end to end without ever calling a real LLM.
 */
export class FakeLensGenerationClient implements LensGenerationLLMClient {
  async generateLensMeta(subject: string, _model?: string): Promise<LensGenerationOutcome> {
    const trimmed = subject.trim();
    const label =
      trimmed
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ") || "Generated Subject";
    return {
      kind: "ok",
      data: {
        label,
        routerDescription: `content about ${trimmed || "this subject"}`,
        unitTypeEmphasis: `Domain lens: ${trimmed || "generated subject"} (auto-generated). Keep unit-type emphasis balanced across CLAIM/MECHANISM/PROCEDURE/EXAMPLE/BOUNDARY/CLUSTER — this subject has no declared safety-critical material.`,
        overlayFields: [{ key: "keyTerm", label: "Key term", hint: "" }],
        questionStyle: "default",
        glossary: trimmed ? [{ correct: label, variants: [trimmed.toLowerCase()] }] : [],
      },
    };
  }
}

let injectedLensGenerationClientForTests: LensGenerationLLMClient | null = null;

/** Test-only: force `resolveLensGenerationClient` to return a fake/spy implementation. */
export function __setLensGenerationClientForTests(client: LensGenerationLLMClient | null): void {
  injectedLensGenerationClientForTests = client;
}

/**
 * Resolves the lens-generation client. Same priority order as
 * analysis.ts's resolveAnalysisClientV3 / cardTransform.ts's
 * resolveCardTransformClient: test-injected first, then the deterministic
 * fake under `STUDYLOOP_FAKE_ANALYSIS=1`, then a real provider-backed client.
 * Unlike resolveAnalysisClientV3, `auth === null` outside fake/test mode
 * returns `null` rather than throwing — lens generation is a best-effort
 * enhancement on top of an analyze run that already has everything it needs
 * to fall back to "generic" (SPEC: "analysis must never fail because lens
 * generation failed").
 */
export function resolveLensGenerationClient(auth: string | ProviderAuth | null): LensGenerationLLMClient | null {
  if (injectedLensGenerationClientForTests) return injectedLensGenerationClientForTests;
  if (process.env.STUDYLOOP_FAKE_ANALYSIS === "1") return new FakeLensGenerationClient();
  if (!auth) return null;
  const resolved: ProviderAuth = typeof auth === "string" ? { provider: "anthropic", mode: "api-key", apiKey: auth } : auth;
  return new LLMLensGenerationClient(createStructuredCaller(resolved));
}

/**
 * Lowercase-kebab-case, mirroring analysis.ts's slugifyTitle/fingerprintLabel
 * (duplicated rather than imported — see SPINE_UNIT_TYPES' doc comment on why
 * this module never imports from analysis.ts). Falls back to
 * "generated-lens" for a subject with no alphanumeric characters at all.
 */
function kebabCaseSubject(subject: string): string {
  const base = subject
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "generated-lens";
}

/** `<dataDir>/lenses` — where both a hand-authored user lens (Phase 5) and a Phase-9-generated one live; the two are indistinguishable to the registry loader (a generated lens is a normal file the moment it's written — SPEC: "reused by the router for future videos, hand-editable, deletable"). */
function userLensDir(dataDir: string): string {
  return path.join(dataDir, "lenses");
}

function userLensFilePath(dataDir: string, id: string): string {
  return path.join(userLensDir(dataDir), `${id}.json`);
}

/**
 * `<dataDir>/lenses/glossary/<ref>.json` — a Phase-9-generated lens's
 * starter glossary (same on-disk shape as lib/glossary/nursing.json: an
 * array of `{correct, variants}`). Exported so lib/terms.ts's glossaryRef
 * resolution can load it (see terms.ts's `resolveGlossaryDefaults`) without
 * terms.ts needing to know this module's internal directory layout.
 */
export function lensGlossaryFilePath(dataDir: string, ref: string): string {
  return path.join(userLensDir(dataDir), "glossary", `${ref}.json`);
}

/**
 * Collision-safe id derivation (SPEC: "id (kebab-case from subject,
 * collision-safe)") — checked against both the currently-loaded registry
 * AND whatever's actually on disk (a lens file can exist on disk without
 * being in the loaded/cached registry yet), so this is the authoritative
 * "is this id free" check, not just a registry lookup. Bounded (100
 * attempts) so a pathological run of collisions degrades to a generation
 * failure rather than looping forever.
 */
function deriveGeneratedLensId(subject: string, dataDir: string, existingIds: ReadonlySet<string>): string | null {
  const base = kebabCaseSubject(subject);
  for (let attempt = 0; attempt < 100; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    if (existingIds.has(candidate)) continue;
    if (fs.existsSync(userLensFilePath(dataDir, candidate))) continue;
    return candidate;
  }
  return null;
}

export interface GenerateAndPersistLensParams {
  dataDir: string;
  /** The router's free-text subject label (RouterResult.subject, see analysis.ts) — never empty at this call site (callers check before invoking). */
  subject: string;
  client: LensGenerationLLMClient;
  model: string;
}

/**
 * Phase 9 "Lens autogeneration for unknown subjects": the whole
 * generate -> validate -> persist -> make-visible pipeline for ONE lens.
 * Every expected failure mode (LLM refusal/parse error, schema validation
 * failure, id-collision exhaustion, disk IO error) returns `null` rather than
 * throwing — analysis.ts's caller treats `null` exactly like "generation
 * wasn't available" and falls back to the "generic" domain (SPEC: "on any
 * failure ... fall back to generic and log a warning — analysis must never
 * fail because lens generation failed"). Called AT MOST ONCE per analyze run
 * (enforced by the call site, not here — see runAnalysisJobV3).
 */
export async function generateAndPersistLens(params: GenerateAndPersistLensParams): Promise<Lens | null> {
  const { dataDir, subject, client, model } = params;
  try {
    const outcome = await client.generateLensMeta(subject, model);
    if (outcome.kind !== "ok") {
      // eslint-disable-next-line no-console
      console.warn(`[lenses] generation call skipped for subject "${subject}" (${outcome.reason}): ${outcome.detail}`);
      return null;
    }
    const draft = outcome.data;

    const existingIds = new Set(listLensesOrFallback(dataDir).map((l) => l.id));
    const id = deriveGeneratedLensId(subject, dataDir, existingIds);
    if (!id) {
      // eslint-disable-next-line no-console
      console.warn(`[lenses] could not derive a free id for subject "${subject}" — too many collisions`);
      return null;
    }

    // Glossary is written FIRST (best-effort): `glossaryRef` is only ever
    // set on the lens object below if this write actually succeeds, so a
    // generated lens never references a glossary file that doesn't exist.
    let glossaryWritten = false;
    if (draft.glossary.length > 0) {
      try {
        const glossaryPath = lensGlossaryFilePath(dataDir, id);
        fs.mkdirSync(path.dirname(glossaryPath), { recursive: true });
        // "Never overwrite" applies here too — `wx` is create-only and
        // throws EEXIST rather than silently clobbering.
        fs.writeFileSync(glossaryPath, JSON.stringify(draft.glossary, null, 2), { flag: "wx" });
        glossaryWritten = true;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[lenses] failed to write generated glossary for "${id}": ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const overlayFields: LensOverlayField[] = draft.overlayFields
      .slice(0, MAX_GENERATED_OVERLAY_FIELDS)
      .map((f) => ({ key: f.key, label: f.label, ...(f.hint && f.hint.trim() ? { hint: f.hint } : {}) }));

    // HARD GUARDRAIL: safetyTier is never copied from the model's output —
    // there's no slot for it in LensMetaDraftSchema in the first place, and
    // this object literal below simply never mentions the field, so even a
    // provider that ignored the schema and slipped an extra "safetyTier" key
    // into its raw JSON text can't make it onto the constructed lens.
    // `origin` marks this file as autogenerated (see models.ts LensSchema).
    const candidateLens: Lens = {
      id,
      label: draft.label,
      routerDescription: draft.routerDescription,
      unitTypeEmphasis: draft.unitTypeEmphasis,
      overlayFields,
      questionStyle: draft.questionStyle,
      ...(glossaryWritten ? { glossaryRef: id } : {}),
      origin: "generated",
    };

    const validated = LensSchema.safeParse(candidateLens);
    if (!validated.success) {
      // eslint-disable-next-line no-console
      console.warn(`[lenses] generated lens for "${subject}" failed LensSchema validation: ${validated.error.message}`);
      return null;
    }

    const lensPath = userLensFilePath(dataDir, id);
    fs.mkdirSync(path.dirname(lensPath), { recursive: true });
    // Never overwrite an existing lens file: `wx` is create-only (throws
    // EEXIST rather than clobbering) — belt-and-braces alongside
    // deriveGeneratedLensId's own on-disk check above, closing the
    // check-then-write race between the two.
    fs.writeFileSync(lensPath, JSON.stringify(validated.data, null, 2), { flag: "wx" });

    // Make the new lens visible to THIS SAME analyze run — a targeted
    // per-dataDir invalidation, not a full cache clear (see
    // invalidateLensRegistryCache's own doc comment above).
    invalidateLensRegistryCache(dataDir);

    return validated.data;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[lenses] generation failed for subject "${subject}": ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
