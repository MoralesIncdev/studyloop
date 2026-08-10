// Phase 04.1 "Anchor Fidelity Repair" (D-01 item 1, F-09): the full
// rolling-caption dedup ruleset, pinned against the real 2026-08-10 proof
// project's duplication shape (server/test/fixtures/rolling-research-*.vtt,
// rolling-cpap-*.vtt) as well as synthetic edge-case fixtures for the two
// named thresholds (MIN_OVERLAP_WORDS, TIME_TOUCH_TOLERANCE_SEC) and the
// non-rolling regression guarantee.
import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dedupeRollingCaptions } from "../src/lib/rollingCaptions.js";
import { parseVttCaptions } from "../src/lib/captionParse.js";
import type { CaptionSegment } from "../src/lib/captionParse.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, "fixtures");

function cue(start: number, end: number, text: string): CaptionSegment {
  return { start, end, text };
}

async function loadFixtureSegments(filename: string): Promise<CaptionSegment[]> {
  const raw = await fs.readFile(path.join(FIXTURES, filename), "utf8");
  // parseVttCaptions already applies dedupeRollingCaptions internally
  // (captionParse.ts's wiring) — to exercise dedupeRollingCaptions itself in
  // isolation for these tests, parse the RAW (pre-dedup) cue list by
  // stripping the wiring's own effect is not possible from here, so instead
  // these fixtures are read and re-parsed into raw segments via a minimal
  // local VTT cue reader that does NOT dedupe, then handed to
  // dedupeRollingCaptions directly — keeping this test file's assertions
  // about dedupeRollingCaptions itself independent of captionParse.ts's
  // wiring (which has its own, separate integration test below).
  return parseRawVttCuesForTest(raw);
}

/**
 * A deliberately minimal, dedup-free VTT cue reader for this test file only
 * — mirrors captionParse.ts's own cue-block parsing (arrow-line split,
 * multi-line join, markup strip) without importing `dedupeRollingCaptions`
 * so these tests can feed genuinely RAW (undeduped) fixture segments into
 * the function under test.
 */
function parseRawVttCuesForTest(raw: string): CaptionSegment[] {
  const blocks = raw
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  const segments: CaptionSegment[] = [];
  for (const block of blocks) {
    if (/^(WEBVTT|NOTE\b|STYLE\b|REGION\b)/i.test(block)) continue;
    const lines = block.split("\n");
    const timeLineIdx = lines.findIndex((l) => l.includes("-->"));
    if (timeLineIdx === -1) continue;
    const [startToken, endToken] = lines[timeLineIdx].split("-->").map((t) => t.trim());
    const parse = (t: string): number => {
      const m = /^(\d+):(\d{2}):(\d{2})\.(\d{1,3})$/.exec(t);
      if (!m) throw new Error(`unparsable test fixture timestamp: ${t}`);
      const [, h, mm, ss, ms] = m;
      return Number(h) * 3600 + Number(mm) * 60 + Number(ss) + Number(ms.padEnd(3, "0")) / 1000;
    };
    const text = lines
      .slice(timeLineIdx + 1)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    segments.push({ start: parse(startToken), end: parse(endToken), text });
  }
  return segments;
}

describe("dedupeRollingCaptions — real 2026-08-10 proof-project data", () => {
  it("collapses the RESEARCH ten-cue excerpt to one segment per genuinely new phrase, each phrase appearing exactly once", async () => {
    const raw = await loadFixtureSegments("rolling-research-2026-08-10.vtt");
    expect(raw).toHaveLength(10); // sanity: the fixture itself is the raw, undeduped cue list

    const result = dedupeRollingCaptions(raw);

    expect(result).toEqual([
      cue(2.63, 2.64, "Med."),
      cue(2.64, 4.15, "Welcome to another MedCram lecture."),
      cue(4.16, 5.99, "We're going to continue in our series"),
      cue(6.0, 8.15, "here. We're going to talk about"),
      cue(8.16, 9.91, "additional modes of ventilation"),
      cue(9.92, 14.39, "specifically now CPAP"),
    ]);

    // Every phrase appears exactly once in the joined stream — the whole
    // point of the dedup: a growing cue's repeated tail is stripped, not
    // just re-timed, and a reset cue contributes nothing at all.
    const joined = result.map((s) => s.text).join(" ");
    expect(joined).toBe(
      "Med. Welcome to another MedCram lecture. We're going to continue in our series here. We're going to talk about additional modes of ventilation specifically now CPAP"
    );
    for (const phrase of ["Med.", "Welcome to another MedCram lecture.", "We're going to continue in our series"]) {
      expect(joined.split(phrase)).toHaveLength(2); // exactly one occurrence
    }
  });

  it("independently collapses the FINDINGS.md CPAP passage the same way", async () => {
    const raw = await loadFixtureSegments("rolling-cpap-2026-08-10.vtt");
    expect(raw).toHaveLength(4);

    const result = dedupeRollingCaptions(raw);

    expect(result).toEqual([
      cue(21.99, 22.0, "Okay, CPAP is typically the term that is"),
      cue(22.0, 25.19, "used if this is non-invasive"),
      cue(25.2, 29.2, "ventilation. In other words, if instead"),
    ]);

    const joined = result.map((s) => s.text).join(" ");
    expect(joined).toBe("Okay, CPAP is typically the term that is used if this is non-invasive ventilation. In other words, if instead");
  });
});

