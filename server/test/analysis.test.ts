import { afterEach, describe, expect, it } from "vitest";
import {
  __setAnalysisClientForTests,
  assignConceptIds,
  chunkTranscript,
  CHUNK_OVERLAP_SECONDS,
  CHUNK_WINDOW_SECONDS,
  FakeAnalysisClient,
  isFakeAnalysisMode,
  resolveAnalysisClient,
  runAnalysisJob,
  type AnalysisLLMClient,
  type AnalysisOutcome,
  type ChunkResult,
  type MergeResult,
  type TranscriptChunk,
} from "../src/lib/analysis.js";
import type { TranscriptSegment } from "../src/lib/transcripts.js";

function segment(start: number, end: number, text = "word"): TranscriptSegment {
  return { start, end, text };
}

describe("chunkTranscript", () => {
  it("returns [] for an empty transcript", () => {
    expect(chunkTranscript([])).toEqual([]);
  });

  it("produces exactly one chunk for a transcript shorter than one window", () => {
    const segments = [segment(0, 10), segment(10, 30)];
    const chunks = chunkTranscript(segments);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ index: 0, startSec: 0, endSec: 30 });
  });

  it("uses the default 8min window / 1min overlap constants", () => {
    expect(CHUNK_WINDOW_SECONDS).toBe(480);
    expect(CHUNK_OVERLAP_SECONDS).toBe(60);
  });

  it("slides with the configured overlap for a transcript spanning several windows", () => {
    // 3 windows' worth at the default stride (480-60=420s stride), so
    // windowStart should land at 0, 420, 840 before the transcript ends.
    const totalEnd = 1000;
    const segments: TranscriptSegment[] = [];
    for (let t = 0; t < totalEnd; t += 5) segments.push(segment(t, t + 5));
    const chunks = chunkTranscript(segments, 480, 60);

    expect(chunks[0].startSec).toBe(0);
    expect(chunks[0].endSec).toBe(480);
    expect(chunks[1].startSec).toBe(420); // stride = window - overlap
    expect(chunks[1].endSec).toBe(900);
    // Consecutive windows overlap by exactly 60s.
    expect(chunks[0].endSec - chunks[1].startSec).toBe(60);
    // Last chunk is clamped to the transcript's actual end, not a full window.
    const last = chunks[chunks.length - 1];
    expect(last.endSec).toBe(totalEnd);
    expect(last.endSec - last.startSec).toBeLessThanOrEqual(480);
  });

  it("stops exactly at the transcript end when it lands on an exact window boundary", () => {
    // total = 960 = 2 * 480, no overlap needed to reach exactly two full windows.
    const segments = [segment(0, 480), segment(480, 960)];
    const chunks = chunkTranscript(segments, 480, 60);
    // window 0: [0,480]; window 1 (stride 420): [420, 900]; window 2: [840, 960(clamped)]
    expect(chunks[chunks.length - 1].endSec).toBe(960);
    expect(chunks.every((c) => c.endSec <= 960)).toBe(true);
  });

  it("skips a window with no segments inside it rather than emitting an empty chunk", () => {
    // A big gap between two segments — the fully-empty middle window(s) (e.g.
    // the [840,1320] stride-window, which contains neither segment) must not appear.
    const segments = [segment(0, 10), segment(2000, 2010)];
    const chunks = chunkTranscript(segments, 480, 60);
    expect(chunks.every((c) => c.text.trim().length > 0)).toBe(true);
    expect(chunks.some((c) => c.startSec === 0)).toBe(true);
    expect(chunks.some((c) => c.startSec === 840)).toBe(false);
  });

  it("includes inline [mm:ss]-prefixed segment text in the chunk", () => {
    const chunks = chunkTranscript([segment(65, 70, "hello there")]);
    expect(chunks[0].text).toContain("[1:05] hello there");
  });

  it("throws for a non-positive window", () => {
    expect(() => chunkTranscript([segment(0, 10)], 0, 0)).toThrow();
  });

  it("throws when overlap is >= window", () => {
    expect(() => chunkTranscript([segment(0, 10)], 480, 480)).toThrow();
    expect(() => chunkTranscript([segment(0, 10)], 480, 500)).toThrow();
  });

  it("assigns sequential zero-based indices", () => {
    const segments: TranscriptSegment[] = [];
    for (let t = 0; t < 1000; t += 5) segments.push(segment(t, t + 5));
    const chunks = chunkTranscript(segments, 480, 60);
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));
  });
});

