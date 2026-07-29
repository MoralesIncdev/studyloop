import path from "node:path";
import { formatTimestamp } from "./time.js";
import type { AnalysisConcept, Pearl } from "./analysis.js";
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
  /**
   * V3-A "Compile synthesis checkpoint": the learner's own-words summary,
   * written in the compile flow's first step. Renders as the FIRST section
   * of the doc; empty/undefined (skipped) renders a visible placeholder line
   * instead of omitting the section — "visible unfinishedness is the nudge"
   * (PEDAGOGY §3).
   */
  lessonSummary?: string;
  /**
   * V2-C: when analysis.json exists for this project, compile gains "Pearls"
   * and "Concept breakdown" sections after the user-notes sections (SPEC
   * "Analysis engine" — "Compile v2"). Omitted/undefined when no analysis has
   * been run — the sections are simply absent, never blocking compile.
   */
  analysisPearls?: readonly Pearl[];
  analysisConcepts?: readonly AnalysisConcept[];
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

/** SPEC: "Pearls ... importance-starred" — ★×importance, importance-sorted then chronological. */
function renderAnalysisPearls(pearls: readonly Pearl[]): string {
  const sorted = [...pearls].sort((a, b) => b.importance - a.importance || a.t - b.t);
  return sorted
    .map((p) => `- ${"★".repeat(p.importance)} **[${formatTimestamp(p.t)}] ${p.label}** — ${p.insight}`)
    .join("\n");
}

function renderAnalysisConcepts(concepts: readonly AnalysisConcept[]): string {
  return concepts
    .map((c) => {
      const anchorList = c.anchors.map((a) => `[${formatTimestamp(a.t)}]`).join(", ");
      const lines = [`### ${c.title}${anchorList ? ` (${anchorList})` : ""}`, "", c.summary, "", c.body];
      return lines.join("\n");
    })
    .join("\n\n");
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
  const summary = input.lessonSummary?.trim();
  const parts = [
    `# ${input.title}`,
    "",
    `**Source:** ${describeSource(input.source)}`,
    `**Compiled:** ${compiledAt}`,
    "",
    "---",
    "",
    "## In my own words",
    "",
    summary ? summary : "*[Write your summary to complete this lesson]*",
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
  // V2-C: only present when analysis.json exists for this project — never
  // blocks compile without analysis (SPEC "Compile v2").
  if (input.analysisPearls && input.analysisPearls.length > 0) {
    parts.push("## Pearls", "", renderAnalysisPearls(input.analysisPearls), "");
  }
  if (input.analysisConcepts && input.analysisConcepts.length > 0) {
    parts.push("## Concept breakdown", "", renderAnalysisConcepts(input.analysisConcepts), "");
  }
  return parts.join("\n");
}
