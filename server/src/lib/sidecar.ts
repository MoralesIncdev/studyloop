// Phase 10 "Transcript source chain" (design/EXECUTION-PLAN-post-review-v1.md):
// same-directory sidecar caption resolution for local library videos that
// have no pipeline transcript, plus deriving a YouTube video id from the
// yt-dlp `[<id>]` filename convention so lib/transcriptChain.ts's lazy pull
// step knows what to fetch. Both are pure/read-only filesystem checks — no
// network, no writes — so they're safe to call from a scan (lib/scan.ts) as
// well as at transcript-read time (lib/transcriptChain.ts).
import path from "node:path";
import { pathExists } from "./store.js";

export interface SidecarTranscriptRef {
  /** Absolute path to the matched sidecar file. */
  path: string;
}

const SIDECAR_EXTENSIONS = ["srt", "vtt"] as const;

/**
 * Same-dir sidecar lookup, first hit wins (SPEC order):
 *   1. `<basename>.srt` / `<basename>.vtt` (exact)
 *   2. `<basename>.en.srt` / `<basename>.en.vtt` (yt-dlp's primary English track)
 *   3. `<basename>.en-orig.srt` (yt-dlp's pre-translation original — only
 *      considered when nothing above matched; genuinely lower priority than
 *      `.en`, not just a same-tier fallback, since it can be a *different*
 *      spoken language transcribed/translated less carefully).
 * Returns `null` when `videoPath`'s directory doesn't exist or none of the
 * candidates are present — never throws.
 */
export async function findSidecarTranscript(videoPath: string): Promise<SidecarTranscriptRef | null> {
  const dir = path.dirname(videoPath);
  const base = path.basename(videoPath, path.extname(videoPath));

  const candidates: string[] = [
    ...SIDECAR_EXTENSIONS.map((ext) => `${base}.${ext}`),
    ...SIDECAR_EXTENSIONS.map((ext) => `${base}.en.${ext}`),
    `${base}.en-orig.srt`,
  ];

  for (const candidate of candidates) {
    const full = path.join(dir, candidate);
    if (await pathExists(full)) return { path: full };
  }
  return null;
}

// yt-dlp's default output template ends a video's basename with the video id
// wrapped in square brackets immediately before the extension, e.g.
// "20170418 - Passing Half Guard (Lachlan Giles) [Vn8Y8AnxH14].mp4". YouTube
// video ids are always exactly 11 characters from [A-Za-z0-9_-].
const YOUTUBE_ID_RE = /\[([A-Za-z0-9_-]{11})\]$/;

/**
 * Derives a YouTube video id from a local file's yt-dlp-convention basename.
 * Returns `null` for any filename that doesn't end in that exact
 * bracketed-11-char-id shape (true of most local library content, which
 * isn't a YouTube rip at all).
 */
export function deriveYoutubeVideoId(videoPath: string): string | null {
  const base = path.basename(videoPath, path.extname(videoPath)).trim();
  const match = YOUTUBE_ID_RE.exec(base);
  return match ? match[1] : null;
}
