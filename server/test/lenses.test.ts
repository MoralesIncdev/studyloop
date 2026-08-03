// Phase 5 "Lens registry + clinical as first data-driven lens"
// (design/EXECUTION-PLAN-post-review-v1.md, AMENDED spec): lib/lenses.ts
// loads repo-shipped server/lenses/*.json merged with user overrides from
// <dataDir>/lenses/*.json (user wins on id collision). Pure fs + zod, no
// network — directly unit-testable like lib/terms.ts's nursing glossary.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_LENS_ID,
  FakeLensGenerationClient,
  IMPLEMENTED_QUESTION_STYLES,
  LLMLensGenerationClient,
  generateAndPersistLens,
  getLens,
  isKnownLensId,
  lensGlossaryFilePath,
  listLenses,
  listLensesOrFallback,
  loadLensRegistry,
  resolveLensOrGeneric,
  __resetLensRegistryCacheForTests,
  type LensGenerationLLMClient,
  type LensMetaDraft,
} from "../src/lib/lenses.js";
import type { StructuredLLMCaller, StructuredLLMRequest, StructuredCallResult } from "../src/lib/providers.js";

const REPO_LENS_IDS = ["biology", "clinical", "generic", "history", "music", "physical_skill"];

describe("loadLensRegistry — repo-shipped lenses", () => {
  beforeEach(() => {
    __resetLensRegistryCacheForTests();
  });

  it("loads exactly the six repo-shipped lenses, sorted by id", () => {
    const registry = loadLensRegistry("");
    expect(registry.list.map((l) => l.id)).toEqual([...REPO_LENS_IDS].sort());
  });

  it("every repo lens validates against LensSchema with the expected id/filename invariant", () => {
    for (const id of REPO_LENS_IDS) {
      const lens = getLens("", id);
      expect(lens).toBeDefined();
      expect(lens!.id).toBe(id);
      expect(lens!.label.length).toBeGreaterThan(0);
      expect(lens!.routerDescription.length).toBeGreaterThan(0);
      expect(lens!.unitTypeEmphasis.length).toBeGreaterThan(0);
      expect(lens!.questionStyle.length).toBeGreaterThan(0);
    }
  });

  it("migrated five keep questionStyle 'default' and carry no safetyTier", () => {
    for (const id of ["biology", "history", "music", "physical_skill", "generic"]) {
      const lens = getLens("", id);
      expect(lens!.questionStyle).toBe("default");
      expect(lens!.safetyTier).toBeUndefined();
    }
  });

  it("clinical lens declares nclex questionStyle, nursing glossaryRef, and the three safety-tier unit types", () => {
    const clinical = getLens("", "clinical");
    expect(clinical).toBeDefined();
    expect(clinical!.questionStyle).toBe("nclex");
    expect(clinical!.glossaryRef).toBe("nursing");
    expect(clinical!.safetyTier).toEqual(expect.arrayContaining(["DOSAGE", "CONTRAINDICATION", "LAB_VALUE"]));
  });

  it("clinical lens declares its six clinical overlay fields", () => {
    const clinical = getLens("", "clinical");
    const keys = clinical!.overlayFields.map((f) => f.key).sort();
    expect(keys).toEqual(["brandName", "drugClass", "genericName", "nclexCategory", "normalRange", "route"].sort());
  });

  it("isKnownLensId is true for every repo lens id and false for an unknown one", () => {
    for (const id of REPO_LENS_IDS) expect(isKnownLensId("", id)).toBe(true);
    expect(isKnownLensId("", "not-a-real-lens")).toBe(false);
  });

  it("resolveLensOrGeneric falls back to the generic lens for an unknown domain id", () => {
    const resolved = resolveLensOrGeneric("", "not-a-real-lens");
    expect(resolved.id).toBe(DEFAULT_LENS_ID);
  });

  it("listLensesOrFallback returns the real registry when non-empty", () => {
    expect(listLensesOrFallback("").length).toBe(REPO_LENS_IDS.length);
  });
});

