import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __setInnertubeClientForTests,
  normalizeCaptions,
  normalizeRelated,
  normalizeSearchResults,
  parseDurationText,
  preferManualTranscript,
  relatedFor,
  resolveVideo,
  searchYoutube,
  type InnertubeClient,
  type RawRelatedItem,
  type RawSearchVideoItem,
  type RawTranscriptInfo,
  type RawVideoInfo,
} from "../src/lib/innertube.js";

// A fixture matching youtubei.js v17.2.0's real TranscriptSegment /
// TranscriptSegmentList / TranscriptSearchPanel / Transcript class shapes
// (node_modules/youtubei.js/dist/src/parser/classes/Transcript*.d.ts) — the
// live get_transcript endpoint 400s in this sandbox's network egress for
// every video tried (a concrete instance of the "API drift/network block"
// degradation this module is built to survive), so this fixture was built by
// reading the generated parser classes directly rather than capturing a live
// response. Field names/nesting match exactly; only the values are synthetic.
function transcriptFixture(): RawTranscriptInfo {
  return {
    languages: ["English", "English (auto-generated)"],
    selectedLanguage: "English",
    transcript: {
      content: {
        body: {
          initial_segments: [
            { type: "TranscriptSegment", start_ms: "0", end_ms: "2500", snippet: { text: "Welcome back" } },
            { type: "TranscriptSectionHeader" }, // interleaved section header — must be skipped, not crash normalization
            { type: "TranscriptSegment", start_ms: "2500", end_ms: "5000", snippet: { text: "to the video" } },
          ],
        },
      },
    },
  };
}

describe("normalizeCaptions", () => {
  it("extracts start/end/text from TranscriptSegment nodes, converting ms to seconds", () => {
    expect(normalizeCaptions(transcriptFixture())).toEqual([
      { start: 0, end: 2.5, text: "Welcome back" },
      { start: 2.5, end: 5, text: "to the video" },
    ]);
  });

  it("skips TranscriptSectionHeader nodes interleaved among segments", () => {
    const segments = normalizeCaptions(transcriptFixture());
    expect(segments).toHaveLength(2);
  });

  it("returns null when there are no initial_segments", () => {
    expect(normalizeCaptions({ transcript: { content: { body: { initial_segments: [] } } } })).toBeNull();
  });

  it("returns null when the response shape is missing entirely (API drift)", () => {
    expect(normalizeCaptions({})).toBeNull();
    expect(normalizeCaptions(null)).toBeNull();
    expect(normalizeCaptions(undefined)).toBeNull();
  });

  it("drops segments with no text or unparseable timing rather than throwing", () => {
    const fixture: RawTranscriptInfo = {
      transcript: {
        content: {
          body: {
            initial_segments: [
              { type: "TranscriptSegment", start_ms: "0", end_ms: "1000", snippet: { text: "  " } },
              { type: "TranscriptSegment", start_ms: "not-a-number", end_ms: "1000", snippet: { text: "hi" } },
              { type: "TranscriptSegment", start_ms: "1000", end_ms: "2000", snippet: { text: "kept" } },
            ],
          },
        },
      },
    };
    expect(normalizeCaptions(fixture)).toEqual([{ start: 1, end: 2, text: "kept" }]);
  });
});

describe("preferManualTranscript", () => {
  it("switches to the manual track when the auto-generated one is selected by default", async () => {
    const manualResult: RawTranscriptInfo = { selectedLanguage: "English", transcript: { content: null } };
    const selectLanguage = vi.fn().mockResolvedValue(manualResult);
    const info: RawTranscriptInfo = {
      languages: ["English", "English (auto-generated)"],
      selectedLanguage: "English (auto-generated)",
      selectLanguage,
    };
    const result = await preferManualTranscript(info);
    expect(selectLanguage).toHaveBeenCalledWith("English");
    expect(result).toBe(manualResult);
  });

  it("leaves a manual selection alone", async () => {
    const selectLanguage = vi.fn();
    const info: RawTranscriptInfo = {
      languages: ["English", "English (auto-generated)"],
      selectedLanguage: "English",
      selectLanguage,
    };
    const result = await preferManualTranscript(info);
    expect(selectLanguage).not.toHaveBeenCalled();
    expect(result).toBe(info);
  });

  it("stays on auto-generated when it's the only track available", async () => {
    const selectLanguage = vi.fn();
    const info: RawTranscriptInfo = {
      languages: ["English (auto-generated)"],
      selectedLanguage: "English (auto-generated)",
      selectLanguage,
    };
    const result = await preferManualTranscript(info);
    expect(selectLanguage).not.toHaveBeenCalled();
    expect(result).toBe(info);
  });

  it("falls back to the original transcript if selectLanguage rejects", async () => {
    const info: RawTranscriptInfo = {
      languages: ["English", "English (auto-generated)"],
      selectedLanguage: "English (auto-generated)",
      selectLanguage: vi.fn().mockRejectedValue(new Error("nope")),
    };
    const result = await preferManualTranscript(info);
    expect(result).toBe(info);
  });
});

