import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { pathExists, readJsonIfExists, writeJsonAtomic } from "./lib/store.js";
import { AnthropicAuthModeSchema, ProviderIdSchema } from "./lib/providers.js";
import { validateAsrCommandTemplate } from "./lib/asrCommand.js";

/**
 * V3-C C1 "Concept Continuity rail" (PEDAGOGY.md §6): hand-tuned default
 * weights for lib/continuity.ts's scorer — hot-reloadable via PUT
 * /api/config, read fresh from getConfig() on every GET
 * /api/projects/:id/continuity call (no module-level caching of the weights
 * themselves).
 */
export const ContinuityWeightsSchema = z.object({
  related: z.number().default(0.15),
  conceptSearch: z.number().default(0.3),
  teacherValidation: z.number().default(0.3),
  gapFill: z.number().default(0.25),
});
export type ContinuityWeights = z.infer<typeof ContinuityWeightsSchema>;

/**
 * Phase 11 "Bring-your-own local ASR adapters" (design/EXECUTION-PLAN-post-review-v1.md):
 * two adapter styles, mirroring the LLM provider registry's own philosophy
 * (lib/providers.ts) — "off" (default, no change in behavior for any
 * existing project), "command" (a local binary invoked via a `{input}`/
 * `{output}` template — whisper.cpp, faster-whisper, mlx-whisper, ...), or
 * "endpoint" (an OpenAI-compatible `/v1/audio/transcriptions` server —
 * speaches, LocalAI, a hosted Whisper). See lib/asr.ts for the adapters
 * themselves and lib/asrCommand.ts for the command template's own validation
 * (kept dependency-free so this schema can call it without a cycle).
 */
export const AsrModeSchema = z.enum(["off", "command", "endpoint"]);
export type AsrMode = z.infer<typeof AsrModeSchema>;

// Plain (unrefined) object shape, kept separate from AsrConfigSchema below
// so PUT /api/config's patch validation can call `.partial()` on it —
// `.partial()` isn't defined on a `superRefine`'d schema (a ZodEffects, not a
// ZodObject). See AsrConfigPatchSchema's own doc comment for why the patch
// path needs a genuinely different (non-defaulting) shape than the full
// config's.
const AsrConfigShape = z.object({
  mode: AsrModeSchema.default("off"),
  /** Command mode only: a template like `whisper-cli -m model.bin -f {input} -of {output} -osrt` — see lib/asrCommand.ts. */
  command: z.string().nullable().default(null),
  /** Endpoint mode only: base URL of an OpenAI-compatible server — `${endpoint}/v1/audio/transcriptions` is POSTed to. */
  endpoint: z.string().nullable().default(null),
  /** Endpoint mode only: sent as `Authorization: Bearer <apiKey>` when set — redacted to `asr.apiKeySet` on the wire (see redactConfig). */
  apiKey: z.string().nullable().default(null),
  /** Endpoint mode only: forwarded as the multipart `model` field, when set. */
  model: z.string().nullable().default(null),
  /** Endpoint mode only: forwarded as the multipart `language` field, when set. */
  language: z.string().nullable().default(null),
});

function refineAsrConfig(val: z.infer<typeof AsrConfigShape>, ctx: z.RefinementCtx): void {
  // SPEC: "Validated: command mode requires a template containing {input}
  // and {output} placeholders." Checked on the full/merged config (not the
  // raw patch — see AsrConfigPatchSchema) so a bad template is rejected the
  // moment Settings tries to save it, not the first time a Transcribe job
  // actually runs.
  if (val.mode === "command") {
    const validation = validateAsrCommandTemplate(val.command ?? "");
    if (!validation.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["command"], message: validation.error ?? "Invalid ASR command template" });
    }
  }
}

/** The full, on-disk `asr` shape — every field defaulted, cross-field validated. Used for config.json itself (loadConfig/DEFAULT_CONFIG) and for validating a PATCH's fully-MERGED result (see updateConfig). */
export const AsrConfigSchema = AsrConfigShape.superRefine(refineAsrConfig);
export type AsrConfig = z.infer<typeof AsrConfigSchema>;

