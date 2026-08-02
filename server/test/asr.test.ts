// Phase 11 "Bring-your-own local ASR adapters" (design/EXECUTION-PLAN-post-review-v1.md):
// output sniffing/parsing (both adapters), cache read/write + stable-key
// behavior, and the injectable runner boundary. Deliberately never invokes a
// real binary or makes a real network request — runAsrCommand/runAsrEndpoint
// themselves (the execFile/fetch call sites) are exercised only indirectly,
// through the injectable AsrRunner the job-lifecycle tests (asrJobs route
// tests) stub out entirely.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  __setAsrRunnerForTests,
  asrCacheKey,
  asrCachePath,
  hasAsrCache,
  parseAsrEndpointJson,
  parseAsrPlainText,
  readAsrCache,
  resolveAsrRunner,
  runAsrEndpoint,
  sniffAndParseAsrOutput,
  writeAsrCache,
  type AsrRunner,
} from "../src/lib/asr.js";

describe("sniffAndParseAsrOutput", () => {
  it("parses canonical/whisper-style JSON by .json extension", () => {
    const raw = JSON.stringify({ segments: [{ start: 0, end: 1, text: "hello" }] });
    expect(sniffAndParseAsrOutput("/tmp/out.json", raw)).toEqual([{ start: 0, end: 1, text: "hello" }]);
  });

  it("parses SRT by .srt extension", () => {
    const raw = "1\n00:00:00,000 --> 00:00:01,000\nhello from srt\n";
    expect(sniffAndParseAsrOutput("/tmp/out.srt", raw)).toEqual([{ start: 0, end: 1, text: "hello from srt" }]);
  });

  it("parses VTT by .vtt extension", () => {
    const raw = "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nhello from vtt\n";
    expect(sniffAndParseAsrOutput("/tmp/out.vtt", raw)).toEqual([{ start: 0, end: 1, text: "hello from vtt" }]);
  });

  it("sniffs JSON content when the found file has no extension (whisper.cpp's raw -of prefix)", () => {
    const raw = JSON.stringify({ segments: [{ start: 0, end: 2, text: "sniffed json" }] });
    expect(sniffAndParseAsrOutput("/tmp/out", raw)).toEqual([{ start: 0, end: 2, text: "sniffed json" }]);
  });

  it("sniffs a WEBVTT header when the found file has no extension", () => {
    const raw = "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nsniffed vtt\n";
    expect(sniffAndParseAsrOutput("/tmp/out", raw)).toEqual([{ start: 0, end: 1, text: "sniffed vtt" }]);
  });

  it("sniffs an SRT-shaped body (has a --> arrow, no WEBVTT header) when the found file has no extension", () => {
    const raw = "1\n00:00:00,000 --> 00:00:01,000\nsniffed srt\n";
    expect(sniffAndParseAsrOutput("/tmp/out", raw)).toEqual([{ start: 0, end: 1, text: "sniffed srt" }]);
  });

  it("falls back to one degenerate segment for unstructured plain text with no extension", () => {
    expect(sniffAndParseAsrOutput("/tmp/out", "just some plain text, no cues")).toEqual([
      { start: 0, end: 0, text: "just some plain text, no cues" },
    ]);
  });

  it("throws on a completely empty output file", () => {
    expect(() => sniffAndParseAsrOutput("/tmp/out", "   \n  ")).toThrow(/empty/);
  });

  it("throws when a .json file doesn't match any recognized transcript JSON shape", () => {
    expect(() => sniffAndParseAsrOutput("/tmp/out.json", JSON.stringify({ nonsense: true }))).toThrow();
  });
});

describe("parseAsrEndpointJson (verbose_json + plain-text fallback)", () => {
  it("prefers segments when present, sorted by start", () => {
    const body = {
      segments: [
        { start: 1, end: 2, text: "second" },
        { start: 0, end: 1, text: "first" },
      ],
    };
    expect(parseAsrEndpointJson(body)).toEqual([
      { start: 0, end: 1, text: "first" },
      { start: 1, end: 2, text: "second" },
    ]);
  });

  it("drops segments whose text is empty after trimming", () => {
    const body = { segments: [{ start: 0, end: 1, text: "  " }, { start: 1, end: 2, text: "real text" }] };
    expect(parseAsrEndpointJson(body)).toEqual([{ start: 1, end: 2, text: "real text" }]);
  });

  it("falls back to `text` as one whole-file segment when segments is absent", () => {
    expect(parseAsrEndpointJson({ text: "  whole transcript  " })).toEqual([{ start: 0, end: 0, text: "whole transcript" }]);
  });

  it("falls back to `text` when segments is present but empty", () => {
    expect(parseAsrEndpointJson({ segments: [], text: "fallback text" })).toEqual([{ start: 0, end: 0, text: "fallback text" }]);
  });

  it("throws when neither segments nor text yield anything usable", () => {
    expect(() => parseAsrEndpointJson({})).toThrow(/no transcript text/);
    expect(() => parseAsrEndpointJson({ text: "   " })).toThrow(/no transcript text/);
  });

  it("throws on a body that doesn't even match the expected shape", () => {
    expect(() => parseAsrEndpointJson({ segments: "not an array" })).toThrow();
  });
});