describe("parseDurationText", () => {
  it("parses mm:ss", () => {
    expect(parseDurationText("3:24")).toBe(204);
  });
  it("parses h:mm:ss", () => {
    expect(parseDurationText("1:00:14")).toBe(3614);
  });
  it("returns undefined for empty/missing input", () => {
    expect(parseDurationText(undefined)).toBeUndefined();
    expect(parseDurationText(null)).toBeUndefined();
    expect(parseDurationText("")).toBeUndefined();
  });
  it("returns undefined for unparseable input", () => {
    expect(parseDurationText("LIVE")).toBeUndefined();
  });
});

// Fixture shape verified against LockupView/LockupMetadataView/ContentMetadataView
// (node_modules/youtubei.js/dist/src/parser/classes/LockupView.d.ts et al.).
function relatedItemFixture(overrides: Partial<RawRelatedItem> = {}): RawRelatedItem {
  return {
    content_type: "VIDEO",
    content_id: "abc123",
    metadata: {
      title: { text: "A related video" },
      metadata: {
        metadata_rows: [
          { metadata_parts: [{ text: { text: "Some Channel" } }] },
          { metadata_parts: [{ text: { text: "450K views" } }] },
        ],
      },
    },
    content_image: {
      image: [
        { url: "https://example.com/336.jpg", width: 336 },
        { url: "https://example.com/168.jpg", width: 168 },
      ],
      overlays: [{ badges: [{ text: "3:24" }] }],
    },
    ...overrides,
  };
}

describe("normalizeRelated", () => {
  it("extracts videoId/title/author/duration/viewCount/thumbnail from a LockupView video item", () => {
    expect(normalizeRelated([relatedItemFixture()])).toEqual([
      {
        videoId: "abc123",
        title: "A related video",
        author: "Some Channel",
        durationSeconds: 204,
        viewCountText: "450K views",
        thumbnailUrl: "https://example.com/168.jpg",
      },
    ]);
  });

  it("skips non-VIDEO lockup items (playlists, channels, shorts)", () => {
    expect(normalizeRelated([relatedItemFixture({ content_type: "PLAYLIST" })])).toEqual([]);
  });

  it("skips items with no title", () => {
    expect(normalizeRelated([relatedItemFixture({ metadata: { title: undefined, metadata: null } })])).toEqual([]);
  });

  it("returns [] for null/undefined/empty input", () => {
    expect(normalizeRelated(null)).toEqual([]);
    expect(normalizeRelated(undefined)).toEqual([]);
    expect(normalizeRelated([])).toEqual([]);
  });

  it("respects the limit", () => {
    const items = Array.from({ length: 5 }, (_, i) => relatedItemFixture({ content_id: `id-${i}` }));
    expect(normalizeRelated(items, 2)).toHaveLength(2);
  });
});

function searchVideoFixture(overrides: Partial<RawSearchVideoItem> = {}): RawSearchVideoItem {
  return {
    type: "Video",
    video_id: "xyz789",
    title: { text: "A search result" },
    author: { name: "Some Channel" },
    length_text: { text: "6:16" },
    thumbnails: [{ url: "https://example.com/small.jpg", width: 168 }],
    ...overrides,
  };
}

describe("normalizeSearchResults", () => {
  it("extracts videoId/title/author/duration/thumbnail from a search Video item", () => {
    expect(normalizeSearchResults([searchVideoFixture()])).toEqual([
      {
        videoId: "xyz789",
        title: "A search result",
        author: "Some Channel",
        durationSeconds: 376,
        thumbnailUrl: "https://example.com/small.jpg",
      },
    ]);
  });

  it("skips non-Video results (channels, playlists, shelves)", () => {
    expect(normalizeSearchResults([searchVideoFixture({ type: "Channel" })])).toEqual([]);
  });
});

// --- Cache + timeout behavior, via an injected fake client ------------------

function fakeVideoInfo(overrides: Partial<RawVideoInfo> = {}): RawVideoInfo {
  return {
    basic_info: { title: "Fake title", author: "Fake author", duration: 120 },
    watch_next_feed: [],
    getTranscript: vi.fn().mockResolvedValue({ transcript: { content: null } }),
    ...overrides,
  };
}

