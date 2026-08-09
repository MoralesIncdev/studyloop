// Phase 1 "Ingestion pipeline repair" (PIPE-01): the first route-level test
// in this repo. `server/src/lib/slides.ts:38-42` documents the repo's
// lib-only testing convention ("this repo's routes/*.ts files aren't
// otherwise unit-tested"); this file deliberately departs from that, because
// `POST /api/youtube/resolve`'s branching (innertube fast path -> yt-dlp
// caption fallback -> full legacy fallback -> ytdlpMissing degradation) only
// exists at the route layer (server/src/routes/youtube.ts:40-84) — lib-level
// tests of resolveVideo/resolveYoutube individually can't prove the route
// wires them together correctly, which is exactly what the 2026-08-08 proof
// run found broken (caption fallback never fired). Bootstrap follows
// Fastify's own documented register-one-plugin-then-inject pattern (no
// existing route-test precedent in this repo to copy from instead).
import { afterEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { youtubeRoutes } from "../src/routes/youtube.js";
import {
  __setInnertubeClientForTests,
  type InnertubeClient,
  type RawTranscriptInfo,
  type RawVideoInfo,
} from "../src/lib/innertube.js";
import { __setResolveYoutubeForTests, type YoutubeMetadata } from "../src/lib/ytdlp.js";

// Matches innertube.test.ts's transcriptFixture() — a real youtubei.js v17.2.0
// TranscriptSegment tree shape, so the fast-path test below exercises the
// real normalizeCaptions() logic rather than hand-feeding a segment array.
function transcriptFixture(): RawTranscriptInfo {
  return {
    languages: ["English"],
    selectedLanguage: "English",
    transcript: {
      content: {
        body: {
          initial_segments: [
            { type: "TranscriptSegment", start_ms: "0", end_ms: "3000", snippet: { text: "Segment one" } },
            { type: "TranscriptSegment", start_ms: "3000", end_ms: "6000", snippet: { text: "Segment two" } },
          ],
        },
      },
    },
  };
}

/** Builds a fake InnertubeClient. Defaults: title set, transcript rejects (metadata-only), search unused. */
function fakeInnertube(overrides: Partial<RawVideoInfo> = {}): InnertubeClient {
  const getInfo = async (): Promise<RawVideoInfo> => ({
    basic_info: { title: "Fake Lecture Title", author: "Fake Author", duration: 600 },
    watch_next_feed: [],
    getTranscript: async () => {
      throw new Error("get_transcript 400 (simulated network block)");
    },
    ...overrides,
  });
  return {
    getInfo,
    search: async () => {
      throw new Error("search unused in these tests");
    },
  };
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(youtubeRoutes);
  await app.ready();
  return app;
}

describe("POST /api/youtube/resolve", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    __setInnertubeClientForTests(null);
    __setResolveYoutubeForTests(null);
    if (app) await app.close();
  });

  describe("innertube metadata-only, yt-dlp caption fallback succeeds", () => {
    it("returns 200 with the innertube title and the yt-dlp fallback's captions, calling resolveYoutube exactly once", async () => {
      app = await buildApp();
      __setInnertubeClientForTests(fakeInnertube());

      let callCount = 0;
      const fallbackCaptions: YoutubeMetadata = {
        videoId: "fallbackVidId",
        title: "yt-dlp title (unused — innertube title wins)",
        captions: [
          { start: 0, end: 2, text: "First caption segment" },
          { start: 2, end: 4, text: "Second caption segment" },
        ],
      };
      __setResolveYoutubeForTests(async () => {
        callCount += 1;
        return fallbackCaptions;
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/youtube/resolve",
        payload: { url: "https://www.youtube.com/watch?v=fallbackVidId" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.title).toBe("Fake Lecture Title");
      expect(body.captions).toHaveLength(2);
      expect(body.captions).toEqual(fallbackCaptions.captions);
      expect(callCount).toBe(1);
    });
  });

  describe("bad host (threat T-01-02 regression guard)", () => {
    it("answers 400 without reaching either adapter for a non-YouTube host", async () => {
      app = await buildApp();
      let innertubeCalled = false;
      let ytdlpCalled = false;
      __setInnertubeClientForTests({
        getInfo: async () => {
          innertubeCalled = true;
          throw new Error("should never be called");
        },
        search: async () => {
          throw new Error("unused");
        },
      });
      __setResolveYoutubeForTests(async () => {
        ytdlpCalled = true;
        throw new Error("should never be called");
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/youtube/resolve",
        payload: { url: "https://evil.example.com/watch?v=x" },
      });

      expect(res.statusCode).toBe(400);
      expect(innertubeCalled).toBe(false);
      expect(ytdlpCalled).toBe(false);
    });
  });

  describe("innertube fast path (captioned video — ROADMAP SC4 regression guard)", () => {
    it("returns 200 with captions from innertube's own transcript and never spawns yt-dlp", async () => {
      app = await buildApp();
      __setInnertubeClientForTests(
        fakeInnertube({
          getTranscript: async () => transcriptFixture(),
        })
      );
      let callCount = 0;
      __setResolveYoutubeForTests(async () => {
        callCount += 1;
        throw new Error("fast path must never call the yt-dlp fallback");
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/youtube/resolve",
        payload: { url: "https://www.youtube.com/watch?v=fastPathVidId" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.title).toBe("Fake Lecture Title");
      expect(body.captions).toEqual([
        { start: 0, end: 3, text: "Segment one" },
        { start: 3, end: 6, text: "Segment two" },
      ]);
      expect(callCount).toBe(0);
    });
  });

  describe("innertube metadata-only, yt-dlp caption fallback throws", () => {
    it("is non-fatal — the metadata-only response still goes out with 200", async () => {
      app = await buildApp();
      __setInnertubeClientForTests(fakeInnertube());
      __setResolveYoutubeForTests(async () => {
        throw new Error("yt-dlp exploded");
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/youtube/resolve",
        payload: { url: "https://www.youtube.com/watch?v=throwsVidId" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.title).toBe("Fake Lecture Title");
      expect(body.captions).toBeUndefined();
    });
  });

  describe("innertube total miss, yt-dlp fallback succeeds (ROADMAP SC2)", () => {
    it("returns 200 with the yt-dlp title/captions and related: []", async () => {
      app = await buildApp();
      __setInnertubeClientForTests({
        getInfo: async () => {
          throw new Error("innertube totally unreachable");
        },
        search: async () => {
          throw new Error("unused");
        },
      });
      const legacyResult: YoutubeMetadata = {
        videoId: "totalMissVidId",
        title: "yt-dlp legacy title",
        captions: [{ start: 0, end: 1, text: "legacy caption" }],
      };
      __setResolveYoutubeForTests(async () => legacyResult);

      const res = await app.inject({
        method: "POST",
        url: "/api/youtube/resolve",
        payload: { url: "https://www.youtube.com/watch?v=totalMissVidId" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.title).toBe("yt-dlp legacy title");
      expect(body.captions).toEqual(legacyResult.captions);
      expect(body.related).toEqual([]);
    });
  });

  describe("innertube total miss, yt-dlp absent (ROADMAP SC2 degradation contract)", () => {
    it("returns 200 with ytdlpMissing: true rather than throwing", async () => {
      app = await buildApp();
      __setInnertubeClientForTests({
        getInfo: async () => {
          throw new Error("innertube totally unreachable");
        },
        search: async () => {
          throw new Error("unused");
        },
      });
      __setResolveYoutubeForTests(async () => ({
        videoId: "missingYtdlpVidId",
        title: null,
        captions: null,
        ytdlpMissing: true,
      }));

      const res = await app.inject({
        method: "POST",
        url: "/api/youtube/resolve",
        payload: { url: "https://www.youtube.com/watch?v=missingYtdlpVidId" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.ytdlpMissing).toBe(true);
      expect(body.related).toEqual([]);
    });
  });
});
