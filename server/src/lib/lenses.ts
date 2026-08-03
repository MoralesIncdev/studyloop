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
import { LensSchema, type Lens } from "./models.js";

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
