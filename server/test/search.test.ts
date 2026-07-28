import { afterEach, describe, expect, it, vi } from "vitest";
import { performSearch, searchLibraryItems, SearchQuerySchema } from "../src/lib/search.js";
import { __setInnertubeClientForTests, type InnertubeClient } from "../src/lib/innertube.js";
import type { LibraryItem } from "../src/lib/scan.js";

describe("SearchQuerySchema", () => {
  it("accepts a normal query", () => {
    expect(SearchQuerySchema.safeParse({ q: "bjj" }).success).toBe(true);
  });

  it("rejects a missing q", () => {
    expect(SearchQuerySchema.safeParse({}).success).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(SearchQuerySchema.safeParse({ q: "" }).success).toBe(false);
  });

  it("rejects a query over 100 characters", () => {
    expect(SearchQuerySchema.safeParse({ q: "a".repeat(101) }).success).toBe(false);
  });

  it("accepts exactly 1 and exactly 100 characters", () => {
    expect(SearchQuerySchema.safeParse({ q: "a" }).success).toBe(true);
    expect(SearchQuerySchema.safeParse({ q: "a".repeat(100) }).success).toBe(true);
  });

  it("rejects a non-string q", () => {
    expect(SearchQuerySchema.safeParse({ q: 5 }).success).toBe(false);
  });
});

function item(overrides: Partial<LibraryItem> = {}): LibraryItem {
  return { videoPath: "/lib/video.mp4", title: "Untitled", ...overrides };
}

describe("searchLibraryItems", () => {
  const items: LibraryItem[] = [
    item({ videoPath: "/a.mp4", title: "Closed Guard Fundamentals", instructor: "Gordon Ryan" }),
    item({ videoPath: "/b.mp4", title: "Leg Locks 101", instructor: "John Danaher", series: "Enter the System" }),
    item({ videoPath: "/c.mp4", title: "Standing Passing", instructor: "Someone Else" }),
  ];

  it("matches case-insensitively on title", () => {
    expect(searchLibraryItems(items, "closed GUARD").map((i) => i.videoPath)).toEqual(["/a.mp4"]);
  });

  it("matches on instructor", () => {
    expect(searchLibraryItems(items, "danaher").map((i) => i.videoPath)).toEqual(["/b.mp4"]);
  });

  it("matches on series", () => {
    expect(searchLibraryItems(items, "enter the system").map((i) => i.videoPath)).toEqual(["/b.mp4"]);
  });

  it("returns [] for an empty/whitespace query", () => {
    expect(searchLibraryItems(items, "")).toEqual([]);
    expect(searchLibraryItems(items, "   ")).toEqual([]);
  });

  it("returns [] when nothing matches", () => {
    expect(searchLibraryItems(items, "nonexistent-topic")).toEqual([]);
  });
});

describe("performSearch", () => {
  afterEach(() => {
    __setInnertubeClientForTests(null);
  });

  it("merges library matches with youtube search results", async () => {
    const items: LibraryItem[] = [item({ videoPath: "/a.mp4", title: "Kurzgesagt-style animation" })];
    const search = vi.fn().mockResolvedValue({
      results: [{ type: "Video", video_id: "abc", title: { text: "Kurzgesagt video" }, author: { name: "Kurzgesagt" } }],
    });
    const client: InnertubeClient = { getInfo: vi.fn(), search };
    __setInnertubeClientForTests(client);

    const result = await performSearch(items, "kurzgesagt");
    expect(result.library).toHaveLength(1);
    expect(result.youtube).toHaveLength(1);
    expect(result.youtube[0].videoId).toBe("abc");
  });

  it("youtube section is [] (not an error) when Innertube fails — library results still return", async () => {
    const items: LibraryItem[] = [item({ videoPath: "/a.mp4", title: "Some local video" })];
    const client: InnertubeClient = { getInfo: vi.fn(), search: vi.fn().mockRejectedValue(new Error("blocked")) };
    __setInnertubeClientForTests(client);

    const result = await performSearch(items, "some");
    expect(result.library).toHaveLength(1);
    expect(result.youtube).toEqual([]);
  });
});