describe("resolveVideo (injected fake client)", () => {
  afterEach(() => {
    __setInnertubeClientForTests(null);
  });

  it("calls the client once and serves subsequent calls for the same videoId from cache", async () => {
    const getInfo = vi.fn().mockResolvedValue(fakeVideoInfo());
    const client: InnertubeClient = { getInfo, search: vi.fn() };
    __setInnertubeClientForTests(client);

    const first = await resolveVideo("vid-1");
    const second = await resolveVideo("vid-1");

    expect(getInfo).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(first.title).toBe("Fake title");
    expect(first.author).toBe("Fake author");
    expect(first.durationSeconds).toBe(120);
  });

  it("calls the client again for a different videoId", async () => {
    const getInfo = vi.fn().mockResolvedValue(fakeVideoInfo());
    const client: InnertubeClient = { getInfo, search: vi.fn() };
    __setInnertubeClientForTests(client);

    await resolveVideo("vid-1");
    await resolveVideo("vid-2");
    expect(getInfo).toHaveBeenCalledTimes(2);
  });

  it("bypassCache forces a fresh call even within the TTL", async () => {
    const getInfo = vi.fn().mockResolvedValue(fakeVideoInfo());
    const client: InnertubeClient = { getInfo, search: vi.fn() };
    __setInnertubeClientForTests(client);

    await resolveVideo("vid-1");
    await resolveVideo("vid-1", { bypassCache: true });
    expect(getInfo).toHaveBeenCalledTimes(2);
  });

  it("resolves to the all-null/empty shape (never throws) when the client rejects", async () => {
    const getInfo = vi.fn().mockRejectedValue(new Error("network blocked"));
    const client: InnertubeClient = { getInfo, search: vi.fn() };
    __setInnertubeClientForTests(client);

    const result = await resolveVideo("vid-fail");
    expect(result).toEqual({ title: null, author: null, durationSeconds: null, captions: null, related: [] });
  });

  it("does not cache a failed resolve — the next call retries the client", async () => {
    const getInfo = vi.fn().mockRejectedValueOnce(new Error("blip")).mockResolvedValueOnce(fakeVideoInfo());
    const client: InnertubeClient = { getInfo, search: vi.fn() };
    __setInnertubeClientForTests(client);

    const first = await resolveVideo("vid-retry");
    expect(first.title).toBeNull();
    const second = await resolveVideo("vid-retry");
    expect(second.title).toBe("Fake title");
    expect(getInfo).toHaveBeenCalledTimes(2);
  });

  it("a transcript-fetch failure still yields the rest of the resolved fields (captions: null, not a full failure)", async () => {
    const getInfo = vi.fn().mockResolvedValue(
      fakeVideoInfo({ getTranscript: vi.fn().mockRejectedValue(new Error("get_transcript 400")) })
    );
    const client: InnertubeClient = { getInfo, search: vi.fn() };
    __setInnertubeClientForTests(client);

    const result = await resolveVideo("vid-no-captions");
    expect(result.title).toBe("Fake title");
    expect(result.captions).toBeNull();
  });

  it("falls back to basic_info.channel.name when basic_info.author is absent", async () => {
    const getInfo = vi.fn().mockResolvedValue(
      fakeVideoInfo({ basic_info: { title: "T", duration: 1, channel: { name: "Channel Fallback" } } })
    );
    const client: InnertubeClient = { getInfo, search: vi.fn() };
    __setInnertubeClientForTests(client);

    const result = await resolveVideo("vid-channel-fallback");
    expect(result.author).toBe("Channel Fallback");
  });
});

describe("relatedFor", () => {
  afterEach(() => {
    __setInnertubeClientForTests(null);
  });

  it("returns just the related list from a resolveVideo call", async () => {
    const related = [relatedItemFixture()];
    const getInfo = vi.fn().mockResolvedValue(fakeVideoInfo({ watch_next_feed: related }));
    __setInnertubeClientForTests({ getInfo, search: vi.fn() });

    const result = await relatedFor("vid-1");
    expect(result).toEqual(normalizeRelated(related));
  });
});

describe("searchYoutube (injected fake client)", () => {
  afterEach(() => {
    __setInnertubeClientForTests(null);
  });

  it("caches by query+limit and only calls the client once", async () => {
    const search = vi.fn().mockResolvedValue({ results: [searchVideoFixture()] });
    __setInnertubeClientForTests({ getInfo: vi.fn(), search });

    const first = await searchYoutube("kurzgesagt");
    const second = await searchYoutube("kurzgesagt");
    expect(search).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(first).toHaveLength(1);
  });

  it("resolves to [] (never throws) when the client rejects — the query shows library-only results", async () => {
    const search = vi.fn().mockRejectedValue(new Error("network blocked"));
    __setInnertubeClientForTests({ getInfo: vi.fn(), search });

    const result = await searchYoutube("anything");
    expect(result).toEqual([]);
  });
});
