import { describe, expect, it } from "vitest";
import { ProjectIdParamSchema, ProjectSchema, RelatedVideoSchema } from "../src/lib/models.js";

describe("ProjectIdParamSchema", () => {
  it("accepts a real generated project id (UUID v4 shape)", () => {
    const result = ProjectIdParamSchema.safeParse({ id: "81025a1c-b04d-422c-8947-a1c302197d33" });
    expect(result.success).toBe(true);
  });

  it("rejects a plain traversal sequence", () => {
    const result = ProjectIdParamSchema.safeParse({ id: "../../etc/passwd" });
    expect(result.success).toBe(false);
  });

  it("rejects a URL-decoded traversal sequence (what `..%2F..%2Fetc%2Fpasswd` becomes once the router decodes it)", () => {
    const result = ProjectIdParamSchema.safeParse({ id: "..%2F..%2Fetc%2Fpasswd".replace(/%2F/gi, "/") });
    expect(result.success).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(ProjectIdParamSchema.safeParse({ id: "" }).success).toBe(false);
  });

  it("rejects a non-UUID plain identifier", () => {
    expect(ProjectIdParamSchema.safeParse({ id: "my-project" }).success).toBe(false);
  });
});

describe("RelatedVideoSchema (V2-B)", () => {
  it("accepts the full shape returned by innertube.ts's normalizeRelated/normalizeSearchResults", () => {
    const result = RelatedVideoSchema.safeParse({
      videoId: "abc123",
      title: "A related video",
      author: "Some Channel",
      durationSeconds: 204,
      viewCountText: "450K views",
      thumbnailUrl: "https://example.com/168.jpg",
    });
    expect(result.success).toBe(true);
  });

  it("accepts the minimal shape (only videoId/title/author required)", () => {
    expect(RelatedVideoSchema.safeParse({ videoId: "abc", title: "T", author: "" }).success).toBe(true);
  });

  it("rejects a negative durationSeconds", () => {
    expect(
      RelatedVideoSchema.safeParse({ videoId: "abc", title: "T", author: "A", durationSeconds: -1 }).success
    ).toBe(false);
  });

  it("rejects a missing videoId", () => {
    expect(RelatedVideoSchema.safeParse({ title: "T", author: "A" }).success).toBe(false);
  });
});

describe("ProjectSchema — related/author (V2-B persistence)", () => {
  function baseProject(overrides: Record<string, unknown> = {}) {
    return {
      id: "81025a1c-b04d-422c-8947-a1c302197d33",
      title: "A video",
      source: { type: "youtube", videoId: "abc123", url: "https://youtu.be/abc123" },
      transcript: { type: "none" },
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      lastPosition: 0,
      watchedUpTo: 0,
      ...overrides,
    };
  }

  it("accepts a project with author + a populated related list", () => {
    const result = ProjectSchema.safeParse(
      baseProject({
        author: "Some Channel",
        related: [{ videoId: "xyz", title: "Related", author: "Channel", thumbnailUrl: "https://x/y.jpg" }],
      })
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.author).toBe("Some Channel");
      expect(result.data.related).toHaveLength(1);
    }
  });

  it("still parses a project with neither field (pre-V2-B project.json / local sources)", () => {
    const result = ProjectSchema.safeParse(baseProject());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.author).toBeUndefined();
      expect(result.data.related).toBeUndefined();
    }
  });

  it("rejects a project whose related list contains an invalid entry", () => {
    const result = ProjectSchema.safeParse(baseProject({ related: [{ title: "missing videoId/author" }] }));
    expect(result.success).toBe(false);
  });
});
