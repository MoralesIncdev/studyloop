import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getLibrary, rescanLibrary, resetLibraryScanCacheForTests } from "../src/lib/libraryScanCache.js";
import * as scanModule from "../src/lib/scan.js";

describe("libraryScanCache", () => {
  let libraryRoot: string;

  beforeEach(async () => {
    resetLibraryScanCacheForTests();
    libraryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-scan-cache-"));
    await fs.writeFile(path.join(libraryRoot, "lesson.mp4"), "fake video bytes");
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(libraryRoot, { recursive: true, force: true });
  });

  function config() {
    return { libraryRoots: [libraryRoot], transcriptRoots: [] };
  }

  it("serves the cached result on a second getLibrary() call with the same (unchanged) root config", async () => {
    const scanSpy = vi.spyOn(scanModule, "scanLibrary");
    const first = await getLibrary(config());
    expect(first.items).toHaveLength(1);
    expect(scanSpy).toHaveBeenCalledTimes(1);

    // Prove it's actually serving the cache, not just coincidentally
    // returning the same answer: remove the file on disk and scan again —
    // a real second scan would report zero items.
    await fs.rm(path.join(libraryRoot, "lesson.mp4"));
    const second = await getLibrary(config());
    expect(second).toBe(first); // same object identity -> cache hit, no rescan
    expect(scanSpy).toHaveBeenCalledTimes(1);
  });

  it("rescans when the resolved root config changes", async () => {
    const scanSpy = vi.spyOn(scanModule, "scanLibrary");
    await getLibrary(config());
    expect(scanSpy).toHaveBeenCalledTimes(1);

    const otherRoot = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-scan-cache-other-"));
    try {
      await getLibrary({ libraryRoots: [otherRoot], transcriptRoots: [] });
      expect(scanSpy).toHaveBeenCalledTimes(2);
    } finally {
      await fs.rm(otherRoot, { recursive: true, force: true });
    }
  });

  it("POST rescan always re-walks even when the cache is still valid", async () => {
    const scanSpy = vi.spyOn(scanModule, "scanLibrary");
    await getLibrary(config());
    expect(scanSpy).toHaveBeenCalledTimes(1);
    await rescanLibrary(config());
    expect(scanSpy).toHaveBeenCalledTimes(2);
  });

  it("dedupes concurrent callers into a single in-flight scan", async () => {
    const scanSpy = vi.spyOn(scanModule, "scanLibrary");
    // Both calls made synchronously, before either can resolve — the second
    // must see the first's in-flight promise rather than starting its own walk.
    const [a, b] = await Promise.all([getLibrary(config()), getLibrary(config())]);
    expect(a).toBe(b);
    expect(scanSpy).toHaveBeenCalledTimes(1);
  });

  it("a concurrent GET and rescan share the same in-flight scan", async () => {
    const scanSpy = vi.spyOn(scanModule, "scanLibrary");
    const [a, b] = await Promise.all([getLibrary(config()), rescanLibrary(config())]);
    expect(a).toBe(b);
    expect(scanSpy).toHaveBeenCalledTimes(1);
  });
});
