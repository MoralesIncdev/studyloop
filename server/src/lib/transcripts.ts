import path from "node:path";
import { z } from "zod";

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface NormalizedTranscript {
  segments: TranscriptSegment[];
}

/** Shape produced by the BJJ ASR corpus (parakeet-mlx / whisper-family). */
const BjjCorpusSchema = z.object({
  text: z.string().optional(),
  timestamps: z.array(
    z.object({
      start: z.number(),
      end: z.number(),
      text: z.string(),
      kind: z.string().optional(),
    })
  ),
  source_video: z.string().optional(),
  duration_seconds: z.number().optional(),
});

/** Generic whisper-style JSON: { segments: [{start, end, text}] }. */
const WhisperJsonSchema = z.object({
  segments: z.array(
    z.object({
      start: z.number(),
      end: z.number(),
      text: z.string(),
    })
  ),
});

export class TranscriptParseError extends Error {}

/** Parses BJJ-corpus JSON `{ timestamps: [{start,end,text}] }` into normalized segments. */
export function parseBjjCorpusJson(raw: string): NormalizedTranscript {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new TranscriptParseError("Invalid JSON");
  }
  const parsed = BjjCorpusSchema.safeParse(data);
  if (!parsed.success) throw new TranscriptParseError("Not a BJJ-corpus transcript JSON");
  const segments = parsed.data.timestamps
    .map((t) => ({ start: t.start, end: t.end, text: t.text.trim() }))
    .sort((a, b) => a.start - b.start);
  return { segments };
}

/** Parses generic whisper-style JSON `{ segments: [{start,end,text}] }`. */
export function parseWhisperJson(raw: string): NormalizedTranscript {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new TranscriptParseError("Invalid JSON");
  }
  const parsed = WhisperJsonSchema.safeParse(data);
  if (!parsed.success) throw new TranscriptParseError("Not a whisper-style transcript JSON");
  const segments = parsed.data.segments
    .map((s) => ({ start: s.start, end: s.end, text: s.text.trim() }))
    .sort((a, b) => a.start - b.start);
  return { segments };
}

/** Parses any recognized transcript JSON shape (BJJ-corpus first, then whisper-style). */
export function parseTranscriptJson(raw: string): NormalizedTranscript {
  try {
    return parseBjjCorpusJson(raw);
  } catch {
    // fall through
  }
  return parseWhisperJson(raw);
}

function srtTimeToSeconds(t: string): number {
  // 00:01:02,345
  const m = /^(\d+):(\d{2}):(\d{2})[.,](\d{1,3})$/.exec(t.trim());
  if (!m) return 0;
  const [, h, mm, ss, ms] = m;
  return Number(h) * 3600 + Number(mm) * 60 + Number(ss) + Number(ms.padEnd(3, "0")) / 1000;
}

function vttTimeToSeconds(t: string): number {
  // 00:01:02.345  or  01:02.345
  const m = /^(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{1,3})$/.exec(t.trim());
  if (!m) return 0;
  const [, h, mm, ss, ms] = m;
  return (h ? Number(h) * 3600 : 0) + Number(mm) * 60 + Number(ss) + Number(ms.padEnd(3, "0")) / 1000;
}

/** Parses SubRip (.srt) subtitle text into normalized segments. */
export function parseSrt(raw: string): NormalizedTranscript {
  const normalized = raw.replace(/\r\n/g, "\n");
  const blocks = normalized.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const segments: TranscriptSegment[] = [];
  const timeLine = /(\d{2}:\d{2}:\d{2}[.,]\d{1,3})\s*-->\s*(\d{2}:\d{2}:\d{2}[.,]\d{1,3})/;
  for (const block of blocks) {
    const lines = block.split("\n");
    const timeLineIdx = lines.findIndex((l) => timeLine.test(l));
    if (timeLineIdx === -1) continue;
    const match = timeLine.exec(lines[timeLineIdx]);
    if (!match) continue;
    const text = lines
      .slice(timeLineIdx + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (!text) continue;
    segments.push({
      start: srtTimeToSeconds(match[1]),
      end: srtTimeToSeconds(match[2]),
      text,
    });
  }
  return { segments: segments.sort((a, b) => a.start - b.start) };
}

/** Parses WebVTT (.vtt) subtitle text into normalized segments. */
export function parseVtt(raw: string): NormalizedTranscript {
  const normalized = raw.replace(/\r\n/g, "\n");
  const blocks = normalized.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const segments: TranscriptSegment[] = [];
  const timeLine = /((?:\d+:)?\d{2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d+:)?\d{2}:\d{2}[.,]\d{1,3})/;
  for (const block of blocks) {
    if (/^WEBVTT/i.test(block)) continue;
    const lines = block.split("\n");
    const timeLineIdx = lines.findIndex((l) => timeLine.test(l));
    if (timeLineIdx === -1) continue;
    const match = timeLine.exec(lines[timeLineIdx]);
    if (!match) continue;
    const text = lines
      .slice(timeLineIdx + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (!text) continue;
    segments.push({
      start: vttTimeToSeconds(match[1]),
      end: vttTimeToSeconds(match[2]),
      text,
    });
  }
  return { segments: segments.sort((a, b) => a.start - b.start) };
}

/** Dispatches to the right loader based on file extension. */
export function loadTranscriptFromText(filePath: string, raw: string): NormalizedTranscript {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".json") return parseTranscriptJson(raw);
  if (ext === ".srt") return parseSrt(raw);
  if (ext === ".vtt") return parseVtt(raw);
  throw new TranscriptParseError(`Unsupported transcript extension: ${ext}`);
}
