import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  continuityForLocalProject,
  continuityForYoutubeProject,
  loadOwnConceptSignals,
  type YoutubeProject,
} from "../src/lib/continuityService.js";
import { __setInnertubeClientForTests, type InnertubeClient } from "../src/lib/innertube.js";
import { analysisJsonPath, projectDir, readTeacherScores } from "../src/lib/store.js";
import type { LibraryItem } from "../src/lib/scan.js";
import type { Weights } from "../src/lib/continuity.js";

const WEIGHTS: Weights = { related: 0.15, conceptSearch: 0.3, teacherValidation: 0.3, gapFill: 0.25 };

function youtubeProject(overrides: Partial<YoutubeProject> = {}): YoutubeProject {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    title: "Current Video",
    source: { type: "youtube", videoId: "self123", url: "https://www.youtube.com/watch?v=self123" },
    transcript: { type: "none" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastPosition: 0,
    watchedUpTo: 0,
    ...overrides,
  };
}

function searchVideoItem(videoId: string, title: string, author: string) {
  return {
    type: "Video",
    video_id: videoId,
    title: { text: title },
    author: { name: author },
  };
}

describe("continuityForYoutubeProject", () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-continuity-"));
  });

  afterEach(() => {
    __setInnertubeClientForTests(null);
  });

  it("degrades to related-only scoring when there's no analysis.json (no concept queries to run)", async () => {
    const search = async () => ({ results: [] });
    __setInnertubeClientForTests({ getInfo: async () => { throw new Error("unused"); }, search } as InnertubeClient);

    const project = youtubeProject({
      related: [
        { videoId: "rel1", title: "Related Video", author: "Someone", durationSeconds: 100 },
      ],
    });
    const result = await continuityForYoutubeProject(dataDir, project, WEIGHTS);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("youtube");
    expect(result[0].videoId).toBe("rel1");
    expect(result[0].reasons).toContain("related to current video");
  });

  it("excludes the current video itself from the related list", async () => {
    __setInnertubeClientForTests({ getInfo: async () => { throw new Error("unused"); }, search: async () => ({ results: [] }) } as InnertubeClient);
    const project = youtubeProject({
      related: [{ videoId: "self123", title: "Self", author: "Me" }, { videoId: "other", title: "Other", author: "Them" }],
    });
    const result = await continuityForYoutubeProject(dataDir, project, WEIGHTS);
    expect(result.map((c) => c.videoId)).toEqual(["other"]);
  });

  it("runs concept-search queries from analysis.json's concepts and persists a teacherScores.json update", async () => {
    const project = youtubeProject({ related: [] });
    await fs.mkdir(projectDir(dataDir, project.id), { recursive: true });
    await fs.writeFile(
      analysisJsonPath(dataDir, project.id),
      JSON.stringify({ version: 2, concepts: [{ id: "c1", title: "closed guard" }], themes: [] })
    );

    const search = async (query: string) => {
      if (query === "closed guard") {
        return { results: [searchVideoItem("teacherVid", "Closed Guard Basics", "Coach Teacher")] };
      }
      return { results: [] };
    };
    __setInnertubeClientForTests({ getInfo: async () => { throw new Error("unused"); }, search } as InnertubeClient);

    const result = await continuityForYoutubeProject(dataDir, project, WEIGHTS);
    expect(result.map((c) => c.videoId)).toContain("teacherVid");
    expect(result.find((c) => c.videoId === "teacherVid")!.reasons).toContain("teaches closed guard");

    const teacherScores = await readTeacherScores(dataDir);
    expect(teacherScores["Coach Teacher"]).toBeGreaterThan(0);
  });

  it("never throws when Innertube search rejects — degrades to whatever related contributed", async () => {
    const project = youtubeProject({ related: [{ videoId: "rel1", title: "Related", author: "Someone" }] });
    await fs.mkdir(projectDir(dataDir, project.id), { recursive: true });
    await fs.writeFile(analysisJsonPath(dataDir, project.id), JSON.stringify({ concepts: [{ title: "anything" }] }));
    __setInnertubeClientForTests({
      getInfo: async () => { throw new Error("unused"); },
      search: async () => { throw new Error("network blocked"); },
    } as InnertubeClient);

    const result = await continuityForYoutubeProject(dataDir, project, WEIGHTS);
    expect(result.map((c) => c.videoId)).toEqual(["rel1"]);
  });
});

describe("loadOwnConceptSignals", () => {
  let dataDir: string;
  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-continuity-signals-"));
  });

  it("returns empty signals when neither analysis.json nor attestations.json exist", async () => {
    const signals = await loadOwnConceptSignals(dataDir, "22222222-2222-2222-2222-222222222222");
    expect(signals).toEqual({ topConcepts: [], gapConcepts: [] });
  });

  it("reads topConcepts from analysis.json when present", async () => {
    const id = "33333333-3333-3333-3333-333333333333";
    await fs.mkdir(projectDir(dataDir, id), { recursive: true });
    await fs.writeFile(analysisJsonPath(dataDir, id), JSON.stringify({ concepts: [{ title: "concept one" }] }));
    const signals = await loadOwnConceptSignals(dataDir, id);
    expect(signals.topConcepts).toEqual(["concept one"]);
  });
});

describe("continuityForLocalProject", () => {
  function item(overrides: Partial<LibraryItem> = {}): LibraryItem {
    return { videoPath: "/lib/video.mp4", title: "Untitled", ...overrides };
  }

  it("excludes the project's own video from the library candidate pool", () => {
    const library = [item({ videoPath: "/lib/own.mp4", title: "Own Video About Closed Guard" }), item({ videoPath: "/lib/other.mp4", title: "Closed Guard Basics" })];
    const result = continuityForLocalProject(library, "/lib/own.mp4", ["closed guard"], WEIGHTS);
    expect(result.map((c) => c.videoId)).toEqual(["/lib/other.mp4"]);
  });

  it("returns [] when the project has no top concepts to match against", () => {
    const library = [item({ videoPath: "/lib/other.mp4", title: "Anything" })];
    expect(continuityForLocalProject(library, "/lib/own.mp4", [], WEIGHTS)).toEqual([]);
  });

  it("returns [] when nothing in the library overlaps the top concepts (hide when empty)", () => {
    const library = [item({ videoPath: "/lib/other.mp4", title: "Completely unrelated" })];
    expect(continuityForLocalProject(library, "/lib/own.mp4", ["kimura trap"], WEIGHTS)).toEqual([]);
  });

  it("marks results as kind: 'local' and carries videoPath/transcriptPath through", () => {
    const library = [item({ videoPath: "/lib/other.mp4", title: "Kimura Trap Setups", transcriptPath: "/lib/other.srt" })];
    const result = continuityForLocalProject(library, "/lib/own.mp4", ["kimura trap"], WEIGHTS);
    expect(result[0].kind).toBe("local");
    expect(result[0].videoPath).toBe("/lib/other.mp4");
    expect(result[0].transcriptPath).toBe("/lib/other.srt");
  });
});
