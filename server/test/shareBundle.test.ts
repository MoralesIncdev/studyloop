import { describe, expect, it } from "vitest";
import {
  buildShareBundle,
  buildSourceRef,
  detectSourceMismatch,
  overlayFileName,
  ShareBundleSchema,
  validateShareBundle,
  type ShareSourceRef,
} from "../src/lib/shareBundle.js";
import { shortHash } from "../src/lib/analysis.js";
import type { Bubble, Project } from "../src/lib/models.js";

function localProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Open Guard Seated — Volume 1",
    source: { type: "local", path: "/Volumes/Library/OpenGuardSeatedVolume1.mp4" },
    transcript: { type: "none" },
    createdAt: "2026-07-28T00:00:00Z",
    updatedAt: "2026-07-28T00:00:00Z",
    lastPosition: 0,
    watchedUpTo: 0,
    ...overrides,
  };
}

function youtubeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    title: "A YouTube lecture",
    source: { type: "youtube", videoId: "abc123", url: "https://youtu.be/abc123" },
    transcript: { type: "file", path: "captions.json" },
    createdAt: "2026-07-28T00:00:00Z",
    updatedAt: "2026-07-28T00:00:00Z",
    lastPosition: 0,
    watchedUpTo: 0,
    ...overrides,
  };
}

describe("buildSourceRef", () => {
  it("returns {type:'youtube', videoId, url} for a youtube project", () => {
    expect(buildSourceRef(youtubeProject(), null)).toEqual({ type: "youtube", videoId: "abc123", url: "https://youtu.be/abc123" });
  });

  it("returns {type:'local', filename, durationSeconds} for a local project", () => {
    expect(buildSourceRef(localProject(), 3600)).toEqual({
      type: "local",
      filename: "OpenGuardSeatedVolume1.mp4",
      durationSeconds: 3600,
    });
  });

  it("passes through a null duration when ffprobe couldn't resolve one", () => {
    const ref = buildSourceRef(localProject(), null);
    if (ref.type !== "local") throw new Error("unreachable");
    expect(ref.durationSeconds).toBeNull();
  });
});

describe("detectSourceMismatch", () => {
  it("returns null (no mismatch) for an identical youtube source", () => {
    const a: ShareSourceRef = { type: "youtube", videoId: "abc123" };
    const b: ShareSourceRef = { type: "youtube", videoId: "abc123" };
    expect(detectSourceMismatch(a, b)).toBeNull();
  });

  it("flags a different youtube videoId", () => {
    const a: ShareSourceRef = { type: "youtube", videoId: "abc123" };
    const b: ShareSourceRef = { type: "youtube", videoId: "xyz789" };
    expect(detectSourceMismatch(a, b)).toMatch(/different YouTube video/);
  });

  it("flags a type mismatch (youtube overlay onto a local project)", () => {
    const a: ShareSourceRef = { type: "youtube", videoId: "abc123" };
    const b: ShareSourceRef = { type: "local", filename: "video.mp4", durationSeconds: 100 };
    expect(detectSourceMismatch(a, b)).toMatch(/youtube source; this project is local/);
  });

  it("returns null for identical local filename+duration", () => {
    const a: ShareSourceRef = { type: "local", filename: "video.mp4", durationSeconds: 1000 };
    const b: ShareSourceRef = { type: "local", filename: "video.mp4", durationSeconds: 1002 };
    expect(detectSourceMismatch(a, b)).toBeNull(); // within 5s
  });

  it("flags a local filename mismatch", () => {
    const a: ShareSourceRef = { type: "local", filename: "a.mp4", durationSeconds: 100 };
    const b: ShareSourceRef = { type: "local", filename: "b.mp4", durationSeconds: 100 };
    expect(detectSourceMismatch(a, b)).toMatch(/differently-named file/);
  });

  it("flags a local duration differing by more than 5 seconds", () => {
    const a: ShareSourceRef = { type: "local", filename: "video.mp4", durationSeconds: 1000 };
    const b: ShareSourceRef = { type: "local", filename: "video.mp4", durationSeconds: 1010 };
    expect(detectSourceMismatch(a, b)).toMatch(/duration differs/);
  });

  it("does not flag a duration mismatch when either side's duration is unknown", () => {
    const a: ShareSourceRef = { type: "local", filename: "video.mp4", durationSeconds: null };
    const b: ShareSourceRef = { type: "local", filename: "video.mp4", durationSeconds: 5000 };
    expect(detectSourceMismatch(a, b)).toBeNull();
  });
});

