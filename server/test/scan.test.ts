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

describe("scan.ts Phase 10 'Transcript source chain' — sidecar resolution + transcribable marker", () => {
  let libraryRoot: string;

  beforeEach(async () => {
    resetTranscriptRefCacheForTests();
    libraryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-scan-sidecar-"));
  });

  afterEach(async () => {
    await fs.rm(libraryRoot, { recursive: true, force: true });
  });

  function config() {
    return { libraryRoots: [libraryRoot], transcriptRoots: [] };
  }

  it("leaves a pipeline-matched item's transcriptSource as 'pipeline' and skips sidecar lookup entirely", async () => {
    const transcriptRoot = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-scan-sidecar-pipeline-"));
    try {
      const videoPath = path.join(libraryRoot, "lesson.mp4");
      await fs.writeFile(videoPath, "video");
      // Decoy sidecar that must be ignored since a pipeline transcript matched.
      await fs.writeFile(path.join(libraryRoot, "lesson.srt"), "1\n00:00:00,000 --> 00:00:01,000\ndecoy\n");
      await fs.writeFile(
        path.join(transcriptRoot, "lesson.json"),
        JSON.stringify({ source_video: videoPath, duration_seconds: 42 })
      );
      const result = await scanLibrary({ libraryRoots: [libraryRoot], transcriptRoots: [transcriptRoot] });
      expect(result.items[0].transcriptPath).toBe(path.join(transcriptRoot, "lesson.json"));
      expect(result.items[0].transcriptSource).toBe("pipeline");
      expect(result.items[0].transcribable).toBeUndefined();
    } finally {
      await fs.rm(transcriptRoot, { recursive: true, force: true });
    }
  });

  it("matches a same-dir .en.srt sidecar when no pipeline transcript exists, and marks transcriptSource 'sidecar'", async () => {
    const videoPath = path.join(libraryRoot, "20170418 - Passing Half Guard (Lachlan Giles) [Vn8Y8AnxH14].mp4");
    await fs.writeFile(videoPath, "video");
    const sidecarPath = path.join(libraryRoot, "20170418 - Passing Half Guard (Lachlan Giles) [Vn8Y8AnxH14].en.srt");
    await fs.writeFile(sidecarPath, "1\n00:00:00,000 --> 00:00:01,000\nhi\n");

    const result = await scanLibrary(config());
    expect(result.items[0].transcriptPath).toBe(sidecarPath);
    expect(result.items[0].transcriptSource).toBe("sidecar");
    expect(result.items[0].transcribable).toBeUndefined();
  });

  it("marks transcribable: true when no pipeline transcript, no sidecar, and no derivable YouTube id exist", async () => {
    const videoPath = path.join(libraryRoot, "OpenGuardSeatedVolume1.mp4");
    await fs.writeFile(videoPath, "video");

    const result = await scanLibrary(config());
    expect(result.items[0].transcriptPath).toBeUndefined();
    expect(result.items[0].transcriptSource).toBeUndefined();
    expect(result.items[0].transcribable).toBe(true);
  });

  it("does NOT mark transcribable when a YouTube id is derivable — the lazy pull step covers it instead", async () => {
    const videoPath = path.join(libraryRoot, "20200101 - Some Clip [aBcDeFgHiJk].mp4");
    await fs.writeFile(videoPath, "video");

    const result = await scanLibrary(config());
    expect(result.items[0].transcriptPath).toBeUndefined();
    expect(result.items[0].transcribable).toBeUndefined();
  });
});
