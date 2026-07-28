/**
 * F10 compile preview: a deliberately small markdown parser, not a full
 * CommonMark implementation — it only needs to faithfully render exactly
 * what server/src/lib/compileRenderer.ts produces (see its golden-file test
 * for the canonical shape): `#`/`##` headings, `---` rules, `- ` list items
 * (optionally followed by an indented `![alt](src)` continuation line for a
 * bubble's shot), standalone image lines, and paragraphs containing
 * `**bold**` and `[text](url)` inline markup (notes' `^t:` tokens are
 * already converted to `[mm:ss](#t=seconds)` links server-side by the time
 * this ever sees them — see renderNotesTokens).
 *
 * Split into pure parsing (this file, unit-testable in web's node-only
 * vitest environment) and JSX rendering (study/MarkdownPreview.tsx), the
 * same text/DOM split notesFormat.ts uses for the NotesPane preview.
 */

export type InlineSegment =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "link"; text: string; href: string };

export interface MdListItem {
  inline: InlineSegment[];
  image?: { alt: string; src: string };
}

export type MdBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "hr" }
  | { type: "list"; items: MdListItem[] }
  | { type: "image"; alt: string; src: string }
  | { type: "paragraph"; inline: InlineSegment[] };

const INLINE_RE = /\*\*(.+?)\*\*|\[([^\]]*)\]\(([^)]+)\)/g;
const HEADING_RE = /^(#{1,3})\s+(.*)$/;
const HR_RE = /^-{3,}\s*$/;
const LIST_ITEM_RE = /^-\s+(.*)$/;
const IMAGE_ONLY_RE = /^!\[([^\]]*)\]\(([^)]+)\)$/;
const IMAGE_CONTINUATION_RE = /^\s+!\[([^\]]*)\]\(([^)]+)\)\s*$/;

/** Splits a line of text into text/bold/link inline segments. */
export function parseInline(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  let lastIndex = 0;
  INLINE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INLINE_RE.exec(text))) {
    if (match.index > lastIndex) segments.push({ type: "text", value: text.slice(lastIndex, match.index) });
    if (match[1] !== undefined) {
      segments.push({ type: "bold", value: match[1] });
    } else {
      segments.push({ type: "link", text: match[2] ?? "", href: match[3] ?? "" });
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) segments.push({ type: "text", value: text.slice(lastIndex) });
  if (segments.length === 0) segments.push({ type: "text", value: text });
  return segments;
}

/** Parses a StudyLoop-flavored markdown document (see module docstring) into render-ready blocks. */
export function parseMarkdownLite(markdown: string): MdBlock[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: MdBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim().length === 0) {
      i += 1;
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      const level = Math.min(3, heading[1].length) as 1 | 2 | 3;
      blocks.push({ type: "heading", level, text: heading[2].trim() });
      i += 1;
      continue;
    }

    if (HR_RE.test(line)) {
      blocks.push({ type: "hr" });
      i += 1;
      continue;
    }

    const imageOnly = IMAGE_ONLY_RE.exec(line.trim());
    if (imageOnly) {
      blocks.push({ type: "image", alt: imageOnly[1], src: imageOnly[2] });
      i += 1;
      continue;
    }

    const listItem = LIST_ITEM_RE.exec(line);
    if (listItem) {
      const items: MdListItem[] = [];
      while (i < lines.length) {
        const itemMatch = LIST_ITEM_RE.exec(lines[i]);
        if (!itemMatch) break;
        i += 1;
        const item: MdListItem = { inline: parseInline(itemMatch[1]) };
        const continuation = i < lines.length ? IMAGE_CONTINUATION_RE.exec(lines[i]) : null;
        if (continuation) {
          item.image = { alt: continuation[1], src: continuation[2] };
          i += 1;
        }
        items.push(item);
      }
      blocks.push({ type: "list", items });
      continue;
    }

    blocks.push({ type: "paragraph", inline: parseInline(line) });
    i += 1;
  }

  return blocks;
}

/**
 * Normalizes an image src from compiled markdown (`shots/x.jpg` in Notes,
 * `../shots/x.jpg` in Captures — see compileRenderer.ts) down to the
 * project-relative `shots/...` key api.shotUrl() expects.
 */
export function normalizeShotSrc(src: string): string {
  return src.replace(/^(\.\.?\/)+/, "");
}