describe("buildShareBundle / validateShareBundle round trip", () => {
  const bubbles: Bubble[] = [
    { id: "b1", t: 120, text: "great detail", shot: "shots/shot-120000.jpg", createdAt: "2026-07-28T00:00:00Z" },
    { id: "b2", t: 900, text: "no shot on this one", shot: null, createdAt: "2026-07-28T00:00:00Z" },
  ];

  it("round-trips export -> JSON.stringify -> validate -> matches the original bundle", async () => {
    const bundle = await buildShareBundle({
      project: localProject(),
      notes: "Some notes with a ^t:120 token.",
      bubbles,
      shareHandle: "ryan",
      localDurationSeconds: 3600,
      pearls: [{ t: 65, label: "Key detail", insight: "An insight.", importance: 3 }],
      concepts: [{ id: "concept-1", title: "Concept 1", summary: "s", body: "b", anchors: [{ t: 65 }] }],
      themes: [{ title: "Theme", body: "body" }],
      resolveThumbnail: async () => "ZmFrZS10aHVtYm5haWw=", // "fake-thumbnail" base64
    });

    expect(ShareBundleSchema.safeParse(bundle).success).toBe(true);

    const raw = JSON.stringify(bundle);
    const validated = validateShareBundle(raw);
    expect(validated.ok).toBe(true);
    if (!validated.ok) throw new Error("unreachable");
    expect(validated.bundle).toEqual(bundle);
  });

  it("thumbnails a bubble with a shot, and leaves a shot-less bubble's thumbnail null", async () => {
    const bundle = await buildShareBundle({
      project: localProject(),
      notes: "",
      bubbles,
      shareHandle: "ryan",
      localDurationSeconds: null,
      resolveThumbnail: async (shot) => (shot === "shots/shot-120000.jpg" ? "b64data" : null),
    });
    expect(bundle.bubbles.find((b) => b.id === "b1")?.thumbnailBase64).toBe("b64data");
    expect(bundle.bubbles.find((b) => b.id === "b2")?.thumbnailBase64).toBeNull();
  });

  it("never embeds the video bytes/path — only filename + duration for local sources", async () => {
    const bundle = await buildShareBundle({
      project: localProject(),
      notes: "",
      bubbles: [],
      shareHandle: "ryan",
      localDurationSeconds: 100,
      resolveThumbnail: async () => null,
    });
    expect(JSON.stringify(bundle)).not.toContain("/Volumes/Library");
  });

  it("V3-A: includes lessonSummary when the project has one, round-tripping through validate", async () => {
    const bundle = await buildShareBundle({
      project: localProject({ lessonSummary: "This lesson covered grip fighting." }),
      notes: "",
      bubbles: [],
      shareHandle: "ryan",
      localDurationSeconds: null,
      resolveThumbnail: async () => null,
    });
    expect(bundle.lessonSummary).toBe("This lesson covered grip fighting.");
    const raw = JSON.stringify(bundle);
    const validated = validateShareBundle(raw);
    expect(validated.ok).toBe(true);
    if (!validated.ok) throw new Error("unreachable");
    expect(validated.bundle.lessonSummary).toBe("This lesson covered grip fighting.");
  });

  it("V3-A: omits lessonSummary (undefined) when the project has none — still validates (optional field, bundle version stays 1)", async () => {
    const bundle = await buildShareBundle({
      project: localProject(),
      notes: "",
      bubbles: [],
      shareHandle: "ryan",
      localDurationSeconds: null,
      resolveThumbnail: async () => null,
    });
    expect(bundle.lessonSummary).toBeUndefined();
    expect(bundle.version).toBe(1);
    const raw = JSON.stringify(bundle);
    const validated = validateShareBundle(raw);
    expect(validated.ok).toBe(true);
  });

  it("defaults pearls/concepts/themes to [] when no analysis was passed", async () => {
    const bundle = await buildShareBundle({
      project: localProject(),
      notes: "",
      bubbles: [],
      shareHandle: "ryan",
      localDurationSeconds: null,
      resolveThumbnail: async () => null,
    });
    expect(bundle.pearls).toEqual([]);
    expect(bundle.concepts).toEqual([]);
    expect(bundle.themes).toEqual([]);
  });
});

describe("validateShareBundle — V3-A lessonSummary tolerance", () => {
  it("validates a legacy bundle JSON with no lessonSummary key at all (pre-V3-A export)", () => {
    const legacy = {
      version: 1,
      createdAt: "2026-07-28T00:00:00Z",
      shareHandle: "ryan",
      source: { type: "local", filename: "video.mp4", durationSeconds: 100 },
      title: "A pre-V3-A bundle",
      notes: "",
      bubbles: [],
      pearls: [],
      concepts: [],
      themes: [],
    };
    const result = validateShareBundle(JSON.stringify(legacy));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.bundle.lessonSummary).toBeUndefined();
  });
});

describe("validateShareBundle", () => {
  it("rejects invalid JSON", () => {
    const result = validateShareBundle("{not json");
    expect(result.ok).toBe(false);
  });

  it("rejects an unsupported version with a clear message", () => {
    const result = validateShareBundle(JSON.stringify({ version: 2 }));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toMatch(/Unsupported bundle version/);
  });

  it("rejects a well-formed-but-schema-invalid object", () => {
    const result = validateShareBundle(JSON.stringify({ version: 1, notAField: true }));
    expect(result.ok).toBe(false);
  });
});

describe("overlayFileName", () => {
  it("slugifies the handle and appends an 8-char content hash", () => {
    const name = overlayFileName("Ryan Morales", "{}", shortHash);
    expect(name).toBe(`ryan-morales-${shortHash("{}")}.studyloop.json`);
    expect(name).toMatch(/^[a-z0-9-]+-[0-9a-f]{8}\.studyloop\.json$/);
  });

  it("falls back to 'anonymous' for a handle with no alphanumeric characters", () => {
    const name = overlayFileName("###", "{}", shortHash);
    expect(name.startsWith("anonymous-")).toBe(true);
  });

  it("produces a different filename for different content (different hash)", () => {
    const a = overlayFileName("ryan", "content-a", shortHash);
    const b = overlayFileName("ryan", "content-b", shortHash);
    expect(a).not.toBe(b);
  });

  it("produces the same filename for identical handle+content (idempotent re-import)", () => {
    const a = overlayFileName("ryan", "same-content", shortHash);
    const b = overlayFileName("ryan", "same-content", shortHash);
    expect(a).toBe(b);
  });
});
