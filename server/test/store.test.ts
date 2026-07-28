import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  nextWatchedUpTo,
  projectDir,
  readBubbles,
  readProject,
  withProjectLock,
  writeBubbles,
  writeProject,
} from "../src/lib/store.js";
import type { Bubble, Project } from "../src/lib/models.js";

describe("projectDir traversal guard", () => {
  const dataDir = "/tmp/studyloop-data-dir-fixture";

  it("resolves a plain id (or UUID) inside <dataDir>/projects", () => {
    expect(projectDir(dataDir, "81025a1c-b04d-422c-8947-a1c302197d33")).toBe(
      path.join(dataDir, "projects", "81025a1c-b04d-422c-8947-a1c302197d33")
    );
  });

  it("throws for an id containing a traversal sequence that would escape <dataDir>/projects", () => {
    expect(() => projectDir(dataDir, "../../etc/passwd")).toThrow();
  });

  it("throws for a decoded `..%2F..%2Fetc%2Fpasswd`-style id (what a router hands the app once it decodes %2F)", () => {
    expect(() => projectDir(dataDir, "../../etc/passwd".split("/").join("/"))).toThrow();
    expect(() => projectDir(dataDir, "..//..//etc//passwd")).toThrow();
  });

  it("throws for an id that is itself an absolute path (would otherwise bypass the projects root entirely)", () => {
    expect(() => projectDir(dataDir, "/etc/passwd")).toThrow();
  });
});

describe("nextWatchedUpTo", () => {
  it("advances when the patch value is higher than the existing value", () => {
    expect(nextWatchedUpTo(100, 150)).toBe(150);
  });

  it("stays put when the patch value is lower (never moves backwards)", () => {
    expect(nextWatchedUpTo(150, 100)).toBe(150);
  });

  it("stays put when no patch value was provided", () => {
    expect(nextWatchedUpTo(150, undefined)).toBe(150);
  });

  it("is idempotent at equal values", () => {
    expect(nextWatchedUpTo(100, 100)).toBe(100);
  });
});

describe("withProjectLock", () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-store-"));
  });

  afterEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  async function seedProject(id: string): Promise<void> {
    const now = new Date().toISOString();
    const project: Project = {
      id,
      title: "Test project",
      source: { type: "local", path: "/tmp/video.mp4" },
      transcript: { type: "none" },
      createdAt: now,
      updatedAt: now,
      lastPosition: 0,
      watchedUpTo: 0,
    };
    await writeProject(dataDir, project);
  }

  /** Mirrors exactly what POST /api/projects/:id/bubbles does: read-modify-write under the lock. */
  async function appendBubbleLocked(id: string, text: string): Promise<Bubble> {
    return withProjectLock(id, async () => {
      const bubbles = await readBubbles(dataDir, id);
      const bubble: Bubble = { id: `${text}-${bubbles.length}`, t: bubbles.length, text, createdAt: new Date().toISOString() };
      bubbles.push(bubble);
      // Yield to the event loop so a competing call that skipped the lock
      // would have a real chance to interleave its own read here.
      await new Promise((resolve) => setTimeout(resolve, 5));
      await writeBubbles(dataDir, id, bubbles);
      return bubble;
    });
  }

  it("serializes two concurrent read-modify-write operations so both survive", async () => {
    const id = "proj-concurrent";
    await seedProject(id);

    // Fire both "requests" without awaiting between them, the way two
    // near-simultaneous HTTP POSTs would arrive at the route handler.
    const [a, b] = await Promise.all([appendBubbleLocked(id, "first"), appendBubbleLocked(id, "second")]);

    expect(a.text).toBe("first");
    expect(b.text).toBe("second");

    const finalBubbles = await readBubbles(dataDir, id);
    // Without the lock, the second write's read-before-modify would race the
    // first and one bubble would silently disappear (lost update).
    expect(finalBubbles).toHaveLength(2);
    expect(finalBubbles.map((x) => x.text).sort()).toEqual(["first", "second"]);
  });

  it("runs many concurrent appends against the same project without losing any", async () => {
    const id = "proj-many";
    await seedProject(id);
    const N = 10;
    await Promise.all(Array.from({ length: N }, (_, i) => appendBubbleLocked(id, `bubble-${i}`)));
    const finalBubbles = await readBubbles(dataDir, id);
    expect(finalBubbles).toHaveLength(N);
  });

  it("does not serialize operations against different projects", async () => {
    await seedProject("proj-x");
    await seedProject("proj-y");
    const start = Date.now();
    await Promise.all([
      withProjectLock("proj-x", () => new Promise((resolve) => setTimeout(resolve, 40))),
      withProjectLock("proj-y", () => new Promise((resolve) => setTimeout(resolve, 40))),
    ]);
    const elapsed = Date.now() - start;
    // If these were incorrectly serialized against a shared (not per-project) lock,
    // this would take ~80ms; run concurrently it should take ~40ms.
    expect(elapsed).toBeLessThan(75);
  });

  it("a rejected operation doesn't poison the lock for the next waiter on the same project", async () => {
    const id = "proj-error";
    await seedProject(id);
    await expect(
      withProjectLock(id, async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    // The lock must still be usable afterwards.
    const result = await withProjectLock(id, async () => "ok");
    expect(result).toBe("ok");
  });
});

