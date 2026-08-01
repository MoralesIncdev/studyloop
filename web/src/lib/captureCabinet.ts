// Console slice C (design/mockups/video-console/index.html lines 616-629): the
// right edge cabinet — every mined capture + pinned note "this sitting",
// reverse-chronological by when it was created (not by video timestamp — a
// freshly mined clip from earlier in the video should still surface first,
// mirroring the mock's `prepend()` choreography in mineMoment()/acceptSuggest()).
// Screenshot-only bubbles (empty text + a shot) render italic (`.shot` in the
// mock); mined bubbles carry lib/mining.ts's own "[mined " header convention.
import type { Bubble } from "./types";

export interface CaptureCabinetRow {
  id: string;
  t: number;
  text: string;
  shot: string | null;
  mined: boolean;
  screenshotOnly: boolean;
}

const MINED_PREFIX = "[mined ";

export function buildCaptureCabinetRows(bubbles: readonly Bubble[]): CaptureCabinetRow[] {
  return [...bubbles]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((b) => ({
      id: b.id,
      t: b.t,
      text: b.text,
      shot: b.shot ?? null,
      mined: b.text.startsWith(MINED_PREFIX),
      screenshotOnly: !b.text.trim() && !!b.shot,
    }));
}