/**
 * PUT /api/config's `asr` patch shape — every field optional, NONE
 * defaulted on omission (unlike AsrConfigSchema, whose per-field
 * `.default(...)` would silently turn an omitted `apiKey` into `null`,
 * clobbering an already-saved key the instant a client sends `asr` without
 * it — exactly the "leave blank to keep" convention every top-level
 * `…ApiKey` field already has, see updateConfig's own comment). Cross-field
 * validation (command-mode-needs-a-template) is deliberately NOT applied
 * here — it runs once, in routes/config.ts, against the fully-merged result
 * (current.asr + this patch), since a patch that only changes `model` and
 * omits `command` shouldn't be rejected just because `command` is absent
 * from the patch itself.
 */
export const AsrConfigPatchSchema = AsrConfigShape.partial();
export type AsrConfigPatch = z.infer<typeof AsrConfigPatchSchema>;

export const ConfigSchema = z.object({
  dataDir: z.string().default("~/StudyLoopData"),
  libraryRoots: z.array(z.string()).default([]),
  transcriptRoots: z.array(z.string()).default([]),
  conceptDocs: z.array(z.string()).default([]),
  anthropicApiKey: z.string().nullable().default(null),
  /** Which LLM provider the analyze/card-transform pipelines call (see lib/providers.ts). */
  llmProvider: ProviderIdSchema.default("anthropic"),
  /** Anthropic only: "api-key" uses `anthropicApiKey`; "oauth" uses ambient credentials (ANTHROPIC_AUTH_TOKEN / ANTHROPIC_API_KEY env, e.g. from `ant auth login`). */
  anthropicAuthMode: AnthropicAuthModeSchema.default("api-key"),
  openaiApiKey: z.string().nullable().default(null),
  googleApiKey: z.string().nullable().default(null),
  xaiApiKey: z.string().nullable().default(null),
  deepseekApiKey: z.string().nullable().default(null),
  kimiApiKey: z.string().nullable().default(null),
  zaiApiKey: z.string().nullable().default(null),
  /** Analysis model override; null => the selected provider's default (see lib/providers.ts resolveAnalysisModel). */
  analysisModel: z.string().nullable().default(null),
  /** V2-C share bundles: author handle embedded in exported .studyloop.json files (SPEC default "anonymous"). */
  shareHandle: z.string().min(1).default("anonymous"),
  /** V3-C C1: Concept Continuity scorer weights (SPEC "weights in config continuityWeights, hot-reloadable"). */
  continuityWeights: ContinuityWeightsSchema.default({}),
  /** Phase 11 "Bring-your-own local ASR adapters": see AsrConfigSchema above. */
  asr: AsrConfigSchema.default({}),
});

export type StudyLoopConfig = z.infer<typeof ConfigSchema>;

/**
 * PUT /api/config's actual request-body schema — identical to
 * `ConfigSchema.partial()` for every field except `asr`, which uses
 * `AsrConfigPatchSchema` (genuinely partial, no per-field defaulting) instead
 * of `ConfigSchema.partial()`'s shallow `.optional()`-wrap-only behavior
 * (which would still fully re-validate+default a *present* `asr` object,
 * defaulting away an omitted `apiKey` — see AsrConfigPatchSchema's comment).
 */
export const ConfigPatchSchema = ConfigSchema.omit({ asr: true }).partial().extend({ asr: AsrConfigPatchSchema.optional() });
export type ConfigPatch = z.infer<typeof ConfigPatchSchema>;

