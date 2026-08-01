// Phase 10 "Transcript source chain" (design/EXECUTION-PLAN-post-review-v1.md).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { deriveYoutubeVideoId, findSidecarTranscript } from "../src/lib/sidecar.js";

describe("findSidecarTranscript", () => {
  let dir: string;
  const videoName = "20170418 - Passing Half Guard (Lachlan Giles) [Vn8Y8AnxH14]";
  let videoPath: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-sidecar-"));
    videoPath = path.join(dir, `${videoName}.mp4`);
    await fs.writeFile(videoPath, "fake video bytes");
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("returns null when no sidecar file exists next to the video", async () => {
    expect(await findSidecarTranscript(videoPath)).toBeNull();
  });

  it("matches an exact <basename>.srt sidecar", async () => {
    const srtPath = path.join(dir, `${videoName}.srt`);
    await fs.writeFile(srtPath, "1\n00:00:00,000 --> 00:00:01,000\nhi\n");
    const ref = await findSidecarTranscript(videoPath);
    expect(ref).toEqual({ path: srtPath });
  });

  it("matches an exact <basename>.vtt sidecar when no .srt exists", async () => {
    const vttPath = path.join(dir, `${videoName}.vtt`);
    await fs.writeFile(vttPath, "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nhi\n");
    expect(await findSidecarTranscript(videoPath)).toEqual({ path: vttPath });
  });

  it("falls back to <basename>.en.srt when no exact-match sidecar exists", async () => {
    const enPath = path.join(dir, `${videoName}.en.srt`);
    await fs.writeFile(enPath, "1\n00:00:00,000 --> 00:00:01,000\nhi\n");
    expect(await findSidecarTranscript(videoPath)).toEqual({ path: enPath });
  });

  it("falls back to <basename>.en-orig.srt only when nothing else matches", async () => {
    const origPath = path.join(dir, `${videoName}.en-orig.srt`);
    await fs.writeFile(origPath, "1\n00:00:00,000 --> 00:00:01,000\nhi\n");
    expect(await findSidecarTranscript(videoPath)).toEqual({ path: origPath });
  });

  it("prefers the exact <basename>.srt over an .en.srt sidecar when both exist", async () => {
    const exactPath = path.join(dir, `${videoName}.srt`);
    const enPath = path.join(dir, `${videoName}.en.srt`);
    await fs.writeFile(enPath, "1\n00:00:00,000 --> 00:00:01,000\nen track\n");
    await fs.writeFile(exactPath, "1\n00:00:00,000 --> 00:00:01,000\nexact track\n");
    expect(await findSidecarTranscript(videoPath)).toEqual({ path: exactPath });
  });

  it("prefers .en.srt over .en-orig.srt when both exist (SPEC: prefer non-orig)", async () => {
    const enPath = path.join(dir, `${videoName}.en.srt`);
    const origPath = path.join(dir, `${videoName}.en-orig.srt`);
    await fs.writeFile(origPath, "1\n00:00:00,000 --> 00:00:01,000\noriginal language\n");
    await fs.writeFile(enPath, "1\n00:00:00,000 --> 00:00:01,000\nenglish\n");
    expect(await findSidecarTranscript(videoPath)).toEqual({ path: enPath });
  });

  it("returns null when the video's directory doesn't exist at all", async () => {
    expect(await findSidecarTranscript(path.join(dir, "missing-dir", "ghost.mp4"))).toBeNull();
  });
});

describe("deriveYoutubeVideoId", () => {
  it("extracts the 11-char id from a yt-dlp-style bracketed filename", () => {
    expect(deriveYoutubeVideoId("/lib/20170418 - Passing Half Guard (Lachlan Giles) [Vn8Y8AnxH14].mp4")).toBe(
      "Vn8Y8AnxH14"
    );
  });

  it("handles ids containing hyphens and underscores", () => {
    expect(deriveYoutubeVideoId("/lib/Stretch with us [-FZ8yHneQIg].mp4")).toBe("-FZ8yHneQIg");
    expect(deriveYoutubeVideoId("/lib/some clip [aBc_dJd-zqx].mkv")).toBe("aBc_dJd-zqx");
  });

  it("returns null when the filename has no bracketed id at all", () => {
    expect(deriveYoutubeVideoId("/lib/OpenGuardSeatedVolume1.mp4")).toBeNull();
  });

  it("returns null when the bracketed token isn't exactly 11 characters", () => {
    expect(deriveYoutubeVideoId("/lib/clip [short].mp4")).toBeNull();
    expect(deriveYoutubeVideoId("/lib/clip [waaaaytoolongforanid].mp4")).toBeNull();
  });

  it("returns null when the bracketed token isn't at the very end of the basename", () => {
    expect(deriveYoutubeVideoId("/lib/[Vn8Y8AnxH14] extra trailing text.mp4")).toBeNull();
  });
});