describe("assignConceptIds", () => {
  it("slugifies titles into ids", () => {
    const [c] = assignConceptIds([{ title: "Grip Fighting Basics", summary: "s", body: "b", anchorSeconds: [10] }]);
    expect(c.id).toBe("grip-fighting-basics");
    expect(c.anchors).toEqual([{ t: 10 }]);
  });

  it("de-duplicates identical slugs with -2/-3 suffixes, preserving order", () => {
    const ids = assignConceptIds([
      { title: "Same Title", summary: "a", body: "a", anchorSeconds: [] },
      { title: "Same Title", summary: "b", body: "b", anchorSeconds: [] },
      { title: "same title", summary: "c", body: "c", anchorSeconds: [] },
    ]).map((c) => c.id);
    expect(ids).toEqual(["same-title", "same-title-2", "same-title-3"]);
  });

  it("falls back to a generic slug for a title with no alphanumeric characters", () => {
    const [c] = assignConceptIds([{ title: "###", summary: "s", body: "b", anchorSeconds: [] }]);
    expect(c.id).toBe("concept");
  });
});

describe("FakeAnalysisClient (deterministic demo/dev generator)", () => {
  it("is deterministic — the same chunk input produces byte-identical output", async () => {
    const client = new FakeAnalysisClient();
    const chunk: TranscriptChunk = { index: 0, startSec: 0, endSec: 480, text: "[0:00] some instructional content here" };
    const first = await client.runChunk(chunk, "claude-opus-5");
    const second = await client.runChunk(chunk, "claude-opus-5");
    expect(first).toEqual(second);
  });

  it("produces a pearl anchored within the chunk's own time range", async () => {
    const client = new FakeAnalysisClient();
    const chunk: TranscriptChunk = { index: 1, startSec: 420, endSec: 900, text: "[7:00] more content" };
    const result = await client.runChunk(chunk, "claude-opus-5");
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error("unreachable");
    expect(result.data.pearls[0].t).toBeGreaterThanOrEqual(chunk.startSec);
    expect(result.data.pearls[0].t).toBeLessThanOrEqual(chunk.endSec);
  });

  it("merge dedupes concepts with the same title, unioning their anchors", async () => {
    const client = new FakeAnalysisClient();
    const merge = await client.runMerge(
      [],
      [
        { title: "Same Topic", summary: "s1", body: "b1", anchorSeconds: [10] },
        { title: "Same Topic", summary: "s2", body: "b2", anchorSeconds: [500] },
      ],
      "claude-opus-5"
    );
    expect(merge.kind).toBe("ok");
    if (merge.kind !== "ok") throw new Error("unreachable");
    expect(merge.data.concepts).toHaveLength(1);
    expect(merge.data.concepts[0].anchorSeconds).toEqual([10, 500]);
  });

  it("merge always includes at least one theme", async () => {
    const client = new FakeAnalysisClient();
    const merge = await client.runMerge([], [], "claude-opus-5");
    expect(merge.kind).toBe("ok");
    if (merge.kind !== "ok") throw new Error("unreachable");
    expect(merge.data.themes.length).toBeGreaterThan(0);
  });
});

describe("resolveAnalysisClient / isFakeAnalysisMode", () => {
  afterEach(() => {
    __setAnalysisClientForTests(null);
    delete process.env.STUDYLOOP_FAKE_ANALYSIS;
  });

  it("returns a test-injected client above all else", () => {
    const chunkOutcome: AnalysisOutcome<ChunkResult> = { kind: "ok", data: { pearls: [], concepts: [] } };
    const mergeOutcome: AnalysisOutcome<MergeResult> = { kind: "ok", data: { pearls: [], concepts: [], themes: [] } };
    const fake: AnalysisLLMClient = {
      runChunk: async () => chunkOutcome,
      runMerge: async () => mergeOutcome,
    };
    __setAnalysisClientForTests(fake);
    expect(resolveAnalysisClient(null)).toBe(fake);
    expect(resolveAnalysisClient("sk-ant-real")).toBe(fake);
  });

  it("returns a FakeAnalysisClient when STUDYLOOP_FAKE_ANALYSIS=1, even with no API key", () => {
    process.env.STUDYLOOP_FAKE_ANALYSIS = "1";
    expect(isFakeAnalysisMode()).toBe(true);
    expect(resolveAnalysisClient(null)).toBeInstanceOf(FakeAnalysisClient);
  });

  it("throws NoApiKeyError when no key, no fake mode, and no injected client", () => {
    expect(isFakeAnalysisMode()).toBe(false);
    expect(() => resolveAnalysisClient(null)).toThrow(/API key/);
  });
});

