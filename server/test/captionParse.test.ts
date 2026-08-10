// Phase 10 "Transcript source chain" (design/EXECUTION-PLAN-post-review-v1.md).
import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSrtCaptions, parseVttCaptions } from "../src/lib/captionParse.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, "fixtures");

describe("parseSrtCaptions", () => {
  it("parses basic SubRip blocks into canonical segments", () => {
    const raw = ["1", "00:00:09,440 --> 00:00:10,720", "What's up guys?"].join("\n");
    const result = parseSrtCaptions(raw);
    expect(result.segments).toEqual([{ start: 9.44, end: 10.72, text: "What's up guys?" }]);
    expect(result.malformedCount).toBe(0);
  });

  it("joins multi-line cue text with a space", () => {
    const raw = [
      "1",
      "00:00:11,120 --> 00:00:16,720",
      "So before we start, I just want to give you guys",
      "a little intro to the intro.",
    ].join("\n");
    expect(parseSrtCaptions(raw).segments[0].text).toBe(
      "So before we start, I just want to give you guys a little intro to the intro."
    );
  });

  it("handles CRLF line endings identically to LF", () => {
    const lf = ["1", "00:00:01,000 --> 00:00:02,000", "hello there"].join("\n");
    const crlf = lf.replace(/\n/g, "\r\n");
    expect(parseSrtCaptions(crlf).segments).toEqual(parseSrtCaptions(lf).segments);
  });

  it("strips a leading UTF-8 BOM before parsing", () => {
    const raw = "﻿" + ["1", "00:00:01,000 --> 00:00:02,000", "hello"].join("\n");
    const result = parseSrtCaptions(raw);
    expect(result.segments).toEqual([{ start: 1, end: 2, text: "hello" }]);
  });

  it("strips inline HTML-ish markup tags from cue text", () => {
    const raw = ["1", "00:00:01,000 --> 00:00:02,000", "<b>Hello</b> <i>world</i>"].join("\n");
    expect(parseSrtCaptions(raw).segments[0].text).toBe("Hello world");
  });

  it("skips a cue with an unparsable timestamp and counts it as malformed", () => {
    const raw = [
      "1",
      "00:00:AA,000 --> 00:00:05,000",
      "bad timestamp",
      "",
      "2",
      "00:00:06,000 --> 00:00:07,000",
      "good cue",
    ].join("\n");
    const result = parseSrtCaptions(raw);
    expect(result.segments).toEqual([{ start: 6, end: 7, text: "good cue" }]);
    expect(result.malformedCount).toBe(1);
  });

  it("skips a cue whose end precedes its start and counts it as malformed", () => {
    const raw = ["1", "00:00:05,000 --> 00:00:02,000", "time travel"].join("\n");
    const result = parseSrtCaptions(raw);
    expect(result.segments).toHaveLength(0);
    expect(result.malformedCount).toBe(1);
  });

  it("skips a cue that's empty after markup/whitespace stripping and counts it as malformed", () => {
    const raw = ["1", "00:00:01,000 --> 00:00:02,000", "<b></b>", "   "].join("\n");
    const result = parseSrtCaptions(raw);
    expect(result.segments).toHaveLength(0);
    expect(result.malformedCount).toBe(1);
  });

  it("sorts segments ascending by start even when cues are out of order in the file", () => {
    const raw = [
      "1",
      "00:00:10,000 --> 00:00:11,000",
      "second",
      "",
      "2",
      "00:00:01,000 --> 00:00:02,000",
      "first",
    ].join("\n");
    expect(parseSrtCaptions(raw).segments.map((s) => s.text)).toEqual(["first", "second"]);
  });

  it("parses the real .en.srt fixture (first 20 cues of a genuine yt-dlp auto-caption rip), collapsing its genuine rolling-caption duplication", async () => {
    const raw = await fs.readFile(path.join(FIXTURES, "real-bjj-captions.en.srt"), "utf8");
    const result = parseSrtCaptions(raw);
    // Real auto-generated YouTube captions "roll up" — each cue repeats the
    // previous cue's tail line and adds one more. Cue #1 in this genuine file
    // has a stray blank line between its timing line and its "[Music]" text
    // (an auto-caption quirk, not something this fixture was hand-doctored
    // to include) — the blank-line cue separator this parser (faithfully,
    // like the SRT spec) treats as ending a cue splits that text off into its
    // own headerless, arrow-less fragment, which is silently dropped as "not
    // a cue" rather than counted malformed; cue #1 itself is left with no
    // text and *is* counted malformed. malformedCount is unaffected by the
    // Phase 04.1 rolling-caption dedup (F-09) below — a dropped rolling
    // duplicate is not a malformed cue.
    expect(result.malformedCount).toBe(1);

    // Phase 04.1 (D-01 item 1, F-09): this fixture's remaining 19 cues are
    // THE genuine reset/grow rolling pattern the dedup exists to collapse —
    // not an accidental collision. Proof, read directly from the fixture:
    // cue 4 ("hey guys um I want to work passing the", 21.150-21.160s) is a
    // pure "reset" repeat of cue 3's own tail and is now dropped entirely;
    // cue 6 ("half guard um which", 24.269-24.279s) repeats cue 5's tail the
    // same way; the pattern continues identically through the rest of the
    // fixture. Collapsing it changes this test's own segment count (19 -> 10
    // parsed cues, one deduped segment per genuinely NEW phrase) — recorded
    // here as the plan's documented single exception (04.1-01-SUMMARY.md),
    // not a silently-edited fixture or a relaxed assertion.
    expect(result.segments).toHaveLength(10);
    expect(result.segments[0]).toEqual({ start: 18.99, end: 19, text: "[Music]" });
    expect(result.segments.some((s) => s.text.includes("hey guys um I want to work passing the"))).toBe(true);
    expect(result.segments.some((s) => s.text.includes("half guard um which"))).toBe(true);
    // No phrase appears twice in the joined stream — the whole point of the
    // dedup: the growing cue's repeated tail is stripped, not just re-timed.
    const joined = result.segments.map((s) => s.text).join(" ");
    expect(joined.match(/hey guys um I want to work passing the/g)).toHaveLength(1);
    expect(joined.match(/half guard um which/g)).toHaveLength(1);
    // Ascending by start.
    for (let i = 1; i < result.segments.length; i++) {
      expect(result.segments[i].start).toBeGreaterThanOrEqual(result.segments[i - 1].start);
    }
  });
});

