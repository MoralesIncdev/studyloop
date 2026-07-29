import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { pathExists, readJsonIfExists, writeJsonAtomic } from "./lib/store.js";

export const ConfigSchema = z.object({
  dataDir: z.string().default("~/StudyLoopData"),
  libraryRoots: z.array(z.string()).default([]),
  transcriptRoots: z.array(z.string()).default([]),
  conceptDocs: z.array(z.string()).default([]),
  anthropicApiKey: z.string().nullable().default(null),
  /** V2-C analysis engine model override; null => runtime default "claude-opus-5" (see lib/analysis.ts). */
  analysisModel: z.string().nullable().default(null),
  /** V2-C share bundles: author handle embedded in exported .studyloop.json files (SPEC default "anonymous"). */
  shareHandle: z.string().min(1).default("anonymous"),
});

export type StudyLoopConfig = z.infer<typeof ConfigSchema>;

const CONFIG_DIR = path.join(os.homedir(), ".studyloop");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

export function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

// "~/StudyLoopData", not "~/StudyLoop": on macOS's default case-insensitive
// APFS volume, "~/StudyLoop" resolves to the very same directory as a repo
// cloned to "~/studyloop" — writing project data there corrupts the working
// tree. Only affects fresh installs; an existing config.json's dataDir is
// never touched by this default (see loadConfig below).
const DEFAULT_CONFIG: StudyLoopConfig = {
  dataDir: "~/StudyLoopData",
  libraryRoots: [],
  transcriptRoots: [],
  conceptDocs: [],
  anthropicApiKey: null,
  analysisModel: null,
  shareHandle: "anonymous",
};

export async function loadConfig(): Promise<StudyLoopConfig> {
  const existing = await readJsonIfExists<unknown>(CONFIG_PATH);
  if (existing === null) {
    await writeJsonAtomic(CONFIG_PATH, DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG };
  }
  const parsed = ConfigSchema.safeParse(existing);
  if (parsed.success) return parsed.data;
  // Corrupt/partial config on disk: merge what we can over defaults rather than crash.
  const merged = ConfigSchema.parse({ ...DEFAULT_CONFIG, ...(existing as object) });
  return merged;
}

export async function saveConfig(config: StudyLoopConfig): Promise<void> {
  await writeJsonAtomic(CONFIG_PATH, config);
}

export function resolveDataDir(config: StudyLoopConfig): string {
  return expandHome(config.dataDir);
}

export interface ResolvedRoots {
  libraryRoots: string[];
  transcriptRoots: string[];
  conceptDocs: string[];
}

/**
 * Expands `~` in every configured root/doc path, not just dataDir. Every route
 * that validates or scans against libraryRoots/transcriptRoots/conceptDocs
 * should use this rather than reading the raw config arrays directly, or a
 * `~`-prefixed root silently never matches anything.
 */
export function resolveRoots(config: StudyLoopConfig): ResolvedRoots {
  return {
    libraryRoots: config.libraryRoots.map(expandHome),
    transcriptRoots: config.transcriptRoots.map(expandHome),
    conceptDocs: config.conceptDocs.map(expandHome),
  };
}

/** Public (redacted) shape of the config, safe to send to the browser. */
export type PublicConfig = Omit<StudyLoopConfig, "anthropicApiKey"> & { anthropicApiKeySet: boolean };

export function redactConfig(config: StudyLoopConfig): PublicConfig {
  const { anthropicApiKey, ...rest } = config;
  return { ...rest, anthropicApiKeySet: Boolean(anthropicApiKey) };
}

export function configPath(): string {
  return CONFIG_PATH;
}

/** codex P1-1: cached local-video thumbnail JPEGs (see lib/thumbnails.ts), keyed by path+mtime hash. */
export function thumbsDir(): string {
  return path.join(CONFIG_DIR, "thumbs");
}

let cachedConfig: StudyLoopConfig | null = null;

/** Returns the in-memory config, loading (and creating, if absent) it from disk on first call. */
export async function getConfig(): Promise<StudyLoopConfig> {
  if (!cachedConfig) cachedConfig = await loadConfig();
  return cachedConfig;
}

/** Merges `patch` into the current config, persists it, and returns the new value. */
export async function updateConfig(patch: Partial<StudyLoopConfig>): Promise<StudyLoopConfig> {
  const current = await getConfig();
  const merged = ConfigSchema.parse({ ...current, ...patch });
  cachedConfig = merged;
  await saveConfig(merged);
  return merged;
}

export async function ensureDataDirs(config: StudyLoopConfig): Promise<void> {
  const dataDir = resolveDataDir(config);
  const projectsDir = path.join(dataDir, "projects");
  if (!(await pathExists(projectsDir))) {
    const fs = await import("node:fs/promises");
    await fs.mkdir(projectsDir, { recursive: true });
  }
}
