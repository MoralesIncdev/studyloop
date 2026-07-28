import path from "node:path";
import { parseTimestamp } from "./time.js";

export type ConceptProfile = "bjj-curriculum" | "headings";

export interface ConceptAnchor {
  /** Seconds into the project's video, or null if this anchor doesn't apply to it. */
  t: number | null;
}

export interface ConceptCard {
  id: string;
  title: string;
  body: string;
  anchors: ConceptAnchor[];
  /** Original markdown text of this card (heading + body), unmodified. */
  raw: string;
}

interface RawSection {
  level: number;
  title: string;
  body: string;
  raw: string;
}

function splitSections(markdown: string, allowedLevels: readonly number[]): RawSection[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const headingRe = /^(#{1,6})\s+(.*)$/;
  const sections: RawSection[] = [];
  let current: { level: number; title: string; lines: string[]; headingLine: string } | null = null;

  const flush = () => {
    if (!current) return;
    const body = current.lines.join("\n").trim();
    sections.push({
      level: current.level,
      title: current.title.trim(),
      body,
      raw: [current.headingLine, ...current.lines].join("\n").trim(),
    });
  };

  for (const line of lines) {
    const match = headingRe.exec(line);
    if (match && allowedLevels.includes(match[1].length)) {
      flush();
      current = { level: match[1].length, title: match[2], lines: [], headingLine: line };
    } else if (current) {
      current.lines.push(line);
    }
  }
  flush();
  return sections;
}

function slugBase(title: string): string {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "concept"
  );
}

function uniqueId(title: string, used: Map<string, number>): string {
  const base = slugBase(title);
  const count = used.get(base) ?? 0;
  used.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
}

export interface ProjectVideoIdentity {
  type: "Seated" | "Supine";
  volume: number;
}

/**
 * Derives the (type, volume) identity used to match concept-doc citations
 * against a project's video, from the video's filename.
 * e.g. "OpenGuardSeatedVolume1.mp4" -> { type: "Seated", volume: 1 }.
 */
export function identifyProjectVolume(videoPath: string | null | undefined): ProjectVideoIdentity | null {
  if (!videoPath) return null;
  const base = path.basename(videoPath);
  const typeMatch = /(Seated|Supine)/i.exec(base);
  const volMatch = /Vol(?:ume)?\.?\s*(\d+)/i.exec(base);
  if (!typeMatch || !volMatch) return null;
  const type = typeMatch[1][0].toUpperCase() + typeMatch[1].slice(1).toLowerCase();
  return { type: type as "Seated" | "Supine", volume: Number(volMatch[1]) };
}

const KEYWORD_VOLUME_RE = /(Seated|Supine)\s+V(?:ol)?s?\.?\s*(\d+)/gi;
const TIME_TOKEN = "(?:\\d+:)?\\d{1,2}:\\d{2}";
// Citations list multiple timestamps after a single "@", e.g. "@ 31:10, 34:14, 37:02".
const AT_TIME_CLUSTER_RE = new RegExp(`@\\s*(${TIME_TOKEN}(?:\\s*,\\s*${TIME_TOKEN})*)`, "g");

interface KeywordOccurrence {
  type: "Seated" | "Supine";
  volume: number;
  index: number;
  lineStart: number;
  lineEnd: number;
}

function findLineBounds(text: string, index: number): { start: number; end: number } {
  const start = text.lastIndexOf("\n", index) + 1;
  const nlIndex = text.indexOf("\n", index);
  const end = nlIndex === -1 ? text.length : nlIndex;
  return { start, end };
}

