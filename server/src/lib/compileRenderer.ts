import path from "node:path";
import { formatTimestamp } from "./time.js";
import type { Bubble, Source } from "./models.js";
import type { ConceptCard } from "./concepts.js";

export interface CompileInput {
  title: string;
  source: Source;
  notes: string;
  bubbles: readonly Bubble[];
  concepts: readonly ConceptCard[];
  /** Furthest playback position reached this session (seconds); drives "covered" concepts. */
  watchedUpTo: number;
  /** ISO date string, injected for determinism (defaults to now if omitted). */
  compiledAt?: string;
}

function describeSource(source: Source): string {
  if (source.type === "local") return path.basename(source.path);
  return source.url;
}

/** Replaces `^t:123.4` timestamp tokens in notes markdown with `[mm:ss]` links. */
export function renderNotesTokens(notes: string): string {
  return notes.replace(/\^t:(\d+(?:\.\d+)?)/g, (_match, secondsStr: string) => {
    const seconds = Number(secondsStr);
    return `[${formatTimestamp(seconds)}](#t=${Math.round(seconds)})`;
  });
}

function renderBubbles(bubbles: readonly Bubble[]): string {
  if (bubbles.length === 0) return "_No captures this session._";
  const sorted = [...bubbles].sort((a, b) => a.t - b.t);
  return sorted
    .map((b) => {
      const lines = [`- **[${formatTimestamp(b.t)}]**${b.text ? ` ${b.text}` : ""}`];
      if (b.shot) lines.push(`  ![shot](../${b.shot})`);
      return lines.join("\n");
    })
    .join("\n");
}

function isCovered(card: ConceptCard, watchedUpTo: number): boolean {
  return card.anchors.some((a) => a.t !== null && a.t <= watchedUpTo);
}

function renderConcepts(concepts: readonly ConceptCard[], watchedUpTo: number): string {
  const covered = concepts.filter((c) => isCovered(c, watchedUpTo));
  if (covered.length === 0) return "_No concepts covered yet._";
  return covered
    .map((c) => {
      const t = c.anchors.find((a) => a.t !== null && a.t <= watchedUpTo)?.t ?? null;
      const suffix = t !== null ? ` (${formatTimestamp(t)})` : "";
      return `- ${c.title}${suffix}`;
    })
    .join("\n");
}

/**
 * Renders the compiled study document: title/source header, long notes (with
 * timestamp tokens converted to links), chronological captures, and covered
 * concepts. Deliberately excludes the full transcript and uncovered cards.
 */
export function renderCompiledDocument(input: CompileInput): string {
  const compiledAt = input.compiledAt ?? new Date().toISOString().slice(0, 10);
  const parts = [
    `# ${input.title}`,
    "",
    `**Source:** ${describeSource(input.source)}`,
    `**Compiled:** ${compiledAt}`,
    "",
    "---",
    "",
    "## Notes",
    "",
    input.notes.trim().length > 0 ? renderNotesTokens(input.notes).trim() : "_No notes yet._",
    "",
    "## Captures",
    "",
    renderBubbles(input.bubbles),
    "",
    "## Concepts Covered",
    "",
    renderConcepts(input.concepts, input.watchedUpTo),
    "",
  ];
  return parts.join("\n");
}
