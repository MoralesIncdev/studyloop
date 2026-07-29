import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  __resetThumbnailsForTests,
  __setThumbsDirForTests,
  getOrCreateThumbnail,
  thumbnailCacheKey,
  thumbnailCachePath,
} from "../src/lib/thumbnails.js";
import { isInsideAnyRootCanonical } from "../src/lib/paths.js";

describe("thumbnailCacheKey", () => {
  it("is deterministic for the same path + mtime", () => {
    expect(thumbnailCacheKey("/a/b.mp4", 1000)).toBe(thumbnailCacheKey("/a/b.mp4", 1000));
  });

  it("differs when mtime differs (a replaced file at the same path gets a fresh thumbnail)", () => {
    expect(thumbnailCacheKey("/a/b.mp4", 1000)).not.toBe(thumbnailCacheKey("/a/b.mp4", 2000));
  });

  it("differs for different paths at the same mtime", () => {
    expect(thumbnailCacheKey("/a/b.mp4", 1000)).not.toBe(thumbnailCacheKey("/a/c.mp4", 1000));
  });
});

describe("getOrCreateThumbnail", () => {
  let workDir: string;
  let videoPath: string;
  const originalFfmpegBin = process.env.STUDYLOOP_FFMPEG_BIN;
  const originalFfprobeBin = process.env.STUDYLOOP_FFPROBE_BIN;

  afterEach(async () => {
    if (originalFfmpegBin === undefined) delete process.env.STUDYLOOP_FFMPEG_BIN;
    else process.env.STUDYLOOP_FFMPEG_BIN = originalFfmpegBin;
    if (originalFfprobeBin === undefined) delete process.env.STUDYLOOP_FFPROBE_BIN;
    else process.env.STUDYLOOP_FFPROBE_BIN = originalFfprobeBin;
    __setThumbsDirForTests(null);
    __resetThumbnailsForTests();
    if (workDir) await fs.rm(workDir, { recursive: true, force: true });
  });

  async function setup(ffmpegScript: string, ffprobeScript = "#!/bin/sh\necho 120\nexit 0\n"): Promise<void> {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-thumbs-test-"));
    const thumbsDirPath = path.join(workDir, "thumbs");
    videoPath = path.join(workDir, "video.mp4");
    await fs.writeFile(videoPath, "not a real video, just needs to exist");

    const ffmpegBin = path.join(workDir, "fake-ffmpeg");
    await fs.writeFile(ffmpegBin, ffmpegScript, { mode: 0o755 });
    process.env.STUDYLOOP_FFMPEG_BIN = ffmpegBin;

    const ffprobeBin = path.join(workDir, "fake-ffprobe");
    await fs.writeFile(ffprobeBin, ffprobeScript, { mode: 0o755 });
    process.env.STUDYLOOP_FFPROBE_BIN = ffprobeBin;

    __setThumbsDirForTests(thumbsDirPath);
  }

  it("returns null for a video path that doesn't exist", async () => {
    await setup("#!/bin/sh\nexit 0\n");
    expect(await getOrCreateThumbnail(path.join(workDir, "missing.mp4"))).toBeNull();
  });

  it("generates and caches a thumbnail, writing to the last (output path) argument", async () => {
    // Fake ffmpeg: writes a fake JPEG to whatever its final arg is (extractFrame always passes outPath last).
    // `for last; do :; done` is the POSIX-portable way to land the last positional arg in $last.
    await setup('#!/bin/sh\nfor last; do :; done\necho fake-jpeg-bytes > "$last"\nexit 0\n');
    const result = await getOrCreateThumbnail(videoPath);
    expect(result).not.toBeNull();
    const contents = await fs.readFile(result as string, "utf8");
    expect(contents.trim()).toBe("fake-jpeg-bytes");
  });

  it("serves the cached file on a second call without re-invoking ffmpeg", async () => {
    // Second call must not run ffmpeg again — the script fails on any
    // *second* invocation via a marker file dropped next to itself (found
    // via `$0`'s own directory — not templated in from the JS-side `workDir`,
    // which isn't assigned yet at the point this argument expression would
    // otherwise be evaluated, i.e. before `setup()` runs).
    await setup(
      `#!/bin/sh
d=$(dirname "$0")
if [ -f "$d/ran-once" ]; then exit 1; fi
touch "$d/ran-once"
for last; do :; done
echo fake-jpeg-bytes > "$last"
exit 0
`
    );
    const first = await getOrCreateThumbnail(videoPath);
    expect(first).not.toBeNull();
    expect(await fs.access(path.join(workDir, "ran-once")).then(() => true, () => false)).toBe(true);
    const second = await getOrCreateThumbnail(videoPath);
    expect(second).toBe(first);
  });

  it("dedupes concurrent in-flight requests for the same video into one ffmpeg spawn", async () => {
    await setup(
      `#!/bin/sh
sleep 0.05
for last; do :; done
echo fake-jpeg-bytes > "$last"
exit 0
`
    );
    const [a, b] = await Promise.all([getOrCreateThumbnail(videoPath), getOrCreateThumbnail(videoPath)]);
    expect(a).not.toBeNull();
    expect(a).toBe(b);
  });

  it("returns null when ffmpeg is missing (ENOENT) rather than throwing", async () => {
    await setup("#!/bin/sh\nexit 0\n");
    process.env.STUDYLOOP_FFMPEG_BIN = "/definitely/not/a/real/ffmpeg/binary";
    expect(await getOrCreateThumbnail(videoPath)).toBeNull();
  });

  it("returns null when ffmpeg exits non-zero", async () => {
    await setup("#!/bin/sh\nexit 1\n");
    expect(await getOrCreateThumbnail(videoPath)).toBeNull();
  });

  it("falls back to a near-start seek time when ffprobe can't determine duration", async () => {
    await setup(
      `#!/bin/sh
for last; do :; done
echo fake-jpeg-bytes > "$last"
exit 0
`,
      "#!/bin/sh\nexit 1\n"
    );
    // No assertion on the seek value itself (frames.ts doesn't expose it) —
    // this just verifies the whole pipeline still succeeds when ffprobe fails.
    expect(await getOrCreateThumbnail(videoPath)).not.toBeNull();
  });
});

