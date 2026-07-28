/**
 * Time utilities: parse/format mm:ss and h:mm:ss timestamps, plus binary-search
 * helpers over sorted time-based arrays (segments, anchors, bubbles).
 */

/**
 * Parses "mm:ss" or "h:mm:ss" (also tolerates single-digit hour/min/sec pieces)
 * into seconds. Returns null if the string isn't a valid timestamp.
 */
export function parseTimestamp(input: string): number | null {
  const trimmed = input.trim();
  const match = /^(\d+):(\d{1,2}):(\d{2})$|^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!match) return null;
  if (match[1] !== undefined) {
    const h = Number(match[1]);
    const m = Number(match[2]);
    const s = Number(match[3]);
    if (m >= 60 || s >= 60) return null;
    return h * 3600 + m * 60 + s;
  }
  const m = Number(match[4]);
  const s = Number(match[5]);
  if (s >= 60) return null;
  return m * 60 + s;
}

/** Formats seconds as "mm:ss" (or "h:mm:ss" once past an hour). */
export function formatTimestamp(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Binary search for the index of the last item whose `getStart(item) <= t`.
 * Returns -1 if no such item exists. `items` must be sorted ascending by start.
 */
export function findActiveIndex<T>(
  items: readonly T[],
  t: number,
  getStart: (item: T) => number
): number {
  let lo = 0;
  let hi = items.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (getStart(items[mid]) <= t) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}