/** Extracts bjj-curriculum-style timestamp anchors from a section body. */
export function extractBjjAnchors(body: string, project: ProjectVideoIdentity | null): ConceptAnchor[] {
  const keywordOccurrences: KeywordOccurrence[] = [];
  let m: RegExpExecArray | null;
  const kwRe = new RegExp(KEYWORD_VOLUME_RE.source, "gi");
  while ((m = kwRe.exec(body)) !== null) {
    const bounds = findLineBounds(body, m.index);
    const type = (m[1][0].toUpperCase() + m[1].slice(1).toLowerCase()) as "Seated" | "Supine";
    keywordOccurrences.push({
      type,
      volume: Number(m[2]),
      index: m.index,
      lineStart: bounds.start,
      lineEnd: bounds.end,
    });
  }

  const anchors: ConceptAnchor[] = [];
  const clusterRe = new RegExp(AT_TIME_CLUSTER_RE.source, "g");
  while ((m = clusterRe.exec(body)) !== null) {
    const times = m[1].split(",").map((t) => t.trim());
    // Attribute the whole cluster to the nearest preceding keyword occurrence on the same line.
    const lineStart = findLineBounds(body, m.index).start;
    let owner: KeywordOccurrence | null = null;
    for (const occ of keywordOccurrences) {
      if (occ.index > m.index) break;
      if (occ.lineStart === lineStart) owner = occ;
    }
    // A cluster preceded by a "Seated/Supine Vol N" citation only applies if
    // that citation matches this project's video. A *bare* `@ mm:ss` with no
    // preceding volume keyword on the line isn't restricted to any volume, so
    // it applies universally (t set) rather than being marked unmatched.
    const matches = owner
      ? !!(project && owner.type === project.type && owner.volume === project.volume)
      : true;
    for (const timeStr of times) {
      const seconds = parseTimestamp(timeStr);
      if (seconds === null) continue;
      anchors.push({ t: matches ? seconds : null });
    }
  }
  return anchors;
}

/** Extracts `@ mm:ss` / `[mm:ss]` anchors for the generic headings profile (always real). */
export function extractHeadingAnchors(body: string): ConceptAnchor[] {
  const anchors: ConceptAnchor[] = [];
  const seen = new Set<number>();
  const push = (raw: string) => {
    const seconds = parseTimestamp(raw);
    if (seconds === null || seen.has(seconds)) return;
    seen.add(seconds);
    anchors.push({ t: seconds });
  };
  let m: RegExpExecArray | null;
  const atRe = /@\s*((?:\d+:)?\d{1,2}:\d{2})/g;
  while ((m = atRe.exec(body)) !== null) push(m[1]);
  const bracketRe = /\[((?:\d+:)?\d{1,2}:\d{2})\]/g;
  while ((m = bracketRe.exec(body)) !== null) push(m[1]);
  return anchors;
}

function sectionsToCards(sections: RawSection[], anchorFn: (body: string) => ConceptAnchor[]): ConceptCard[] {
  const used = new Map<string, number>();
  return sections
    .filter((s) => s.title.length > 0)
    .map((s) => ({
      id: uniqueId(s.title, used),
      title: s.title,
      body: s.body,
      anchors: anchorFn(s.body),
      raw: s.raw,
    }));
}

export function parseBjjCurriculum(markdown: string, videoPath: string | null | undefined): ConceptCard[] {
  const project = identifyProjectVolume(videoPath);
  const sections = splitSections(markdown, [2, 3]);
  return sectionsToCards(sections, (body) => extractBjjAnchors(body, project));
}

export function parseHeadings(markdown: string): ConceptCard[] {
  const sections = splitSections(markdown, [2]);
  return sectionsToCards(sections, (body) => extractHeadingAnchors(body));
}

/**
 * Try bjj-curriculum first; fall back to headings if fewer than 2 cards have
 * a real anchor. Since bare `@ mm:ss` clusters (no volume keyword) always
 * produce a real anchor now, a plain markdown doc that merely happens to
 * contain a couple of timestamp mentions would otherwise look
 * "bjj-anchored" — so bjj-curriculum is only even attempted when the doc
 * contains at least one genuine `Seated/Supine Vol N` citation.
 */
export function detectProfileAndParse(
  markdown: string,
  videoPath: string | null | undefined
): { profile: ConceptProfile; cards: ConceptCard[] } {
  const hasVolumeCitation = new RegExp(KEYWORD_VOLUME_RE.source, "i").test(markdown);
  if (hasVolumeCitation) {
    const bjjCards = parseBjjCurriculum(markdown, videoPath);
    const anchoredCount = bjjCards.filter((c) => c.anchors.some((a) => a.t !== null)).length;
    if (anchoredCount >= 2) {
      return { profile: "bjj-curriculum", cards: bjjCards };
    }
  }
  return { profile: "headings", cards: parseHeadings(markdown) };
}

export function parseConceptDoc(
  markdown: string,
  profile: ConceptProfile,
  videoPath: string | null | undefined
): ConceptCard[] {
  if (profile === "bjj-curriculum") return parseBjjCurriculum(markdown, videoPath);
  return parseHeadings(markdown);
}
