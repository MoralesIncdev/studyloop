// V3-B review fix #7: `<project>/pearlReviewAdds.json` persistence — mirrors
// reviewStore.test.ts's coverage shape for a per-project (not per-dataDir) file.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { projectDir } from "../src/lib/store.js";
import { pearlReviewAddsJsonPath, readPearlReviewAdds, writePearlReviewAdds } from "../src/lib/pearlReviewStore.js";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

describe("readPearlReviewAdds / writePearlReviewAdds", () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-pearl-review-store-"));
  });

  afterEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it("returns an empty set when pearlReviewAdds.json doesn't exist yet", async () => {
    expect(await readPearlReviewAdds(dataDir, PROJECT_ID)).toEqual(new Set());
  });

  it("round-trips a written set", async () => {
    await writePearlReviewAdds(dataDir, PROJECT_ID, new Set(["60", "120"]));
    expect(await readPearlReviewAdds(dataDir, PROJECT_ID)).toEqual(new Set(["60", "120"]));
  });

  it("rebuilds empty on corrupt JSON, rather than throwing", async () => {
    await fs.mkdir(projectDir(dataDir, PROJECT_ID), { recursive: true });
    await fs.writeFile(pearlReviewAddsJsonPath(dataDir, PROJECT_ID), "{ not valid json", "utf8");
    expect(await readPearlReviewAdds(dataDir, PROJECT_ID)).toEqual(new Set());
  });

  it("rebuilds empty on a shape that fails schema validation (not an array of strings)", async () => {
    await fs.mkdir(projectDir(dataDir, PROJECT_ID), { recursive: true });
    await fs.writeFile(pearlReviewAddsJsonPath(dataDir, PROJECT_ID), JSON.stringify({ not: "an array" }), "utf8");
    expect(await readPearlReviewAdds(dataDir, PROJECT_ID)).toEqual(new Set());
  });
});
