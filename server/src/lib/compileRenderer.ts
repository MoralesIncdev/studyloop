import path from "node:path";
import { formatTimestamp } from "./time.js";
import type { AnalysisConcept, AnalysisUnit, Pearl } from "./analysis.js";
import { isUnitFeedable, type AttestationsFile } from "./attestation.js";
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
  /**
   * V3-B B2 "attestation + reveal-gating": when the project's analysis is
   * v3, `analysisUnits` (+ `unitAttestations`) REPLACE `analysisConcepts`
   * for the "Concept breakdown" section — attested/generation-touched units
   * render in full (with the learner's own take, if any), the rest render
   * as a "Not yet reviewed" titles-only list (SPEC: "Unattested render in
   * compile under 'Not yet reviewed' as titles only"). Absent/empty on v2
   * projects, which keep using `analysisConcepts` unchanged.
   */
  analysisUnits?: readonly AnalysisUnit[];
  unitAttestations?: AttestationsFile;
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

/**
 * V3-B B2: attested/generation-touched units render in full (summary + body
 * + the learner's own edited body if they used Edit, + their "your take" if
 * they typed one); everything else renders as a titles-only "Not yet
 * reviewed" list — never the AI body for a unit the learner hasn't touched.
 */
function renderAnalysisUnitsV3(units: readonly AnalysisUnit[], attestations: AttestationsFile): string {
  const attested = units.filter((u) => isUnitFeedable(attestations[u.id]));
  const notYet = units.filter((u) => !isUnitFeedable(attestations[u.id]));
  const parts: string[] = [];

  if (attested.length > 0) {
    parts.push(
      attested
        .map((u) => {
          const entry = attestations[u.id];
          const anchorList = u.anchors.map((a) => `[${formatTimestamp(a.t)}]`).join(", ");
          const body = entry?.userBody?.trim() || u.body;
          const lines = [`### ${u.label}${anchorList ? ` (${anchorList})` : ""}`, "", u.summary, "", body];
          if (entry?.userTake?.trim()) lines.push("", `**Your take:** ${entry.userTake.trim()}`);
          return lines.join("\n");
        })
        .join("\n\n")
    );
  }
  if (notYet.length > 0) {
    parts.push(["### Not yet reviewed", "", notYet.map((u) => `- ${u.label}`).join("\n")].join("\n"));
  }
  return parts.join("\n\n");
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
  if (input.analysisUnits && input.analysisUnits.length > 0) {
    parts.push("## Concept breakdown", "", renderAnalysisUnitsV3(input.analysisUnits, input.unitAttestations ?? {}), "");
  } else if (input.analysisConcepts && input.analysisConcepts.length > 0) {
    parts.push("## Concept breakdown", "", renderAnalysisConcepts(input.analysisConcepts), "");
  }
  return parts.join("\n");
}