describe("parseAsrPlainText", () => {
  it("wraps trimmed text as one degenerate segment", () => {
    expect(parseAsrPlainText("  hello world  ")).toEqual([{ start: 0, end: 0, text: "hello world" }]);
  });

  it("throws on empty/whitespace-only text", () => {
    expect(() => parseAsrPlainText("")).toThrow();
    expect(() => parseAsrPlainText("   ")).toThrow();
  });
});

describe("asrCacheKey / asrCachePath", () => {
  it("is stable for the same resolved path", () => {
    expect(asrCacheKey("/videos/lesson.mp4")).toBe(asrCacheKey("/videos/lesson.mp4"));
  });

  it("resolves relative paths before hashing, so equivalent paths share a key", () => {
    expect(asrCacheKey("/videos/../videos/lesson.mp4")).toBe(asrCacheKey("/videos/lesson.mp4"));
  });

  it("differs for different video paths", () => {
    expect(asrCacheKey("/videos/a.mp4")).not.toBe(asrCacheKey("/videos/b.mp4"));
  });

  it("lives under <dataDir>/transcripts/ — the exact directory lib/transcriptChain.ts's youtube cache (step 3) also uses", () => {
    const p = asrCachePath("/data", "/videos/lesson.mp4");
    expect(path.dirname(p)).toBe(path.join("/data", "transcripts"));
    expect(path.basename(p)).toBe(`${asrCacheKey("/videos/lesson.mp4")}.json`);
  });
});

describe("readAsrCache / writeAsrCache / hasAsrCache", () => {
  let dataDir: string;

  afterEach(async () => {
    if (dataDir) await fs.rm(dataDir, { recursive: true, force: true });
  });

  it("returns null / false when nothing has been cached yet", async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-asr-cache-"));
    expect(await readAsrCache(dataDir, "/videos/lesson.mp4")).toBeNull();
    expect(await hasAsrCache(dataDir, "/videos/lesson.mp4")).toBe(false);
  });

  it("round-trips written segments and reports hasAsrCache true afterward", async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-asr-cache-"));
    const segments = [{ start: 0, end: 3, text: "cached transcript" }];
    await writeAsrCache(dataDir, "/videos/lesson.mp4", segments, "command");
    expect(await readAsrCache(dataDir, "/videos/lesson.mp4")).toEqual(segments);
    expect(await hasAsrCache(dataDir, "/videos/lesson.mp4")).toBe(true);
  });

  it("writes to the exact path asrCachePath computes", async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-asr-cache-"));
    await writeAsrCache(dataDir, "/videos/lesson.mp4", [{ start: 0, end: 1, text: "x" }], "endpoint");
    const raw = await fs.readFile(asrCachePath(dataDir, "/videos/lesson.mp4"), "utf8");
    const parsed = JSON.parse(raw);
    expect(parsed.adapterMode).toBe("endpoint");
    expect(parsed.segments).toEqual([{ start: 0, end: 1, text: "x" }]);
  });
});

