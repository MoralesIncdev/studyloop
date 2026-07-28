import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTranscriptFromText, parseBjjCorpusJson, parseSrt, parseVtt } from "../src/lib/transcripts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, "fixtures");

describe("parseBjjCorpusJson", () => {
  it("normalizes the BJJ-corpus {timestamps:[{start,end,text}]} shape", async () => {
    const raw = await fs.readFile(path.join(FIXTURES, "transcript-bjj.json"), "utf8");
    const result = parseBjjCorpusJson(raw);
    expect(result.segments).toHaveLength(3);
    expect(result.segments[0]).toEqual({ start: 9.44, end: 10.72, text: "What's up guys?" });
    expect(result.segments[2].text).toContain("hardest instructional");
  });

  it("sorts segments ascending by start even if input is out of order", () => {
    const raw = JSON.stringify({
      timestamps: [
        { start: 10, end: 12, text: "second" },
        { start: 1, end: 2, text: "first" },
      ],
    });
    const result = parseBjjCorpusJson(raw);
    expect(result.segments.map((s) => s.text)).toEqual(["first", "second"]);
  });

  it("throws TranscriptParseError on non-BJJ-shaped JSON", () => {
    expect(() => parseBjjCorpusJson(JSON.stringify({ foo: "bar" }))).toThrow();
  });
});

describe("parseSrt", () => {
  it("parses SubRip blocks into normalized segments", async () => {
    const raw = await fs.readFile(path.join(FIXTURES, "transcript.srt"), "utf8");
    const result = parseSrt(raw);
    expect(result.segments).toHaveLength(3);
    expect(result.segments[0]).toEqual({ start: 9.44, end: 10.72, text: "What's up guys?" });
    // multi-line cue text is joined with a space
    expect(result.segments[1].text).toBe(
      "So before we start, I just want to give you guys a little intro to the intro."
    );
  });
});

describe("parseVtt", () => {
  it("parses WebVTT cues, including hour-less and hour-bearing timestamps", async () => {
    const raw = await fs.readFile(path.join(FIXTURES, "transcript.vtt"), "utf8");
    const result = parseVtt(raw);
    expect(result.segments).toHaveLength(3);
    expect(result.segments[0]).toEqual({ start: 9.44, end: 10.72, text: "What's up guys?" });
    // 00:01:17.680 -> 77.68s
    expect(result.segments[2].start).toBeCloseTo(77.68, 2);
  });
});

describe("loadTranscriptFromText", () => {
  it("dispatches by file extension", async () => {
    const srtRaw = await fs.readFile(path.join(FIXTURES, "transcript.srt"), "utf8");
    const vttRaw = await fs.readFile(path.join(FIXTURES, "transcript.vtt"), "utf8");
    const jsonRaw = await fs.readFile(path.join(FIXTURES, "transcript-bjj.json"), "utf8");

    expect(loadTranscriptFromText("x.srt", srtRaw).segments).toHaveLength(3);
    expect(loadTranscriptFromText("x.vtt", vttRaw).segments).toHaveLength(3);
    expect(loadTranscriptFromText("x.json", jsonRaw).segments).toHaveLength(3);
  });

  it("throws on unsupported extensions", () => {
    expect(() => loadTranscriptFromText("x.txt", "hello")).toThrow();
  });
});
