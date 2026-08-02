// Phase 10 "Transcript source chain" (design/EXECUTION-PLAN-post-review-v1.md).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ResolvedRoots } from "../src/config.js";
import { __setInnertubeClientForTests, type InnertubeClient, type RawTranscriptInfo } from "../src/lib/innertube.js";
import type { Project } from "../src/lib/models.js";
import {
  __resetYoutubeNegativeCacheForTests,
  resolveEffectiveTranscript,
  transcriptSourceForDeclaredPath,
} from "../src/lib/transcriptChain.js";
import { pathExists, writeJsonAtomic, writeProject } from "../src/lib/store.js";
import { writeTerms } from "../src/lib/terms.js";
import { asrCachePath, writeAsrCache } from "../src/lib/asr.js";

const noRoots: ResolvedRoots = { libraryRoots: [], transcriptRoots: [], conceptDocs: [] };

function baseProject(overrides: Partial<Project> & Pick<Project, "id" | "source" | "transcript">): Project {
  const now = new Date().toISOString();
  return {
    title: "Test project",
    createdAt: now,
    updatedAt: now,
    lastPosition: 0,
    watchedUpTo: 0,
    ...overrides,
  };
}

/** A fake Innertube client whose getTranscript() resolves to `segments` (or throws, for the no-captions case). */
function fakeClient(opts: {
  segments?: { start: number; end: number; text: string }[];
  onGetInfo?: () => void;
  throwOnTranscript?: boolean;
}): InnertubeClient {
  return {
    async getInfo() {
      opts.onGetInfo?.();
      return {
        basic_info: { title: "A video", author: "Someone", duration: 120 },
        watch_next_feed: [],
        async getTranscript(): Promise<RawTranscriptInfo> {
          if (opts.throwOnTranscript) throw new Error("no transcript track");
          const nodes = (opts.segments ?? []).map((s) => ({
            type: "TranscriptSegment",
            start_ms: String(Math.round(s.start * 1000)),
            end_ms: String(Math.round(s.end * 1000)),
            snippet: { text: s.text },
          }));
          return { transcript: { content: { body: { initial_segments: nodes } } } };
        },
      };
    },
    async search() {
      return { results: [] };
    },
  };
}