describe("writeProject/readProject — related/author round-trip (V2-B)", () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-related-"));
  });

  afterEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it("persists and reloads a youtube project's author + related list", async () => {
    const id = "yt-project";
    const now = new Date().toISOString();
    const project: Project = {
      id,
      title: "A YouTube video",
      source: { type: "youtube", videoId: "abc123", url: "https://youtu.be/abc123" },
      transcript: { type: "file", path: "captions.json" },
      createdAt: now,
      updatedAt: now,
      lastPosition: 0,
      watchedUpTo: 0,
      author: "Some Channel",
      related: [
        { videoId: "r1", title: "Related one", author: "Channel A", durationSeconds: 204 },
        { videoId: "r2", title: "Related two", author: "Channel B", thumbnailUrl: "https://x/y.jpg" },
      ],
    };
    await writeProject(dataDir, project);

    const reloaded = await readProject(dataDir, id);
    expect(reloaded?.author).toBe("Some Channel");
    expect(reloaded?.related).toEqual(project.related);
  });

  it("round-trips a project with no related/author (local source) without introducing empty defaults", async () => {
    const id = "local-project";
    const now = new Date().toISOString();
    const project: Project = {
      id,
      title: "A local video",
      source: { type: "local", path: "/tmp/video.mp4" },
      transcript: { type: "none" },
      createdAt: now,
      updatedAt: now,
      lastPosition: 0,
      watchedUpTo: 0,
    };
    await writeProject(dataDir, project);
    const reloaded = await readProject(dataDir, id);
    expect(reloaded?.author).toBeUndefined();
    expect(reloaded?.related).toBeUndefined();
  });
});

describe("readProject watchedUpTo migration", () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-migration-"));
  });

  afterEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it("defaults watchedUpTo to lastPosition when reading a pre-migration project.json", async () => {
    const id = "legacy-project";
    const legacyProjectDir = path.join(dataDir, "projects", id);
    await fs.mkdir(legacyProjectDir, { recursive: true });
    const legacyRaw = {
      id,
      title: "Legacy project",
      source: { type: "local", path: "/tmp/video.mp4" },
      transcript: { type: "none" },
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      lastPosition: 842.5,
      // no watchedUpTo field at all — simulates a project.json written before this field existed.
    };
    await fs.writeFile(path.join(legacyProjectDir, "project.json"), JSON.stringify(legacyRaw));

    const project = await readProject(dataDir, id);
    expect(project?.watchedUpTo).toBe(842.5);
    expect(project?.lastPosition).toBe(842.5);
  });

  it("respects an explicit watchedUpTo when present, even if lower than lastPosition", async () => {
    // Not physically expected in practice (server enforces monotonicity on
    // write), but readProject shouldn't second-guess an on-disk value that's
    // already explicitly set.
    const id = "explicit-project";
    const dir = path.join(dataDir, "projects", id);
    await fs.mkdir(dir, { recursive: true });
    const raw = {
      id,
      title: "Explicit project",
      source: { type: "local", path: "/tmp/video.mp4" },
      transcript: { type: "none" },
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      lastPosition: 500,
      watchedUpTo: 300,
    };
    await fs.writeFile(path.join(dir, "project.json"), JSON.stringify(raw));
    const project = await readProject(dataDir, id);
    expect(project?.watchedUpTo).toBe(300);
  });

  it("returns null (not the file's contents) when the requested id doesn't match project.json's own id field", async () => {
    // Defense in depth: even if a project.json somehow ended up readable
    // under a directory name that doesn't match its own `id` field, readProject
    // must not trust the directory name over the file's declared identity.
    const dirId = "requested-id";
    const dir = path.join(dataDir, "projects", dirId);
    await fs.mkdir(dir, { recursive: true });
    const raw = {
      id: "a-completely-different-id",
      title: "Mismatched project",
      source: { type: "local", path: "/tmp/video.mp4" },
      transcript: { type: "none" },
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      lastPosition: 0,
      watchedUpTo: 0,
    };
    await fs.writeFile(path.join(dir, "project.json"), JSON.stringify(raw));
    const project = await readProject(dataDir, dirId);
    expect(project).toBeNull();
  });
});