// STUDYLOOP_CONFIG_DIR only (mirrors STUDYLOOP_PORT/STUDYLOOP_FAKE_ANALYSIS's
// env-var-gated-override pattern): lets the e2e harness (playwright.config.ts,
// e2e/fixtures/seed.mjs) point the whole config store — and therefore
// resolveDataDir()'s dataDir, plus libraryRoots/transcriptRoots — at a
// disposable fixture directory instead of the real ~/.studyloop/config.json.
// Without this there is no way to run the app end-to-end against seeded
// fixture data without reading/overwriting the real user's config (API keys
// included) or reusing their real dataDir.
const CONFIG_DIR = process.env.STUDYLOOP_CONFIG_DIR
  ? path.resolve(process.env.STUDYLOOP_CONFIG_DIR)
  : path.join(os.homedir(), ".studyloop");
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
  llmProvider: "anthropic",
  anthropicAuthMode: "api-key",
  openaiApiKey: null,
  googleApiKey: null,
  xaiApiKey: null,
  deepseekApiKey: null,
  kimiApiKey: null,
  zaiApiKey: null,
  analysisModel: null,
  shareHandle: "anonymous",
  continuityWeights: { related: 0.15, conceptSearch: 0.3, teacherValidation: 0.3, gapFill: 0.25 },
  asr: { mode: "off", command: null, endpoint: null, apiKey: null, model: null, language: null },
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

/** `asr.apiKey` redacted the same way every top-level provider key is — see PublicConfig. */
export type PublicAsrConfig = Omit<AsrConfig, "apiKey"> & { apiKeySet: boolean };

/** Public (redacted) shape of the config, safe to send to the browser. */
export type PublicConfig = Omit<
  StudyLoopConfig,
  "anthropicApiKey" | "openaiApiKey" | "googleApiKey" | "xaiApiKey" | "deepseekApiKey" | "kimiApiKey" | "zaiApiKey" | "asr"
> & {
  anthropicApiKeySet: boolean;
  openaiApiKeySet: boolean;
  googleApiKeySet: boolean;
  xaiApiKeySet: boolean;
  deepseekApiKeySet: boolean;
  kimiApiKeySet: boolean;
  zaiApiKeySet: boolean;
  asr: PublicAsrConfig;
};

export function redactConfig(config: StudyLoopConfig): PublicConfig {
  const { anthropicApiKey, openaiApiKey, googleApiKey, xaiApiKey, deepseekApiKey, kimiApiKey, zaiApiKey, asr, ...rest } = config;
  const { apiKey: asrApiKey, ...asrRest } = asr;
  return {
    ...rest,
    anthropicApiKeySet: Boolean(anthropicApiKey),
    openaiApiKeySet: Boolean(openaiApiKey),
    googleApiKeySet: Boolean(googleApiKey),
    xaiApiKeySet: Boolean(xaiApiKey),
    deepseekApiKeySet: Boolean(deepseekApiKey),
    kimiApiKeySet: Boolean(kimiApiKey),
    zaiApiKeySet: Boolean(zaiApiKey),
    asr: { ...asrRest, apiKeySet: Boolean(asrApiKey) },
  };
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

/**
 * Merges `patch` into the current config, persists it, and returns the new
 * value. Accepts `ConfigPatch` (not `Partial<StudyLoopConfig>`) specifically
 * because `asr` needs a genuinely-partial shape — see ConfigPatchSchema.
 */
export async function updateConfig(patch: ConfigPatch): Promise<StudyLoopConfig> {
  const current = await getConfig();
  // Every top-level field is a plain scalar/array except `asr`, which is a
  // nested object — a caller (SettingsView) sends the *whole* asr object on
  // every save (same as continuityWeights), but unlike the top-level
  // `…ApiKey` fields (each its own scalar, simply omitted from the patch to
  // "leave blank to keep"), `{...current, ...patch}` below would REPLACE
  // current.asr wholesale, silently wiping out an already-saved apiKey the
  // moment the client's own patch omits it (the server never echoes the
  // plaintext key back, so the client can't just resend what it doesn't
  // have — see redactConfig's `asr.apiKeySet`). Shallow-merging asr here
  // gives the nested field the same "omit to keep, include to replace"
  // semantics every scalar API key field already has. Safe to feed straight
  // into `ConfigSchema.parse` below (not `.safeParse`) because
  // routes/config.ts already validated the fully-merged asr shape via
  // `AsrConfigSchema.safeParse` before ever calling this function.
  const mergedAsr = patch.asr ? { ...current.asr, ...patch.asr } : current.asr;
  const merged = ConfigSchema.parse({ ...current, ...patch, asr: mergedAsr });
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
