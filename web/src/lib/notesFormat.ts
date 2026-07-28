/**
 * F6 NotesPane markdown-lite: parses `^t:123.4` timestamp tokens out of notes
 * content for preview rendering, and inserts new tokens at a cursor position.
 * Mirrors the token format server/src/lib/compileRenderer.ts renders into
 * `[mm:ss]` links (`/\^t:(\d+(?:\.\d+)?)/g`) — kept in sync deliberately since
 * the two packages build independently.
 */

const TOKEN_RE = /\^t:(\d+(?:\.\d+)?)/g;

export type NoteToken =
  | { type: "text"; value: string }
  | { type: "timestamp"; t: number; raw: string }
  | { type: "break" };

/**
 * Splits notes content into text/timestamp/break tokens, line by line, so a
 * preview renderer can turn `^t:` tokens into clickable seek links while
 * preserving line breaks without pulling in a full markdown parser.
 */
export function tokenizeNotes(content: string): NoteToken[] {
  const lines = content.split("\n");
  const tokens: NoteToken[] = [];
  lines.forEach((line, i) => {
    if (i > 0) tokens.push({ type: "break" });
    TOKEN_RE.lastIndex = 0;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = TOKEN_RE.exec(line))) {
      if (match.index > lastIndex) tokens.push({ type: "text", value: line.slice(lastIndex, match.index) });
      tokens.push({ type: "timestamp", t: Number(match[1]), raw: match[0] });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < line.length || line.length === 0) tokens.push({ type: "text", value: line.slice(lastIndex) });
  });
  return tokens;
}

/** Rounds a seconds value to one decimal place for a compact, stable token. */
export function roundForToken(t: number): number {
  return Math.round(Math.max(0, t) * 10) / 10;
}

/**
 * Inserts a `^t:<seconds>` token at `cursor` in `content`. Returns the new
 * content plus the cursor position right after the inserted token, so the
 * caller can restore focus/selection in the textarea.
 */
export function insertTimestampToken(content: string, cursor: number, t: number): { content: string; cursor: number } {
  const clampedCursor = Math.max(0, Math.min(cursor, content.length));
  const token = `^t:${roundForToken(t)}`;
  const next = content.slice(0, clampedCursor) + token + content.slice(clampedCursor);
  return { content: next, cursor: clampedCursor + token.length };
}