describe("runAsrEndpoint (fake fetch, no real network — ffmpeg forced unavailable so it sends the video file directly)", () => {
  const videoPath = path.join(os.tmpdir(), "studyloop-asr-endpoint-fixture.mp4");
  const originalFetch = global.fetch;
  const originalFfmpegBin = process.env.STUDYLOOP_FFMPEG_BIN;

  beforeEach(async () => {
    await fs.writeFile(videoPath, "not a real video, just bytes for the fake upload");
    // Point isFfmpegAvailable() at a binary that can't possibly exist, so
    // runAsrEndpoint takes its "fall back to sending the video file
    // directly" branch (SPEC) instead of trying to spawn a real ffmpeg.
    process.env.STUDYLOOP_FFMPEG_BIN = "studyloop-definitely-not-a-real-binary";
  });

  afterEach(async () => {
    global.fetch = originalFetch;
    if (originalFfmpegBin === undefined) delete process.env.STUDYLOOP_FFMPEG_BIN;
    else process.env.STUDYLOOP_FFMPEG_BIN = originalFfmpegBin;
    await fs.rm(videoPath, { force: true });
  });

  it("parses a verbose_json response and sends the model/language/Authorization header", async () => {
    let capturedUrl: string | undefined;
    let capturedHeaders: RequestInit["headers"] | undefined;
    let capturedForm: FormData | undefined;
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedHeaders = init?.headers;
      capturedForm = init?.body as FormData;
      return new Response(JSON.stringify({ segments: [{ start: 0, end: 1, text: "verbose json result" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const segments = await runAsrEndpoint(
      { endpoint: "http://localhost:8000/", apiKey: "secret-key", model: "whisper-1", language: "en" },
      videoPath
    );

    expect(segments).toEqual([{ start: 0, end: 1, text: "verbose json result" }]);
    expect(capturedUrl).toBe("http://localhost:8000/v1/audio/transcriptions");
    expect((capturedHeaders as Record<string, string>).authorization).toBe("Bearer secret-key");
    expect(capturedForm?.get("model")).toBe("whisper-1");
    expect(capturedForm?.get("language")).toBe("en");
    expect(capturedForm?.get("response_format")).toBe("verbose_json");
    expect(capturedForm?.get("file")).toBeTruthy();
  });

  it("omits the Authorization header when no apiKey is configured", async () => {
    let capturedHeaders: RequestInit["headers"] | undefined;
    global.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedHeaders = init?.headers;
      return new Response(JSON.stringify({ text: "no key needed" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    await runAsrEndpoint({ endpoint: "http://localhost:8000", apiKey: null, model: null, language: null }, videoPath);
    expect(capturedHeaders).toBeUndefined();
  });

  it("falls back to plain-text parsing when the server ignores response_format and replies text/plain", async () => {
    global.fetch = vi.fn(async () => {
      return new Response("plain text transcript body", { status: 200, headers: { "content-type": "text/plain" } });
    }) as unknown as typeof fetch;

    const segments = await runAsrEndpoint({ endpoint: "http://localhost:8000", apiKey: null, model: null, language: null }, videoPath);
    expect(segments).toEqual([{ start: 0, end: 0, text: "plain text transcript body" }]);
  });

  it("falls back to plain-text parsing when the JSON response has no segments, only text", async () => {
    global.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ text: "json envelope, no segments" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const segments = await runAsrEndpoint({ endpoint: "http://localhost:8000", apiKey: null, model: null, language: null }, videoPath);
    expect(segments).toEqual([{ start: 0, end: 0, text: "json envelope, no segments" }]);
  });

  it("throws with the response body on a non-2xx HTTP status", async () => {
    global.fetch = vi.fn(async () => new Response("server exploded", { status: 500 })) as unknown as typeof fetch;
    await expect(
      runAsrEndpoint({ endpoint: "http://localhost:8000", apiKey: null, model: null, language: null }, videoPath)
    ).rejects.toThrow(/HTTP 500/);
  });

  it("propagates an AbortSignal to fetch for cancellation", async () => {
    let capturedSignal: AbortSignal | undefined;
    global.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedSignal = init?.signal ?? undefined;
      return new Response(JSON.stringify({ text: "ok" }), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;

    const controller = new AbortController();
    await runAsrEndpoint({ endpoint: "http://localhost:8000", apiKey: null, model: null, language: null }, videoPath, {
      signal: controller.signal,
    });
    expect(capturedSignal).toBe(controller.signal);
  });
});

describe("resolveAsrRunner / __setAsrRunnerForTests", () => {
  afterEach(() => {
    __setAsrRunnerForTests(null);
  });

  it("returns the real RealAsrRunner by default", () => {
    expect(resolveAsrRunner().constructor.name).toBe("RealAsrRunner");
  });

  it("returns the injected test double once set, until reset to null", () => {
    const fake: AsrRunner = { run: async () => [{ start: 0, end: 1, text: "fake" }] };
    __setAsrRunnerForTests(fake);
    expect(resolveAsrRunner()).toBe(fake);
    __setAsrRunnerForTests(null);
    expect(resolveAsrRunner()).not.toBe(fake);
  });
});
