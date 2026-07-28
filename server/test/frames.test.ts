import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isFfmpegAvailable } from "../src/lib/frames.js";

// isFfmpegAvailable() must treat "the binary ran but exited non-zero" as
// unavailable, not just "spawn didn't error" — a broken/incompatible ffmpeg
// install can still be found on PATH and still start, then fail immediately.
describe("isFfmpegAvailable exit-code check", () => {
  let binDir: string;
  const originalBin = process.env.STUDYLOOP_FFMPEG_BIN;

  afterEach(async () => {
    if (originalBin === undefined) delete process.env.STUDYLOOP_FFMPEG_BIN;
    else process.env.STUDYLOOP_FFMPEG_BIN = originalBin;
    if (binDir) await fs.rm(binDir, { recursive: true, force: true });
  });

  async function fakeBin(script: string): Promise<string> {
    binDir = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-fake-ffmpeg-"));
    const binPath = path.join(binDir, "fake-ffmpeg");
    await fs.writeFile(binPath, script, { mode: 0o755 });
    return binPath;
  }

  it("returns false when the binary exits non-zero, even though the spawn itself succeeded", async () => {
    const binPath = await fakeBin("#!/bin/sh\nexit 1\n");
    process.env.STUDYLOOP_FFMPEG_BIN = binPath;
    expect(await isFfmpegAvailable()).toBe(false);
  });

  it("returns true when the binary exits 0", async () => {
    const binPath = await fakeBin("#!/bin/sh\necho fake-ffmpeg version\nexit 0\n");
    process.env.STUDYLOOP_FFMPEG_BIN = binPath;
    expect(await isFfmpegAvailable()).toBe(true);
  });

  it("returns false when the binary doesn't exist at all (ENOENT)", async () => {
    process.env.STUDYLOOP_FFMPEG_BIN = "/definitely/not/a/real/path/ffmpeg";
    expect(await isFfmpegAvailable()).toBe(false);
  });
});