describe("runAnalysisJob (fake client end-to-end — no live API calls)", () => {
  afterEach(() => {
    __setAnalysisClientForTests(null);
  });

  it("produces a version:2 analysis with generatedAt/model/pearls/concepts/themes", async () => {
    const segments: TranscriptSegment[] = [];
    for (let t = 0; t < 1000; t += 5) segments.push(segment(t, t + 5, `text at ${t}`));

    const analysis = await runAnalysisJob({
      segments,
      model: "claude-opus-5",
      client: new FakeAnalysisClient(),
    });

    expect(analysis.version).toBe(2);
    expect(analysis.model).toBe("claude-opus-5");
    expect(typeof analysis.generatedAt).toBe("string");
    expect(analysis.pearls.length).toBeGreaterThan(0);
    expect(analysis.concepts.length).toBeGreaterThan(0);
    expect(analysis.themes.length).toBeGreaterThan(0);
    // Every concept got a deterministic id.
    expect(analysis.concepts.every((c) => typeof c.id === "string" && c.id.length > 0)).toBe(true);
  });

  it("reports progress up to 100", async () => {
    const segments = [segment(0, 10)];
    const progressValues: number[] = [];
    await runAnalysisJob({
      segments,
      model: "claude-opus-5",
      client: new FakeAnalysisClient(),
      onProgress: (pct) => progressValues.push(pct),
    });
    expect(progressValues[progressValues.length - 1]).toBe(100);
  });

  it("skips a refused chunk with a warning but still produces a result from the remaining chunks", async () => {
    const segments: TranscriptSegment[] = [];
    for (let t = 0; t < 1000; t += 5) segments.push(segment(t, t + 5));

    let call = 0;
    const flakyClient: AnalysisLLMClient = {
      runChunk: async (chunk) => {
        call++;
        if (call === 1) return { kind: "skipped", reason: "refusal", detail: "declined" };
        return new FakeAnalysisClient().runChunk(chunk, "claude-opus-5");
      },
      runMerge: (...args) => new FakeAnalysisClient().runMerge(...args),
    };

    const analysis = await runAnalysisJob({ segments, model: "claude-opus-5", client: flakyClient });
    expect(analysis.pearls.length).toBeGreaterThan(0);
  });

  it("skips a max_tokens-truncated chunk the same way as a refusal", async () => {
    const segments: TranscriptSegment[] = [];
    for (let t = 0; t < 1000; t += 5) segments.push(segment(t, t + 5));

    let call = 0;
    const flakyClient: AnalysisLLMClient = {
      runChunk: async (chunk) => {
        call++;
        if (call === 1) return { kind: "skipped", reason: "max_tokens", detail: "truncated" };
        return new FakeAnalysisClient().runChunk(chunk, "claude-opus-5");
      },
      runMerge: (...args) => new FakeAnalysisClient().runMerge(...args),
    };

    const analysis = await runAnalysisJob({ segments, model: "claude-opus-5", client: flakyClient });
    expect(analysis.pearls.length).toBeGreaterThan(0);
  });

  it("throws (never silently returns an empty analysis) when every chunk is skipped", async () => {
    const segments = [segment(0, 10)];
    const allRefuse: AnalysisLLMClient = {
      runChunk: async () => ({ kind: "skipped", reason: "refusal", detail: "declined" }),
      runMerge: async () => ({ kind: "ok", data: { pearls: [], concepts: [], themes: [] } }),
    };
    await expect(runAnalysisJob({ segments, model: "claude-opus-5", client: allRefuse })).rejects.toThrow(/skipped/);
  });

  it("throws when the merge pass itself fails", async () => {
    const segments = [segment(0, 10)];
    const mergeFails: AnalysisLLMClient = {
      runChunk: (chunk) => new FakeAnalysisClient().runChunk(chunk, "claude-opus-5"),
      runMerge: async () => ({ kind: "skipped", reason: "refusal", detail: "merge declined" }),
    };
    await expect(runAnalysisJob({ segments, model: "claude-opus-5", client: mergeFails })).rejects.toThrow(/Merge pass failed/);
  });

  it("throws for a transcript with no content", async () => {
    await expect(runAnalysisJob({ segments: [], model: "claude-opus-5", client: new FakeAnalysisClient() })).rejects.toThrow();
  });
});