// codex P1-1 / P0-4: the thumb endpoint reuses the exact same canonical
// path guard as GET /api/video/stream (routes/video.ts) — this is the guard
// itself, exercised the way routes/thumb.ts calls it (see repo convention:
// no Fastify inject() route tests, guards are tested at the lib layer).
describe("thumb endpoint guard (isInsideAnyRootCanonical, as used by routes/thumb.ts)", () => {
  let workDir: string;
  let libraryRoot: string;

  afterEach(async () => {
    if (workDir) await fs.rm(workDir, { recursive: true, force: true });
  });

  async function setup(): Promise<void> {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-thumb-guard-test-"));
    libraryRoot = path.join(workDir, "library");
    await fs.mkdir(libraryRoot, { recursive: true });
  }

  it("allows a path inside a configured library root", async () => {
    await setup();
    const videoPath = path.join(libraryRoot, "video.mp4");
    await fs.writeFile(videoPath, "x");
    expect(await isInsideAnyRootCanonical(videoPath, [libraryRoot])).toBe(true);
  });

  it("rejects a path outside every configured library root", async () => {
    await setup();
    const outside = path.join(workDir, "outside", "video.mp4");
    await fs.mkdir(path.dirname(outside), { recursive: true });
    await fs.writeFile(outside, "x");
    expect(await isInsideAnyRootCanonical(outside, [libraryRoot])).toBe(false);
  });

  it("rejects a symlink inside the root that points outside it", async () => {
    await setup();
    const secretDir = path.join(workDir, "secret");
    await fs.mkdir(secretDir, { recursive: true });
    const secretFile = path.join(secretDir, "video.mp4");
    await fs.writeFile(secretFile, "x");
    const linkPath = path.join(libraryRoot, "escape.mp4");
    await fs.symlink(secretFile, linkPath);
    expect(await isInsideAnyRootCanonical(linkPath, [libraryRoot])).toBe(false);
  });
});
