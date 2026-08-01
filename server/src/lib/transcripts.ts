import path from "node:path";
import { z } from "zod";
import { parseSrtCaptions, parseVttCaptions } from "./captionParse.js";

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
      start: z.number().nonnegative(),
      end: z.number().nonnegative(),
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
      start: z.number().nonnegative(),
      end: z.number().nonnegative(),
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

/**
 * Parses SubRip (.srt) subtitle text into normalized segments. Thin wrapper
 * over lib/captionParse.ts's `parseSrtCaptions` (Phase 10 "Transcript source
 * chain") — kept here, under this name, because every existing call site
 * (this module's own `loadTranscriptFromText` dispatch, lib/ytdlp.ts, and
 * this file's tests) already imports it from `transcripts.ts`. Malformed-cue
 * counting is available from captionParse.ts directly for callers that need
 * it (the scan/sidecar/youtube-pull paths) — this wrapper's callers only
 * ever wanted the segments.
 */
export function parseSrt(raw: string): NormalizedTranscript {
  return { segments: parseSrtCaptions(raw).segments };
}

/** Parses WebVTT (.vtt) subtitle text into normalized segments — see parseSrt's doc comment. */
export function parseVtt(raw: string): NormalizedTranscript {
  return { segments: parseVttCaptions(raw).segments };
}

/** Dispatches to the right loader based on file extension. */
export function loadTranscriptFromText(filePath: string, raw: string): NormalizedTranscript {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".json") return parseTranscriptJson(raw);
  if (ext === ".srt") return parseSrt(raw);
  if (ext === ".vtt") return parseVtt(raw);
  throw new TranscriptParseError(`Unsupported transcript extension: ${ext}`);
}
