import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resetTranscriptRefCacheForTests, scanLibrary } from "../src/lib/scan.js";

describe("scan.ts transcript-ref (path, mtime, size) cache", () => {
  let libraryRoot: string;
  let transcriptRoot: string;
  let videoPath: string;
  let transcriptPath: string;

  beforeEach(async () => {
    resetTranscriptRefCacheForTests();
    libraryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-scan-lib-"));
    transcriptRoot = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-scan-transcript-"));
    videoPath = path.join(libraryRoot, "lesson.mp4");
    await fs.writeFile(videoPath, "fake video bytes");
    transcriptPath = path.join(transcriptRoot, "lesson.json");
    await fs.writeFile(transcriptPath, JSON.stringify({ source_video: videoPath, duration_seconds: 100 }));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(libraryRoot, { recursive: true, force: true });
    await fs.rm(transcriptRoot, { recursive: true, force: true });
  });

  function config() {
    return { libraryRoots: [libraryRoot], transcriptRoots: [transcriptRoot] };
  }

  it("does not re-read an unchanged transcript file on a second scan", async () => {
    const readSpy = vi.spyOn(fs, "readFile");

    const first = await scanLibrary(config());
    expect(first.items[0].transcriptPath).toBe(transcriptPath);
    const callsAfterFirst = readSpy.mock.calls.filter(([p]) => p === transcriptPath).length;
    expect(callsAfterFirst).toBe(1);

    const second = await scanLibrary(config());
    expect(second.items[0].transcriptPath).toBe(transcriptPath);
    const callsAfterSecond = readSpy.mock.calls.filter(([p]) => p === transcriptPath).length;
    // No additional read for the unchanged file.
    expect(callsAfterSecond).toBe(1);
  });

  it("re-reads a transcript file whose content (and therefore mtime/size) changed", async () => {
    const readSpy = vi.spyOn(fs, "readFile");
    await scanLibrary(config());
    expect(readSpy.mock.calls.filter(([p]) => p === transcriptPath).length).toBe(1);

    // Rewrite with different content/size and a fresh mtime.
    await new Promise((resolve) => setTimeout(resolve, 10));
    await fs.writeFile(
      transcriptPath,
      JSON.stringify({ source_video: videoPath, duration_seconds: 999, padding: "x".repeat(50) })
    );

    const result = await scanLibrary(config());
    expect(result.items[0].durationSeconds).toBe(999);
    expect(readSpy.mock.calls.filter(([p]) => p === transcriptPath).length).toBe(2);
  });
});