describe("dedupeRollingCaptions — individual rule behaviors (synthetic)", () => {
  it("drops a near-zero-duration reset cue whose text is wholly contained in what has already been emitted", () => {
    const result = dedupeRollingCaptions([cue(0, 5, "The quick brown fox jumps"), cue(5, 5.01, "fox jumps")]);
    expect(result).toEqual([cue(0, 5, "The quick brown fox jumps")]);
  });

  it("a grow cue that adds words to the previous cue's tail produces a segment containing only the added words", () => {
    const result = dedupeRollingCaptions([cue(0, 4, "one two three four five six"), cue(4, 6, "four five six seven eight")]);
    expect(result).toEqual([cue(0, 4, "one two three four five six"), cue(4, 6, "seven eight")]);
  });

  it("a clean, non-rolling caption fixture (2026-08-08 proof project shape) returns an array deeply equal to its input", () => {
    const clean: CaptionSegment[] = [
      cue(0, 3, "Hello everyone and welcome"),
      cue(4, 7, "Today we are going to learn"),
      cue(8, 12, "about photosynthesis in plants"),
    ];
    expect(dedupeRollingCaptions(clean)).toEqual(clean);
    expect(dedupeRollingCaptions(clean)).toEqual(clean); // same length, starts, ends, text
  });

  it("two cues that touch exactly (zero gap) but share no boundary words pass through unchanged", () => {
    const touching: CaptionSegment[] = [cue(0, 3, "Hello everyone"), cue(3, 6, "Nice to see you today")];
    expect(dedupeRollingCaptions(touching)).toEqual(touching);
  });

  it("a genuinely repeated phrase spoken twice with a real time gap keeps both occurrences — the time-adjacency guard decides, not the text alone", () => {
    const repeated: CaptionSegment[] = [cue(0, 3, "take a deep breath and relax"), cue(50, 53, "take a deep breath and relax")];
    expect(dedupeRollingCaptions(repeated)).toEqual(repeated);
  });

  it("a repeated phrase adjacent in time but whose overlap is shorter than the minimum still keeps both (accidental one-word coincidence, not rolling)", () => {
    // Time-touching (guard 1 passes), and there IS a boundary match ("the"),
    // but the match is only 1 word while 5 words of comparison window were
    // available on both sides — below MIN_OVERLAP_WORDS, so rejected as a
    // likely coincidence rather than genuine rolling duplication.
    const segments: CaptionSegment[] = [cue(0, 5, "okay cpap is typically the"), cue(5, 7, "the dog ran home again")];
    expect(dedupeRollingCaptions(segments)).toEqual(segments);
  });

  it("feeding the function its own output changes nothing (idempotent)", async () => {
    const raw = await loadFixtureSegments("rolling-research-2026-08-10.vtt");
    const once = dedupeRollingCaptions(raw);
    const twice = dedupeRollingCaptions(once);
    expect(twice).toEqual(once);
  });

  it("handles an empty segment array, a single-segment array, and a whitespace-only-text segment without throwing", () => {
    expect(dedupeRollingCaptions([])).toEqual([]);
    expect(dedupeRollingCaptions([cue(0, 1, "hello")])).toEqual([cue(0, 1, "hello")]);
    expect(() => dedupeRollingCaptions([cue(0, 1, "   ")])).not.toThrow();
    expect(dedupeRollingCaptions([cue(0, 1, "   ")])).toEqual([cue(0, 1, "   ")]);
    // A touching, whitespace-only follow-up cue contributes no new tokens
    // and is dropped without throwing.
    expect(() => dedupeRollingCaptions([cue(0, 1, "hello world"), cue(1, 1.5, "   ")])).not.toThrow();
    expect(dedupeRollingCaptions([cue(0, 1, "hello world"), cue(1, 1.5, "   ")])).toEqual([cue(0, 1, "hello world")]);
  });

  it("preserves the original casing and punctuation of kept words; only the comparison is normalized", () => {
    const result = dedupeRollingCaptions([cue(0, 3, "HELLO World,"), cue(3, 5, "hello WORLD, How Are You?!")]);
    expect(result).toEqual([cue(0, 3, "HELLO World,"), cue(3, 5, "How Are You?!")]);
  });
});

describe("dedupeRollingCaptions — wired into parseVttCaptions (integration)", () => {
  it("a rolling VTT string parsed through parseVttCaptions comes out deduped", () => {
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
    expect(result.segments).toEqual([cue(1, 2, "hello"), cue(2, 4, "there friend")]);
  });
});
