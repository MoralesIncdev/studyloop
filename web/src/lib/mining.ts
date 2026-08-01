// Console slice 4 "one-key mining" (design/mockups/video-console/SURVEY.md,
// asbplayer's dialogless capture): one keystroke packages the current moment —
// a window around the playhead, its transcript slice, and a frame grab — into
// a capture, with zero dialog and playback never stopping. The annotation's
// time anchor defines the media window automatically (SURVEY: "the best mining
// flows grab the current time-anchored line without opening any dialog").
import type { TranscriptSegment } from "./types";
import { formatTimestamp } from "./time";

/** Seconds of context captured before/after the playhead. */
export const MINE_BACK_S = 12;
export const MINE_FWD_S = 8;
/** Transcript excerpt cap — a capture is a pointer into the moment, not a dump. */
export const MINE_EXCERPT_CHARS = 600;

export function mineSpan(t: number, duration: number): { start: number; end: number } {
  const start = Math.max(0, t - MINE_BACK_S);
  const end = duration > 0 ? Math.min(duration, t + MINE_FWD_S) : t + MINE_FWD_S;
  return { start, end };
}

/** The mined bubble's text: a span header plus the transcript slice that
 *  overlaps it (empty-transcript videos still mine — header only). */
export function buildMinedText(segments: TranscriptSegment[], t: number, duration: number): string {
  const { start, end } = mineSpan(t, duration);
  const excerpt = segments
    .filter((s) => s.end >= start && s.start <= end)
    .map((s) => s.text.trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, MINE_EXCERPT_CHARS);
  const header = `[mined ${formatTimestamp(start)}–${formatTimestamp(end)}]`;
  return excerpt ? `${header} ${excerpt}` : header;
}
