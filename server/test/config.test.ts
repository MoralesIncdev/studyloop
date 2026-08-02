import { describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import {
  AsrConfigPatchSchema,
  AsrConfigSchema,
  ConfigPatchSchema,
  ConfigSchema,
  expandHome,
  redactConfig,
  resolveRoots,
  type StudyLoopConfig,
} from "../src/config.js";

function baseConfig(overrides: Partial<StudyLoopConfig> = {}): StudyLoopConfig {
  return {
    dataDir: "~/StudyLoop",
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
    ...overrides,
  };
}

describe("resolveRoots", () => {
  it("expands ~ in every libraryRoots/transcriptRoots/conceptDocs entry, not just dataDir", () => {
    const config = baseConfig({
      libraryRoots: ["~/Movies/BJJ", "/already/absolute"],
      transcriptRoots: ["~/Movies/transcripts"],
      conceptDocs: ["~/Documents/curriculum.md"],
    });
    const resolved = resolveRoots(config);
    expect(resolved.libraryRoots).toEqual([path.join(os.homedir(), "Movies/BJJ"), "/already/absolute"]);
    expect(resolved.transcriptRoots).toEqual([path.join(os.homedir(), "Movies/transcripts")]);
    expect(resolved.conceptDocs).toEqual([path.join(os.homedir(), "Documents/curriculum.md")]);
  });

  it("leaves already-absolute paths untouched", () => {
    const config = baseConfig({ libraryRoots: ["/Volumes/SSD2025/Library/BJJ"] });
    expect(resolveRoots(config).libraryRoots).toEqual(["/Volumes/SSD2025/Library/BJJ"]);
  });
});

describe("expandHome", () => {
  it("expands a bare ~", () => {
    expect(expandHome("~")).toBe(os.homedir());
  });

  it("expands ~/ prefix", () => {
    expect(expandHome("~/foo/bar")).toBe(path.join(os.homedir(), "foo/bar"));
  });

  it("leaves non-~ paths untouched", () => {
    expect(expandHome("/Volumes/foo")).toBe("/Volumes/foo");
  });
});

describe("redactConfig", () => {
  it("replaces anthropicApiKey with anthropicApiKeySet: true when a key is set", () => {
    const redacted = redactConfig(baseConfig({ anthropicApiKey: "sk-ant-secret" }));
    expect(redacted).not.toHaveProperty("anthropicApiKey");
    expect(redacted.anthropicApiKeySet).toBe(true);
  });

  it("reports anthropicApiKeySet: false when no key is set", () => {
    const redacted = redactConfig(baseConfig({ anthropicApiKey: null }));
    expect(redacted.anthropicApiKeySet).toBe(false);
  });

  it("never leaks the plaintext key anywhere in the redacted object", () => {
    const redacted = redactConfig(baseConfig({ anthropicApiKey: "sk-ant-very-secret-value" }));
    expect(JSON.stringify(redacted)).not.toContain("sk-ant-very-secret-value");
  });

  it("Phase 11 ASR: replaces asr.apiKey with asr.apiKeySet, same redaction convention as the provider keys", () => {
    const config = baseConfig({
      asr: { mode: "endpoint", command: null, endpoint: "http://localhost:8000", apiKey: "asr-secret", model: "whisper-1", language: null },
    });
    const redacted = redactConfig(config);
    expect(redacted.asr).not.toHaveProperty("apiKey");
    expect(redacted.asr.apiKeySet).toBe(true);
    expect(redacted.asr.mode).toBe("endpoint");
    expect(redacted.asr.endpoint).toBe("http://localhost:8000");
    expect(JSON.stringify(redacted)).not.toContain("asr-secret");
  });

  it("Phase 11 ASR: reports apiKeySet false when no ASR key is set", () => {
    const redacted = redactConfig(baseConfig());
    expect(redacted.asr.apiKeySet).toBe(false);
  });
});

describe("Phase 11 ASR config validation (design/EXECUTION-PLAN-post-review-v1.md)", () => {
  it("defaults to mode 'off' with every field null", () => {
    const parsed = AsrConfigSchema.parse({});
    expect(parsed).toEqual({ mode: "off", command: null, endpoint: null, apiKey: null, model: null, language: null });
  });

  it("accepts a command-mode config with a valid {input}/{output} template", () => {
    const parsed = AsrConfigSchema.safeParse({ mode: "command", command: "whisper-cli -f {input} -of {output} -osrt" });
    expect(parsed.success).toBe(true);
  });

  it("rejects command mode with no command at all", () => {
    const parsed = AsrConfigSchema.safeParse({ mode: "command" });
    expect(parsed.success).toBe(false);
  });

  it("rejects command mode whose template is missing the {output} placeholder", () => {
    const parsed = AsrConfigSchema.safeParse({ mode: "command", command: "whisper-cli -f {input} -o out.srt" });
    expect(parsed.success).toBe(false);
  });

  it("rejects command mode whose template contains a shell metacharacter", () => {
    const parsed = AsrConfigSchema.safeParse({ mode: "command", command: "whisper-cli -f {input} > {output}" });
    expect(parsed.success).toBe(false);
  });

  it("does not validate the command template at all when mode is 'off' or 'endpoint'", () => {
    expect(AsrConfigSchema.safeParse({ mode: "off", command: "garbage; rm -rf /" }).success).toBe(true);
    expect(AsrConfigSchema.safeParse({ mode: "endpoint", command: "garbage; rm -rf /", endpoint: "http://x" }).success).toBe(true);
  });

  it("AsrConfigPatchSchema: omitting apiKey leaves it undefined (does NOT default it to null) — the 'leave blank to keep' contract PUT /api/config's merge relies on", () => {
    const parsed = AsrConfigPatchSchema.parse({ mode: "endpoint", endpoint: "http://localhost:8000" });
    expect(parsed.apiKey).toBeUndefined();
    expect("apiKey" in parsed).toBe(false);
  });

  it("AsrConfigPatchSchema applies no cross-field validation on its own (command mode with no command patched alone is fine — the merge is checked elsewhere, in routes/config.ts)", () => {
    // Patching mode to "command" without also patching `command` in the same
    // request must not be rejected AT THIS SCHEMA — it's the fully-merged
    // result (this patch's mode + whatever command already exists on disk)
    // that has to be valid, checked by routes/config.ts against AsrConfigSchema.
    expect(AsrConfigPatchSchema.safeParse({ mode: "command" }).success).toBe(true);
  });

  it("ConfigPatchSchema: an asr patch omitting apiKey parses with apiKey left undefined, not defaulted", () => {
    const parsed = ConfigPatchSchema.parse({ asr: { mode: "endpoint", endpoint: "http://x", model: "whisper-1" } });
    expect(parsed.asr).toEqual({ mode: "endpoint", endpoint: "http://x", model: "whisper-1" });
    expect(parsed.asr).not.toHaveProperty("apiKey");
  });

  it("ConfigPatchSchema: every non-asr field keeps its original partial() behavior (no regression from switching off ConfigSchema.partial() directly)", () => {
    const parsed = ConfigPatchSchema.parse({ dataDir: "~/Elsewhere" });
    expect(parsed).toEqual({ dataDir: "~/Elsewhere" });
  });

  it("a full StudyLoopConfig parse defaults `asr` when entirely absent (backward compat with pre-Phase-11 config.json files)", () => {
    const raw = {
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
    };
    const parsed = ConfigSchema.parse(raw);
    expect(parsed.asr).toEqual({ mode: "off", command: null, endpoint: null, apiKey: null, model: null, language: null });
  });
});
