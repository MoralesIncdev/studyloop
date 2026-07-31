import { describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import { expandHome, redactConfig, resolveRoots, type StudyLoopConfig } from "../src/config.js";

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
});
