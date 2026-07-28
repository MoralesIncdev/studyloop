import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveTranscriptPath } from "../src/lib/transcriptResolve.js";
import { writeCaptions, writeProject } from "../src/lib/store.js";
import type { Project } from "../src/lib/models.js";

describe("resolveTranscriptPath", () => {
  let dataDir: string;
  const projectId = "proj-1";

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-transcript-resolve-"));
    const now = new Date().toISOString();
    const project: Project = {
      id: projectId,
      title: "Test",
      source: { type: "youtube", videoId: "abc123", url: "https://youtu.be/abc123" },
      transcript: { type: "file", path: "captions.json" },
      createdAt: now,
      updatedAt: now,
      lastPosition: 0,
      watchedUpTo: 0,
    };
    await writeProject(dataDir, project);
  });

  afterEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  const noRoots = { libraryRoots: [], transcriptRoots: [], conceptDocs: [] };

  it("resolves a project-relative path inside that project's directory when projectId is given", async () => {
    await writeCaptions(dataDir, projectId, [{ start: 0, end: 1, text: "hi" }]);
    const result = await resolveTranscriptPath(dataDir, noRoots, "captions.json", projectId);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.filePath).toBe(path.join(dataDir, "projects", projectId, "captions.json"));
    }
  });

  it("rejects a project-relative path that traverses outside the project directory", async () => {
    const result = await resolveTranscriptPath(dataDir, noRoots, "../other-project/secret.json", projectId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("404s when projectId doesn't correspond to an existing project", async () => {
    const result = await resolveTranscriptPath(dataDir, noRoots, "captions.json", "does-not-exist");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
  });

  it("falls back to the root-allowlist guard for an absolute path, even with projectId set", async () => {
    // A local project's transcript path is always absolute — projectId being
    // present must not route it through project-relative resolution.
    const outsidePath = path.join(dataDir, "not-a-project-dir", "transcript.json");
    const result = await resolveTranscriptPath(dataDir, noRoots, outsidePath, projectId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("allows an absolute path inside a configured root, with no projectId", async () => {
    const transcriptRoot = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-transcript-root-"));
    try {
      const filePath = path.join(transcriptRoot, "lesson.json");
      const result = await resolveTranscriptPath(
        dataDir,
        { libraryRoots: [], transcriptRoots: [transcriptRoot], conceptDocs: [] },
        filePath,
        undefined
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.filePath).toBe(filePath);
    } finally {
      await fs.rm(transcriptRoot, { recursive: true, force: true });
    }
  });

  it("rejects a relative path when no projectId is given", async () => {
    const result = await resolveTranscriptPath(dataDir, noRoots, "captions.json", undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });
});
