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
import { __setInnertubeClientForTests, type InnertubeClient, type RawVideoInfo } from "../src/lib/innertube.js";
import { __setResolveYoutubeForTests, type YoutubeMetadata } from "../src/lib/ytdlp.js";

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
});