describe("loadLensRegistry — user lens dir precedence (<dataDir>/lenses)", () => {
  let dataDir: string;

  beforeEach(async () => {
    __resetLensRegistryCacheForTests();
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-lenses-"));
  });

  afterEach(async () => {
    __resetLensRegistryCacheForTests();
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it("is inert (repo lenses only) when the user has no lenses dir at all", () => {
    const registry = loadLensRegistry(dataDir);
    expect(registry.list.map((l) => l.id)).toEqual([...REPO_LENS_IDS].sort());
  });

  it("a user lens with a NEW id is added alongside the repo lenses", async () => {
    await fs.mkdir(path.join(dataDir, "lenses"), { recursive: true });
    await fs.writeFile(
      path.join(dataDir, "lenses", "astronomy.json"),
      JSON.stringify({
        id: "astronomy",
        label: "Astronomy",
        routerDescription: "celestial mechanics, astrophysics",
        unitTypeEmphasis: "Domain lens: astronomy.",
        overlayFields: [],
        questionStyle: "default",
      })
    );
    const registry = loadLensRegistry(dataDir);
    expect(registry.byId.has("astronomy")).toBe(true);
    expect(listLenses(dataDir).length).toBe(REPO_LENS_IDS.length + 1);
  });

  it("a user lens whose id collides with a repo lens WINS (overrides the repo one)", async () => {
    await fs.mkdir(path.join(dataDir, "lenses"), { recursive: true });
    await fs.writeFile(
      path.join(dataDir, "lenses", "biology.json"),
      JSON.stringify({
        id: "biology",
        label: "Biology (user override)",
        routerDescription: "user-overridden description",
        unitTypeEmphasis: "user-overridden emphasis",
        overlayFields: [],
        questionStyle: "default",
      })
    );
    const lens = getLens(dataDir, "biology");
    expect(lens!.label).toBe("Biology (user override)");
    // Still exactly six ids total (override, not a duplicate/addition).
    expect(listLenses(dataDir).length).toBe(REPO_LENS_IDS.length);
  });

  it("a malformed user lens file (invalid JSON) is skipped without crashing the whole registry", async () => {
    await fs.mkdir(path.join(dataDir, "lenses"), { recursive: true });
    await fs.writeFile(path.join(dataDir, "lenses", "broken.json"), "{ not valid json");
    const registry = loadLensRegistry(dataDir);
    expect(registry.list.map((l) => l.id)).toEqual([...REPO_LENS_IDS].sort());
  });

  it("a user lens file that fails LensSchema validation is skipped without crashing the whole registry", async () => {
    await fs.mkdir(path.join(dataDir, "lenses"), { recursive: true });
    await fs.writeFile(path.join(dataDir, "lenses", "invalid.json"), JSON.stringify({ id: "invalid" })); // missing required fields
    const registry = loadLensRegistry(dataDir);
    expect(registry.byId.has("invalid")).toBe(false);
    expect(registry.list.map((l) => l.id)).toEqual([...REPO_LENS_IDS].sort());
  });

  it("a user lens file whose id doesn't match its filename is skipped", async () => {
    await fs.mkdir(path.join(dataDir, "lenses"), { recursive: true });
    await fs.writeFile(
      path.join(dataDir, "lenses", "mismatch.json"),
      JSON.stringify({
        id: "totally-different-id",
        label: "Mismatch",
        routerDescription: "d",
        unitTypeEmphasis: "e",
        overlayFields: [],
        questionStyle: "default",
      })
    );
    expect(isKnownLensId(dataDir, "totally-different-id")).toBe(false);
    expect(isKnownLensId(dataDir, "mismatch")).toBe(false);
  });

  it("is memoized per dataDir until __resetLensRegistryCacheForTests is called", async () => {
    loadLensRegistry(dataDir); // populate cache with "no user lenses yet"
    await fs.mkdir(path.join(dataDir, "lenses"), { recursive: true });
    await fs.writeFile(
      path.join(dataDir, "lenses", "astronomy.json"),
      JSON.stringify({
        id: "astronomy",
        label: "Astronomy",
        routerDescription: "d",
        unitTypeEmphasis: "e",
        overlayFields: [],
        questionStyle: "default",
      })
    );
    expect(isKnownLensId(dataDir, "astronomy")).toBe(false); // still cached from before the file existed
    __resetLensRegistryCacheForTests();
    expect(isKnownLensId(dataDir, "astronomy")).toBe(true); // fresh read picks it up
  });
});

// --- Phase 9 "Lens autogeneration for unknown subjects" ---------------------
// (design/EXECUTION-PLAN-post-review-v1.md).

function spyGenerationCaller(responseText: string): { caller: StructuredLLMCaller; requests: StructuredLLMRequest[] } {
  const requests: StructuredLLMRequest[] = [];
  const caller: StructuredLLMCaller = {
    call: async (request: StructuredLLMRequest): Promise<StructuredCallResult> => {
      requests.push(request);
      return { kind: "ok", text: responseText };
    },
  };
  return { caller, requests };
}

const VALID_DRAFT_JSON: LensMetaDraft = {
  label: "Astrology",
  routerDescription: "astrology, horoscopes, zodiac content",
  unitTypeEmphasis: "Domain lens: astrology. Keep emphasis balanced across CLAIM/MECHANISM/EXAMPLE.",
  overlayFields: [{ key: "signName", label: "Zodiac sign", hint: "" }],
  questionStyle: "default",
  glossary: [],
};

describe("LLMLensGenerationClient — meta-schema call", () => {
  it("sends a request whose schema only allows implemented questionStyle values, and parses a well-formed response", async () => {
    const { caller, requests } = spyGenerationCaller(JSON.stringify(VALID_DRAFT_JSON));
    const client = new LLMLensGenerationClient(caller);
    const outcome = await client.generateLensMeta("astrology", "claude-opus-5");
    expect(outcome.kind).toBe("ok");
    if (outcome.kind === "ok") {
      expect(outcome.data.label).toBe("Astrology");
      expect(outcome.data.questionStyle).toBe("default");
    }
    expect(requests).toHaveLength(1);
    expect(requests[0].system).toContain(IMPLEMENTED_QUESTION_STYLES.join(", "));
    expect(requests[0].userPrompt).toContain("astrology");
    const schema = requests[0].jsonSchema as { properties: { questionStyle: { enum: string[] } } };
    expect(schema.properties.questionStyle.enum).toEqual([...IMPLEMENTED_QUESTION_STYLES]);
  });

  it("meta-schema validation: a questionStyle outside the implemented set is rejected as a parse error, never silently accepted", async () => {
    const { caller } = spyGenerationCaller(JSON.stringify({ ...VALID_DRAFT_JSON, questionStyle: "invented-style" }));
    const client = new LLMLensGenerationClient(caller);
    const outcome = await client.generateLensMeta("astrology", "claude-opus-5");
    expect(outcome.kind).toBe("skipped");
    if (outcome.kind === "skipped") expect(outcome.reason).toBe("parse_error");
  });

  it("meta-schema validation: more than 6 overlayFields is rejected as a parse error (SPEC: '≤6, subject-appropriate')", async () => {
    const tooMany = Array.from({ length: 7 }, (_, i) => ({ key: `field${i}`, label: `Field ${i}` }));
    const { caller } = spyGenerationCaller(JSON.stringify({ ...VALID_DRAFT_JSON, overlayFields: tooMany }));
    const client = new LLMLensGenerationClient(caller);
    const outcome = await client.generateLensMeta("astrology", "claude-opus-5");
    expect(outcome.kind).toBe("skipped");
  });

  it("meta-schema validation: invalid JSON text is a parse error, not a thrown exception", async () => {
    const { caller } = spyGenerationCaller("{ not valid json");
    const client = new LLMLensGenerationClient(caller);
    const outcome = await client.generateLensMeta("astrology", "claude-opus-5");
    expect(outcome.kind).toBe("skipped");
    if (outcome.kind === "skipped") expect(outcome.reason).toBe("parse_error");
  });
});

describe("generateAndPersistLens", () => {
  let dataDir: string;

  beforeEach(async () => {
    __resetLensRegistryCacheForTests();
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-lens-generation-"));
  });

  afterEach(async () => {
    __resetLensRegistryCacheForTests();
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it("derives a kebab-case id from the subject, writes a validated lens file with origin 'generated', and makes it immediately visible via getLens (cache invalidation)", async () => {
    const lens = await generateAndPersistLens({
      dataDir,
      subject: "Organic Chemistry",
      client: new FakeLensGenerationClient(),
      model: "claude-opus-5",
    });
    expect(lens).not.toBeNull();
    expect(lens!.id).toBe("organic-chemistry");
    expect(lens!.origin).toBe("generated");
    expect(lens!.label.length).toBeGreaterThan(0);

    const onDisk = JSON.parse(await fs.readFile(path.join(dataDir, "lenses", "organic-chemistry.json"), "utf8"));
    expect(onDisk.id).toBe("organic-chemistry");
    expect(onDisk.origin).toBe("generated");

    // Immediately visible to the SAME process without a manual cache reset —
    // this is the "cache invalidation" guardrail (invalidateLensRegistryCache
    // is called inside generateAndPersistLens, not by the test).
    expect(getLens(dataDir, "organic-chemistry")?.id).toBe("organic-chemistry");
    expect(isKnownLensId(dataDir, "organic-chemistry")).toBe(true);
  });

  it("HARD GUARDRAIL: never persists safetyTier, even if the generation client's data smuggles one in", async () => {
    const sneaky: LensGenerationLLMClient = {
      generateLensMeta: async () => ({
        kind: "ok",
        // Cast past the type system — this simulates a provider whose
        // JSON-mode schema is advisory only (prompt-embedded, not natively
        // enforced) slipping an extra key into its raw response that a real
        // LLMLensGenerationClient's zod parse would have already dropped.
        // generateAndPersistLens must not copy it through either.
        data: { ...VALID_DRAFT_JSON, safetyTier: ["DOSAGE", "CONTRAINDICATION"] } as unknown as LensMetaDraft,
      }),
    };
    const lens = await generateAndPersistLens({ dataDir, subject: "sneaky subject", client: sneaky, model: "claude-opus-5" });
    expect(lens).not.toBeNull();
    expect(lens!.safetyTier).toBeUndefined();
    const onDisk = JSON.parse(await fs.readFile(path.join(dataDir, "lenses", "sneaky-subject.json"), "utf8"));
    expect(onDisk.safetyTier).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(onDisk, "safetyTier")).toBe(false);
  });

  it("never overwrites an existing lens file: a collision suffixes the id instead, and the original file is untouched", async () => {
    await fs.mkdir(path.join(dataDir, "lenses"), { recursive: true });
    const original = { id: "astronomy", label: "Hand-authored Astronomy", routerDescription: "d", unitTypeEmphasis: "e", overlayFields: [], questionStyle: "default" };
    await fs.writeFile(path.join(dataDir, "lenses", "astronomy.json"), JSON.stringify(original));

    const lens = await generateAndPersistLens({
      dataDir,
      subject: "Astronomy",
      client: new FakeLensGenerationClient(),
      model: "claude-opus-5",
    });
    expect(lens).not.toBeNull();
    expect(lens!.id).toBe("astronomy-2");

    const untouched = JSON.parse(await fs.readFile(path.join(dataDir, "lenses", "astronomy.json"), "utf8"));
    expect(untouched).toEqual(original);
  });

  it("on generation-call failure (LLM refusal/parse error) returns null and writes nothing to disk", async () => {
    const flaky: LensGenerationLLMClient = {
      generateLensMeta: async () => ({ kind: "skipped", reason: "refusal", detail: "declined" }),
    };
    const lens = await generateAndPersistLens({ dataDir, subject: "declined subject", client: flaky, model: "claude-opus-5" });
    expect(lens).toBeNull();
    await expect(fs.readdir(path.join(dataDir, "lenses"))).rejects.toThrow();
  });

  it("on LensSchema validation failure (e.g. an empty label) returns null rather than persisting a broken lens", async () => {
    const invalid: LensGenerationLLMClient = {
      generateLensMeta: async () => ({ kind: "ok", data: { ...VALID_DRAFT_JSON, label: "" } }),
    };
    const lens = await generateAndPersistLens({ dataDir, subject: "bad subject", client: invalid, model: "claude-opus-5" });
    expect(lens).toBeNull();
  });

  it("only ever attempts one generation call per invocation (the call site, not this function, enforces 'at most once per analyze run' — see analysisV3.test.ts)", async () => {
    let calls = 0;
    const counting: LensGenerationLLMClient = {
      generateLensMeta: async (subject, model) => {
        calls++;
        return new FakeLensGenerationClient().generateLensMeta(subject, model);
      },
    };
    await generateAndPersistLens({ dataDir, subject: "counted subject", client: counting, model: "claude-opus-5" });
    expect(calls).toBe(1);
  });

  it("persists a non-empty starter glossary alongside the lens, glossaryRef named after the lens id, loadable at the documented path", async () => {
    const lens = await generateAndPersistLens({
      dataDir,
      subject: "Herbalism",
      client: new FakeLensGenerationClient(),
      model: "claude-opus-5",
    });
    expect(lens).not.toBeNull();
    expect(lens!.glossaryRef).toBe(lens!.id);
    const glossaryOnDisk = JSON.parse(await fs.readFile(lensGlossaryFilePath(dataDir, lens!.id), "utf8"));
    expect(Array.isArray(glossaryOnDisk)).toBe(true);
    expect(glossaryOnDisk.length).toBeGreaterThan(0);
    expect(glossaryOnDisk[0]).toHaveProperty("correct");
    expect(glossaryOnDisk[0]).toHaveProperty("variants");
  });

  it("does not set glossaryRef when the draft carries no glossary at all", async () => {
    const noGlossary: LensGenerationLLMClient = {
      generateLensMeta: async () => ({ kind: "ok", data: { ...VALID_DRAFT_JSON, glossary: [] } }),
    };
    const lens = await generateAndPersistLens({ dataDir, subject: "no glossary subject", client: noGlossary, model: "claude-opus-5" });
    expect(lens).not.toBeNull();
    expect(lens!.glossaryRef).toBeUndefined();
  });
});