describe("parseVttCaptions", () => {
  it("parses WebVTT cues, including hour-less and hour-bearing timestamps", () => {
    const raw = [
      "WEBVTT",
      "",
      "00:00:09.440 --> 00:00:10.720",
      "What's up guys?",
      "",
      "00:01:17.680 --> 00:01:22.160",
      "Hardest instructional.",
    ].join("\n");
    const result = parseVttCaptions(raw);
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]).toEqual({ start: 9.44, end: 10.72, text: "What's up guys?" });
    expect(result.segments[1].start).toBeCloseTo(77.68, 2);
  });

  it("skips the WEBVTT header and NOTE/STYLE/REGION blocks without counting them malformed", () => {
    const raw = [
      "WEBVTT",
      "",
      "NOTE this is a comment",
      "",
      "STYLE",
      "::cue { color: yellow }",
      "",
      "00:00:01.000 --> 00:00:02.000",
      "hello",
    ].join("\n");
    const result = parseVttCaptions(raw);
    expect(result.segments).toEqual([{ start: 1, end: 2, text: "hello" }]);
    expect(result.malformedCount).toBe(0);
  });

  it("strips a BOM even before the WEBVTT header", () => {
    const raw = "﻿WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nhello";
    expect(parseVttCaptions(raw).segments).toEqual([{ start: 1, end: 2, text: "hello" }]);
  });

  it("tolerates comma-decimal timestamps mixed into a VTT file", () => {
    const raw = ["WEBVTT", "", "00:00:01,000 --> 00:00:02,000", "hello"].join("\n");
    expect(parseVttCaptions(raw).segments).toEqual([{ start: 1, end: 2, text: "hello" }]);
  });

  it("ignores cue-settings text after the end timestamp", () => {
    const raw = ["WEBVTT", "", "00:00:01.000 --> 00:00:02.000 align:start line:0%", "hello"].join("\n");
    expect(parseVttCaptions(raw).segments).toEqual([{ start: 1, end: 2, text: "hello" }]);
  });

  // Phase 04.1 Plan 2 (D-01 item 1, F-09 wider ruleset): a rolling VTT cue
  // chain (reset/grow alternation) parsed through this function comes out
  // deduped — dedupeRollingCaptions's own full behavior suite lives in
  // rollingCaptions.test.ts; this is only the integration point.
  it("dedupes a rolling-caption cue chain (F-09) when parsing VTT text", () => {
    const raw = [
      "WEBVTT",
      "",
      "00:00:01.000 --> 00:00:02.000",
      "hello",
      "",
      "00:00:02.000 --> 00:00:04.000",
      "hello there friend",
      "",
      "00:00:04.000 --> 00:00:04.010",
      "there friend",
    ].join("\n");
    const result = parseVttCaptions(raw);
    expect(result.malformedCount).toBe(0);
    expect(result.segments).toEqual([
      { start: 1, end: 2, text: "hello" },
      { start: 2, end: 4, text: "there friend" },
    ]);
  });
});
