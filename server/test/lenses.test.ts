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
  getLens,
  isKnownLensId,
  listLenses,
  listLensesOrFallback,
  loadLensRegistry,
  resolveLensOrGeneric,
  __resetLensRegistryCacheForTests,
} from "../src/lib/lenses.js";

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
