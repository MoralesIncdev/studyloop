// Phase 10 "Transcript source chain" (design/EXECUTION-PLAN-post-review-v1.md):
// dependency-free SubRip (.srt) and WebVTT (.vtt) parsers producing the exact
// canonical segment shape the rest of the app already speaks
// (`{start, end, text}` — see lib/transcripts.ts's `TranscriptSegment`).
//
// This supersedes the ad-hoc parseSrt/parseVtt that used to live inline in
// transcripts.ts (still exported there as thin wrappers over this module, so
// every existing call site/test keeps working unchanged) with a single
// shared cue-block parser that's more defensive about the messy reality of
// real-world sidecar files: a UTF-8 BOM, CRLF line endings, multi-line cues,
// inline `<...>` markup tags, and — critically for yt-dlp auto-caption
// rips — cues whose timestamps or body don't parse cleanly. Those are
// skipped rather than thrown on, with a running count so a caller can log
// "N cues could not be parsed" instead of silently losing them.
export interface CaptionSegment {
  start: number;
  end: number;
  text: string;
}

export interface CaptionParseResult {
  segments: CaptionSegment[];
  /** Cues that looked like a timed cue (had a `-->` line) but failed to parse — bad timestamps, end before start, or empty text after markup/whitespace stripping. */
  malformedCount: number;
}

function stripBom(raw: string): string {
  return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
}

function normalizeLineEndings(raw: string): string {
  return raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * Parses one timestamp token. Accepts both SRT's comma decimal
 * (`00:01:02,345`) and VTT's dot decimal (`00:01:02.345`) in either shape —
 * real files aren't always strict about which convention they use, and being
 * lenient here costs nothing. Also accepts VTT's hour-less shorthand
 * (`01:02.345`). Returns `null` for anything that doesn't match either shape.
 */
function parseTimestampToken(token: string): number | null {
  const t = token.trim();
  let m = /^(\d+):(\d{2}):(\d{2})[.,](\d{1,3})$/.exec(t);
  if (m) {
    const [, h, mm, ss, ms] = m;
    return Number(h) * 3600 + Number(mm) * 60 + Number(ss) + Number(ms.padEnd(3, "0")) / 1000;
  }
  m = /^(\d{2}):(\d{2})[.,](\d{1,3})$/.exec(t);
  if (m) {
    const [, mm, ss, ms] = m;
    return Number(mm) * 60 + Number(ss) + Number(ms.padEnd(3, "0")) / 1000;
  }
  return null;
}

const ARROW_LINE = /-->/;

interface CueBlockOptions {
  /** Blocks to skip entirely without counting them as malformed (VTT's `WEBVTT` header, `NOTE`/`STYLE`/`REGION` blocks). */
  skipBlock?: (block: string) => boolean;
}

function parseCueBlocks(raw: string, options: CueBlockOptions): CaptionParseResult {
  const normalized = normalizeLineEndings(stripBom(raw));
  const blocks = normalized
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  const segments: CaptionSegment[] = [];
  let malformedCount = 0;

  for (const block of blocks) {
    if (options.skipBlock?.(block)) continue;
    const lines = block.split("\n");
    const timeLineIdx = lines.findIndex((l) => ARROW_LINE.test(l));
    // No timing line at all — not a cue (e.g. a stray numeric index on its
    // own, or a non-cue block this format allows). Not a parse failure.
    if (timeLineIdx === -1) continue;

    const [startToken, afterArrow] = lines[timeLineIdx].split("-->");
    // VTT permits cue-settings after the end timestamp on the same line
    // (`... --> 00:00:05.000 align:start line:0%`) — only the first token matters.
    const endToken = afterArrow?.trim().split(/\s+/)[0];
    const start = startToken !== undefined ? parseTimestampToken(startToken) : null;
    const end = endToken !== undefined ? parseTimestampToken(endToken) : null;

    if (start === null || end === null || end < start) {
      malformedCount++;
      continue;
    }

    const text = lines
      .slice(timeLineIdx + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!text) {
      malformedCount++;
      continue;
    }

    segments.push({ start, end, text });
  }

  segments.sort((a, b) => a.start - b.start);
  return { segments, malformedCount };
}

/** Parses SubRip (.srt) subtitle text into canonical segments. */
export function parseSrtCaptions(raw: string): CaptionParseResult {
  return parseCueBlocks(raw, {});
}

const VTT_SKIP_BLOCK = /^(WEBVTT|NOTE\b|STYLE\b|REGION\b)/i;

/** Parses WebVTT (.vtt) subtitle text into canonical segments. */
export function parseVttCaptions(raw: string): CaptionParseResult {
  return parseCueBlocks(raw, { skipBlock: (block) => VTT_SKIP_BLOCK.test(block) });
}