describe("resolveEffectiveTranscript (Phase 10 chain)", () => {
  let dataDir: string;
  let libDir: string;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-chain-data-"));
    libDir = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-chain-lib-"));
    __resetYoutubeNegativeCacheForTests();
    __setInnertubeClientForTests(null);
  });

  afterEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
    await fs.rm(libDir, { recursive: true, force: true });
    __setInnertubeClientForTests(null);
  });

  it("step 1 (pipeline) wins even when a sidecar and a derivable YouTube id are also present", async () => {
    const videoPath = path.join(libDir, "20200101 - Lesson [Vn8Y8AnxH14].mp4");
    await fs.writeFile(videoPath, "fake video bytes");
    // Decoy sidecar — must never be read since the pipeline transcript wins.
    await fs.writeFile(path.join(libDir, "20200101 - Lesson [Vn8Y8AnxH14].en.srt"), "1\n00:00:00,000 --> 00:00:01,000\nsidecar text\n");

    const project = baseProject({
      id: "proj-pipeline",
      source: { type: "local", path: videoPath },
      transcript: { type: "file", path: "pipeline.json" },
    });
    await writeProject(dataDir, project);
    await writeJsonAtomic(path.join(dataDir, "projects", project.id, "pipeline.json"), {
      segments: [{ start: 0, end: 1, text: "pipeline text" }],
    });

    // Fake client that would blow up if the chain ever fell through to youtube.
    __setInnertubeClientForTests(fakeClient({ onGetInfo: () => { throw new Error("must not call innertube"); } }));

    const result = await resolveEffectiveTranscript(dataDir, noRoots, project);
    expect(result.source).toBe("pipeline");
    expect(result.transcribable).toBe(false);
    expect(result.segments).toEqual([{ start: 0, end: 1, text: "pipeline text" }]);
  });

  it("step 2 (sidecar) resolves when there's no pipeline transcript, and applies Phase 2 terms correction", async () => {
    const videoPath = path.join(libDir, "lesson.mp4");
    await fs.writeFile(videoPath, "fake video bytes");
    await fs.writeFile(
      path.join(libDir, "lesson.en.srt"),
      "1\n00:00:00,000 --> 00:00:01,000\ngive metro pro law now\n"
    );

    const project = baseProject({
      id: "proj-sidecar",
      source: { type: "local", path: videoPath },
      transcript: { type: "none" },
    });
    await writeProject(dataDir, project);
    await writeTerms(dataDir, project.id, {
      "metro pro law": { correct: "metoprolol", source: "user", createdAt: new Date().toISOString() },
    });

    const result = await resolveEffectiveTranscript(dataDir, noRoots, project);
    expect(result.source).toBe("sidecar");
    expect(result.transcribable).toBe(false);
    expect(result.segments).toEqual([{ start: 0, end: 1, text: "give metoprolol now" }]);
  });

  it("step 3 (lazy youtube pull) resolves when there's no pipeline transcript and no sidecar, for a local video with a derivable id", async () => {
    const videoPath = path.join(libDir, "20200101 - Lesson [aBcDeFgHiJk].mp4");
    await fs.writeFile(videoPath, "fake video bytes");

    const project = baseProject({
      id: "proj-youtube-local",
      source: { type: "local", path: videoPath },
      transcript: { type: "none" },
    });
    await writeProject(dataDir, project);

    let calls = 0;
    __setInnertubeClientForTests(
      fakeClient({ segments: [{ start: 0, end: 2, text: "hello from youtube" }], onGetInfo: () => calls++ })
    );

    const first = await resolveEffectiveTranscript(dataDir, noRoots, project);
    expect(first.source).toBe("youtube");
    expect(first.transcribable).toBe(false);
    expect(first.segments).toEqual([{ start: 0, end: 2, text: "hello from youtube" }]);
    expect(calls).toBe(1);

    const cachePath = path.join(dataDir, "transcripts", "aBcDeFgHiJk.json");
    expect(await pathExists(cachePath)).toBe(true);

    // Swap in a client that throws if ever invoked again — proves the second
    // resolve is served from the on-disk cache, not a second network call.
    __setInnertubeClientForTests(
      fakeClient({
        onGetInfo: () => {
          throw new Error("should not be called again — must be served from disk cache");
        },
      })
    );
    const second = await resolveEffectiveTranscript(dataDir, noRoots, project);
    expect(second.source).toBe("youtube");
    expect(second.segments).toEqual([{ start: 0, end: 2, text: "hello from youtube" }]);
  });

  it("pulls youtube captions for a true youtube-source project (videoId known directly, not derived from a filename)", async () => {
    const project = baseProject({
      id: "proj-youtube-source",
      source: { type: "youtube", videoId: "zzzzzzzzzzz", url: "https://youtu.be/zzzzzzzzzzz" },
      transcript: { type: "none" },
    });
    await writeProject(dataDir, project);
    __setInnertubeClientForTests(fakeClient({ segments: [{ start: 0, end: 1, text: "hi" }] }));

    const result = await resolveEffectiveTranscript(dataDir, noRoots, project);
    expect(result.source).toBe("youtube");
    expect(result.segments).toEqual([{ start: 0, end: 1, text: "hi" }]);
  });

  it("caches a youtube-pull failure for the session only (never re-fetches, never persists a negative cache file)", async () => {
    const videoPath = path.join(libDir, "20200101 - Lesson [nCaptionsHr].mp4");
    await fs.writeFile(videoPath, "fake video bytes");
    const project = baseProject({
      id: "proj-youtube-negative",
      source: { type: "local", path: videoPath },
      transcript: { type: "none" },
    });
    await writeProject(dataDir, project);

    let calls = 0;
    __setInnertubeClientForTests(fakeClient({ throwOnTranscript: true, onGetInfo: () => calls++ }));

    const first = await resolveEffectiveTranscript(dataDir, noRoots, project);
    expect(first.source).toBeNull();
    expect(first.transcribable).toBe(true);
    expect(first.segments).toEqual([]);
    expect(calls).toBe(1);

    const second = await resolveEffectiveTranscript(dataDir, noRoots, project);
    expect(second.transcribable).toBe(true);
    // Not re-attempted — negative cache is in-memory for the session.
    expect(calls).toBe(1);
    expect(await pathExists(path.join(dataDir, "transcripts", "nCaptionsHr.json"))).toBe(false);
  });

  it("step 4 (Phase 11 ASR cache) resolves when nothing else in the chain matched, and applies Phase 2 terms correction", async () => {
    const videoPath = path.join(libDir, "OpenGuardSeatedVolume2.mp4");
    await fs.writeFile(videoPath, "fake video bytes");
    const project = baseProject({
      id: "proj-asr",
      source: { type: "local", path: videoPath },
      transcript: { type: "none" },
    });
    await writeProject(dataDir, project);
    await writeTerms(dataDir, project.id, {
      "metro pro law": { correct: "metoprolol", source: "user", createdAt: new Date().toISOString() },
    });
    await writeAsrCache(dataDir, videoPath, [{ start: 0, end: 1, text: "give metro pro law now" }], "command");

    const result = await resolveEffectiveTranscript(dataDir, noRoots, project);
    expect(result.source).toBe("asr");
    expect(result.transcribable).toBe(false);
    expect(result.segments).toEqual([{ start: 0, end: 1, text: "give metoprolol now" }]);
  });

  it("step 4 (ASR cache) is skipped for a project with no local video path (nothing to key the cache by)", async () => {
    const project = baseProject({
      id: "proj-asr-youtube-source",
      source: { type: "youtube", videoId: "noCaptionsHere", url: "https://youtu.be/noCaptionsHere" },
      transcript: { type: "none" },
    });
    await writeProject(dataDir, project);
    __setInnertubeClientForTests(fakeClient({ throwOnTranscript: true }));

    const result = await resolveEffectiveTranscript(dataDir, noRoots, project);
    expect(result.transcribable).toBe(true);
    expect(result.source).toBeNull();
  });

  it("step 4 lives in the exact same <dataDir>/transcripts/ directory the youtube cache (step 3) uses", async () => {
    const videoPath = path.join(libDir, "another-lesson.mp4");
    await fs.writeFile(videoPath, "fake video bytes");
    await writeAsrCache(dataDir, videoPath, [{ start: 0, end: 1, text: "x" }], "endpoint");
    const cachePath = asrCachePath(dataDir, videoPath);
    expect(path.dirname(cachePath)).toBe(path.join(dataDir, "transcripts"));
    expect(await pathExists(cachePath)).toBe(true);
  });

  it("marks transcribable when no pipeline transcript, no sidecar, and no derivable youtube id exist", async () => {
    const videoPath = path.join(libDir, "OpenGuardSeatedVolume1.mp4");
    await fs.writeFile(videoPath, "fake video bytes");
    const project = baseProject({
      id: "proj-no-source",
      source: { type: "local", path: videoPath },
      transcript: { type: "none" },
    });
    await writeProject(dataDir, project);

    const result = await resolveEffectiveTranscript(dataDir, noRoots, project);
    expect(result).toEqual({ segments: [], source: null, transcribable: true });
  });
});

describe("transcriptSourceForDeclaredPath", () => {
  it("recognizes captions.json (pre-resolved youtube captions) as youtube provenance", () => {
    expect(transcriptSourceForDeclaredPath("captions.json")).toBe("youtube");
  });

  it("recognizes .srt/.vtt extensions as sidecar provenance", () => {
    expect(transcriptSourceForDeclaredPath("/lib/lesson.srt")).toBe("sidecar");
    expect(transcriptSourceForDeclaredPath("/lib/lesson.vtt")).toBe("sidecar");
  });

  it("defaults everything else (pipeline .json transcripts) to pipeline provenance", () => {
    expect(transcriptSourceForDeclaredPath("/transcripts/lesson.json")).toBe("pipeline");
  });
});
