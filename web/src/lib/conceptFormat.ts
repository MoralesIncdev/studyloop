/**
 * F7 concept ticker: markdown-lite rendering helpers for a `ConceptCard.body`
 * (server/src/lib/concepts.ts section bodies — plain markdown paragraphs,
 * `#`-headings, and `**bold**`, nothing fancier since the concept-doc
 * profiles just split on headings and keep everything else as raw text).
 *
 * Deliberately not extending notesFormat.ts: that module tokenizes the app's
 * own `^t:` timestamp mini-syntax out of free-form notes, a different concern
 * from turning a concept doc's markdown structure into renderable blocks.
 */

export interface ConceptInline {
  bold: boolean;
  text: string;
}

export type ConceptBlock =
  | { type: "heading"; level: number; inlines: ConceptInline[] }
  | { type: "paragraph"; inlines: ConceptInline[] };

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const BOLD_RE = /\*\*(.+?)\*\*/g;

function parseInlines(text: string): ConceptInline[] {
  const inlines: ConceptInline[] = [];
  const re = new RegExp(BOLD_RE.source, "g");
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > lastIndex) inlines.push({ bold: false, text: text.slice(lastIndex, m.index) });
    inlines.push({ bold: true, text: m[1] });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) inlines.push({ bold: false, text: text.slice(lastIndex) });
  if (inlines.length === 0) inlines.push({ bold: false, text: "" });
  return inlines;
}

/**
 * Splits a concept body into heading/paragraph blocks. Blank lines separate
 * paragraphs; a run of consecutive non-blank, non-heading lines is joined
 * with a space into a single paragraph, so hard-wrapped source markdown
 * doesn't render as one fragment per source line.
 */
export function parseConceptBody(body: string): ConceptBlock[] {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const blocks: ConceptBlock[] = [];
  let paragraphLines: string[] = [];

  const flushParagraph = (): void => {
    if (paragraphLines.length === 0) return;
    const text = paragraphLines.join(" ").trim();
    paragraphLines = [];
    if (text) blocks.push({ type: "paragraph", inlines: parseInlines(text) });
  };

  for (const line of lines) {
    const headingMatch = HEADING_RE.exec(line);
    if (headingMatch) {
      flushParagraph();
      blocks.push({ type: "heading", level: headingMatch[1].length, inlines: parseInlines(headingMatch[2].trim()) });
      continue;
    }
    if (line.trim() === "") {
      flushParagraph();
      continue;
    }
    paragraphLines.push(line.trim());
  }
  flushParagraph();
  return blocks;
}

/**
 * First non-empty line of a concept body, stripped of heading markers and
 * bold markup — used for the ticker's compact card ("title + first
 * OBJECTIVE-ish line" per SPEC).
 */
export function firstBodyLine(body: string): string {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const headingMatch = HEADING_RE.exec(line);
    const withoutHeading = headingMatch ? headingMatch[2].trim() : line;
    return withoutHeading.replace(new RegExp(BOLD_RE.source, "g"), "$1");
  }
  return "";
}
