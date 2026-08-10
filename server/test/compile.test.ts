import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderCompiledDocument, renderNotesTokens } from "../src/lib/compileRenderer.js";
import type { AnalysisConcept, AnalysisUnit, Pearl } from "../src/lib/analysis.js";
import type { Bubble, Source } from "../src/lib/models.js";
import type { ConceptCard } from "../src/lib/concepts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, "fixtures");

describe("renderNotesTokens", () => {
  it("converts ^t:123.4 tokens into [mm:ss](#t=..) links", () => {
    expect(renderNotesTokens("see ^t:65 for detail")).toBe("see [1:05](#t=65) for detail");
  });

  it("leaves plain text untouched when there are no tokens", () => {
    expect(renderNotesTokens("no tokens here")).toBe("no tokens here");
  });
});

describe("renderCompiledDocument (golden file)", () => {
  it("matches the golden compiled markdown for a fixed set of inputs", async () => {
    const source: Source = {
      type: "local",
      path:
        "/Volumes/SSD2025/Library/BJJ/Gordon Ryan/Gordon Ryan - Systematically Attacking From Open Guard Seated Position/OpenGuardSeatedVolume1.mp4",
    };

    const bubbles: Bubble[] = [
      { id: "b2", t: 754, text: "Great detail on grip fighting posture.", shot: "shots/shot-754000.jpg", createdAt: "2026-07-28T00:00:00Z" },
      { id: "b3", t: 900, text: "No image for this one, just a note.", shot: null, createdAt: "2026-07-28T00:00:00Z" },
      { id: "b1", t: 120, text: "", shot: "shots/shot-120000.jpg", createdAt: "2026-07-28T00:00:00Z" },
    ];

    const concepts: ConceptCard[] = [
      {
        id: "module-1",
        title: "MODULE 1 — Concave Shoulders",
        body: "...",
        raw: "...",
        anchors: [{ t: 1870 }],
      },
      {
        id: "module-2",
        title: "MODULE 2 — The Map",
        body: "...",
        raw: "...",
        anchors: [{ t: 2200 }], // past watchedUpTo -> not covered
      },
      {
        id: "module-7",
        title: "MODULE 7 — Supine Entanglement",
        body: "...",
        raw: "...",
        anchors: [{ t: null }], // never applies to this project -> not covered
      },
    ];

    const markdown = renderCompiledDocument({
      title: "Open Guard Seated — Volume 1",
      source,
      notes: "Concave shoulders are the key habit. Revisit ^t:1870 for the rocking-chair spine cue.",
      bubbles,
      concepts,
      watchedUpTo: 2000,
      compiledAt: "2026-07-28",
    });

    const golden = await fs.readFile(path.join(FIXTURES, "compile-golden.md"), "utf8");
    expect(markdown).toBe(golden);
  });

  it("never includes uncovered cards or the raw transcript, only what the user captured", async () => {
    const source: Source = { type: "youtube", videoId: "abc123", url: "https://youtube.com/watch?v=abc123" };
    const concepts: ConceptCard[] = [
      { id: "a", title: "Covered Card", body: "full transcript excerpt that must not leak", raw: "raw", anchors: [{ t: 10 }] },
      { id: "b", title: "Uncovered Card", body: "should not appear", raw: "raw", anchors: [{ t: 999 }] },
    ];
    const markdown = renderCompiledDocument({
      title: "Some Lecture",
      source,
      notes: "",
      bubbles: [],
      concepts,
      watchedUpTo: 50,
      compiledAt: "2026-07-28",
    });
    expect(markdown).toContain("Covered Card");
    expect(markdown).not.toContain("Uncovered Card");
    expect(markdown).not.toContain("full transcript excerpt");
    expect(markdown).toContain("_No captures this session._");
  });
});

describe("renderCompiledDocument — V3-A 'In my own words' synthesis checkpoint", () => {
  const source: Source = { type: "youtube", videoId: "abc123", url: "https://youtu.be/abc123" };

  it("renders the visible placeholder line as the FIRST section when lessonSummary is omitted (skipped)", () => {
    const markdown = renderCompiledDocument({
      title: "No summary",
      source,
      notes: "",
      bubbles: [],
      concepts: [],
      watchedUpTo: 0,
      compiledAt: "2026-07-28",
    });
    expect(markdown).toContain("## In my own words\n\n*[Write your summary to complete this lesson]*");
    // It's the first section — before Notes/Captures/Concepts Covered.
    const ownWordsIdx = markdown.indexOf("## In my own words");
    expect(ownWordsIdx).toBeGreaterThan(-1);
    expect(ownWordsIdx).toBeLessThan(markdown.indexOf("## Notes"));
  });

  it("also renders the placeholder for a blank/whitespace-only lessonSummary", () => {
    const markdown = renderCompiledDocument({
      title: "Blank summary",
      source,
      notes: "",
      bubbles: [],
      concepts: [],
      watchedUpTo: 0,
      compiledAt: "2026-07-28",
      lessonSummary: "   ",
    });
    expect(markdown).toContain("*[Write your summary to complete this lesson]*");
  });

  it("renders the learner's own-words summary as the first section when provided", () => {
    const markdown = renderCompiledDocument({
      title: "With summary",
      source,
      notes: "Some notes.",
      bubbles: [],
      concepts: [],
      watchedUpTo: 0,
      compiledAt: "2026-07-28",
      lessonSummary: "This lesson covered grip fighting from a seated open guard.",
    });
    expect(markdown).toContain("## In my own words\n\nThis lesson covered grip fighting from a seated open guard.");
    expect(markdown).not.toContain("[Write your summary to complete this lesson]");
    const ownWordsIdx = markdown.indexOf("## In my own words");
    expect(ownWordsIdx).toBeLessThan(markdown.indexOf("## Notes"));
  });
});

describe("renderCompiledDocument — V2-C analysis sections", () => {
  const source: Source = { type: "youtube", videoId: "abc123", url: "https://youtu.be/abc123" };

  it("omits Pearls/Concept breakdown sections entirely when no analysis was passed", () => {
    const markdown = renderCompiledDocument({
      title: "No analysis yet",
      source,
      notes: "",
      bubbles: [],
      concepts: [],
      watchedUpTo: 0,
      compiledAt: "2026-07-28",
    });
    expect(markdown).not.toContain("## Pearls");
    expect(markdown).not.toContain("## Concept breakdown");
  });

  it("renders a Pearls section, importance-starred and importance-sorted, after the Concepts Covered section", () => {
    const pearls: Pearl[] = [
      { t: 900, label: "Minor detail", insight: "A small point.", importance: 1 },
      { t: 65, label: "Critical insight", insight: "The single most important thing said.", importance: 3 },
      { t: 300, label: "Supporting point", insight: "Backs up the main idea.", importance: 2 },
    ];
    const markdown = renderCompiledDocument({
      title: "With pearls",
      source,
      notes: "",
      bubbles: [],
      concepts: [],
      watchedUpTo: 0,
      compiledAt: "2026-07-28",
      analysisPearls: pearls,
    });
    expect(markdown).toContain("## Pearls");
    // Timestamps are seek LINKS (#t=N), same convention as note tokens —
    // plain-text brackets were the 2026-08-08 real-lecture-proof finding.
    expect(markdown).toContain("★★★ **[1:05](#t=65) Critical insight** — The single most important thing said.");
    expect(markdown).toContain("★★ **[5:00](#t=300) Supporting point**");
    expect(markdown).toContain("★ **[15:00](#t=900) Minor detail**");
    // Importance-sorted (3 before 2 before 1), not chronological.
    const critIdx = markdown.indexOf("Critical insight");
    const supportIdx = markdown.indexOf("Supporting point");
    const minorIdx = markdown.indexOf("Minor detail");
    expect(critIdx).toBeLessThan(supportIdx);
    expect(supportIdx).toBeLessThan(minorIdx);
    // Comes after "## Concepts Covered" (the last pre-existing section).
    expect(markdown.indexOf("## Concepts Covered")).toBeLessThan(markdown.indexOf("## Pearls"));
  });

  it("ANLZ-02: a flagged pearl's bullet carries the enrichment note; an unflagged pearl's does not", () => {
    const pearls: Pearl[] = [
      { t: 65, label: "Grounded insight", insight: "Backed by what was said.", importance: 3 },
      { t: 300, label: "Enriched insight", insight: "Goes beyond the transcript.", importance: 2, enrichment: true },
    ];
    const markdown = renderCompiledDocument({
      title: "With flagged pearl",
      source,
      notes: "",
      bubbles: [],
      concepts: [],
      watchedUpTo: 0,
      compiledAt: "2026-07-28",
      analysisPearls: pearls,
    });
    expect(markdown).toContain(
      "★★ **[5:00](#t=300) Enriched insight** — Goes beyond the transcript. _(Not stated in this lecture — added for context)_"
    );
    expect(markdown).toContain("★★★ **[1:05](#t=65) Grounded insight** — Backed by what was said.");
    // The grounded pearl's bullet does not pick up the marker.
    const groundedLine = markdown.split("\n").find((l) => l.includes("Grounded insight"));
    expect(groundedLine).not.toContain("Not stated in this lecture");
  });

  it("renders a Concept breakdown section with anchor timestamps and body markdown", () => {
    const concepts: AnalysisConcept[] = [
      { id: "grip-fighting", title: "Grip Fighting", summary: "How to control grips.", body: "Detailed body text.", anchors: [{ t: 65 }, { t: 500 }] },
    ];
    const markdown = renderCompiledDocument({
      title: "With concept breakdown",
      source,
      notes: "",
      bubbles: [],
      concepts: [],
      watchedUpTo: 0,
      compiledAt: "2026-07-28",
      analysisConcepts: concepts,
    });
    expect(markdown).toContain("## Concept breakdown");
    expect(markdown).toContain("### Grip Fighting ([1:05](#t=65), [8:20](#t=500))");
    expect(markdown).toContain("How to control grips.");
    expect(markdown).toContain("Detailed body text.");
  });

  it("omits an empty Pearls/Concept breakdown section (e.g. analysis ran but produced none)", () => {
    const markdown = renderCompiledDocument({
      title: "Empty analysis arrays",
      source,
      notes: "",
      bubbles: [],
      concepts: [],
      watchedUpTo: 0,
      compiledAt: "2026-07-28",
      analysisPearls: [],
      analysisConcepts: [],
    });
    expect(markdown).not.toContain("## Pearls");
    expect(markdown).not.toContain("## Concept breakdown");
  });
});

describe("renderCompiledDocument — V3-B B2 attested vs 'Not yet reviewed' units", () => {
  const source: Source = { type: "youtube", videoId: "abc123", url: "https://youtu.be/abc123" };
  const units: AnalysisUnit[] = [
    {
      id: "u-attested",
      type: "MECHANISM",
      label: "Attested Unit",
      summary: "Summary of the attested unit.",
      body: "Full AI body of the attested unit.",
      anchors: [{ t: 65, quote: "q" }],
      confidence: 0.9,
      threshold: false,
    },
    {
      id: "u-untouched",
      type: "CLAIM",
      label: "Untouched Unit",
      summary: "Summary the reader should never see.",
      body: "Body the reader should never see.",
      anchors: [{ t: 200, quote: "q2" }],
      confidence: 0.8,
      threshold: false,
    },
  ];

  it("renders an attested unit in full, including the learner's own take", () => {
    const markdown = renderCompiledDocument({
      title: "V3 compile",
      source,
      notes: "",
      bubbles: [],
      concepts: [],
      watchedUpTo: 0,
      compiledAt: "2026-07-28",
      analysisUnits: units,
      unitAttestations: { "u-attested": { status: "attested", userTake: "My own explanation.", at: "t" } },
    });
    expect(markdown).toContain("### Attested Unit ([1:05](#t=65))");
    expect(markdown).toContain("Summary of the attested unit.");
    expect(markdown).toContain("Full AI body of the attested unit.");
    expect(markdown).toContain("**Your take:** My own explanation.");
  });

  it("renders an unattested unit as a titles-only 'Not yet reviewed' entry — never its AI body", () => {
    const markdown = renderCompiledDocument({
      title: "V3 compile",
      source,
      notes: "",
      bubbles: [],
      concepts: [],
      watchedUpTo: 0,
      compiledAt: "2026-07-28",
      analysisUnits: units,
      unitAttestations: {},
    });
    expect(markdown).toContain("### Not yet reviewed");
    expect(markdown).toContain("- Untouched Unit");
    expect(markdown).not.toContain("Body the reader should never see.");
    expect(markdown).not.toContain("Summary the reader should never see.");
  });

  it("a dismissed unit renders under its own 'Dismissed' list, never under 'Not yet reviewed'", () => {
    const markdown = renderCompiledDocument({
      title: "V3 compile",
      source,
      notes: "",
      bubbles: [],
      concepts: [],
      watchedUpTo: 0,
      compiledAt: "2026-07-28",
      analysisUnits: units,
      unitAttestations: { "u-attested": { status: "dismissed", at: "t" } },
    });
    // Dismissed = the learner reviewed it and judged it not worth keeping —
    // titles-only like unreviewed units, but labeled truthfully.
    expect(markdown).toContain("### Dismissed");
    expect(markdown).toContain("- Attested Unit");
    expect(markdown).not.toContain("Full AI body of the attested unit.");
    const notYetSection = markdown.slice(markdown.indexOf("### Not yet reviewed"), markdown.indexOf("### Dismissed"));
    expect(notYetSection).toContain("- Untouched Unit");
    expect(notYetSection).not.toContain("- Attested Unit");
  });

  // COMP-01 shipped in commit 468e0b8 alongside the dismissed-partition test
  // above; these two cases pin the two edges that test left unguarded —
  // dismiss-outranks-userTake (isUnitFeedable's dismiss-always-wins ordering),
  // and the section's truthful absence when nothing is dismissed.
  it("COMP-01 / SC4: dismissal outranks a generation attempt — a dismissed unit carrying a userTake still renders only in the Dismissed titles list, never its AI body or the learner's take", () => {
    const markdown = renderCompiledDocument({
      title: "V3 compile",
      source,
      notes: "",
      bubbles: [],
      concepts: [],
      watchedUpTo: 0,
      compiledAt: "2026-07-28",
      analysisUnits: units,
      unitAttestations: { "u-attested": { status: "dismissed", userTake: "I typed this before dismissing it.", at: "t" } },
    });
    expect(markdown).toContain("### Dismissed");
    expect(markdown).toContain("- Attested Unit");
    expect(markdown).not.toContain("Full AI body of the attested unit.");
    expect(markdown).not.toContain("I typed this before dismissing it.");
    expect(markdown).not.toContain("**Your take:**");
  });

  it("COMP-01 / SC4: the Dismissed heading is absent from the document when nothing is dismissed — the section is truthful, not a permanent empty shell", () => {
    const markdown = renderCompiledDocument({
      title: "V3 compile",
      source,
      notes: "",
      bubbles: [],
      concepts: [],
      watchedUpTo: 0,
      compiledAt: "2026-07-28",
      analysisUnits: units,
      unitAttestations: { "u-attested": { status: "attested", at: "t" } },
    });
    expect(markdown).not.toContain("### Dismissed");
    expect(markdown).toContain("### Not yet reviewed");
    expect(markdown).toContain("- Untouched Unit");
  });

  it("a bare userTake (no explicit attest) is still enough to render a unit in full", () => {
    const markdown = renderCompiledDocument({
      title: "V3 compile",
      source,
      notes: "",
      bubbles: [],
      concepts: [],
      watchedUpTo: 0,
      compiledAt: "2026-07-28",
      analysisUnits: [units[1]],
      unitAttestations: { "u-untouched": { userTake: "typed something", at: "t" } },
    });
    expect(markdown).toContain("### Untouched Unit");
    expect(markdown).toContain("Body the reader should never see.");
    expect(markdown).not.toContain("### Not yet reviewed");
  });

  it("prefers a userBody edit over the original AI body when the unit was edited", () => {
    const markdown = renderCompiledDocument({
      title: "V3 compile",
      source,
      notes: "",
      bubbles: [],
      concepts: [],
      watchedUpTo: 0,
      compiledAt: "2026-07-28",
      analysisUnits: [units[0]],
      unitAttestations: { "u-attested": { status: "attested", userBody: "Learner-edited body.", at: "t" } },
    });
    expect(markdown).toContain("Learner-edited body.");
    expect(markdown).not.toContain("Full AI body of the attested unit.");
  });

  it("analysisUnits takes priority over analysisConcepts when both are provided", () => {
    const markdown = renderCompiledDocument({
      title: "V3 compile",
      source,
      notes: "",
      bubbles: [],
      concepts: [],
      watchedUpTo: 0,
      compiledAt: "2026-07-28",
      analysisUnits: [units[0]],
      unitAttestations: { "u-attested": { status: "attested", at: "t" } },
      analysisConcepts: [{ id: "legacy", title: "Legacy Concept", summary: "s", body: "b", anchors: [] }],
    });
    expect(markdown).not.toContain("Legacy Concept");
    expect(markdown).toContain("Attested Unit");
  });

  it("ANLZ-02: an attested flagged unit carries the enrichment note on its own line under the heading, above the summary", () => {
    const flaggedUnits: AnalysisUnit[] = [{ ...units[0], enrichment: true }];
    const markdown = renderCompiledDocument({
      title: "V3 compile",
      source,
      notes: "",
      bubbles: [],
      concepts: [],
      watchedUpTo: 0,
      compiledAt: "2026-07-28",
      analysisUnits: flaggedUnits,
      unitAttestations: { "u-attested": { status: "attested", at: "t" } },
    });
    const heading = "### Attested Unit ([1:05](#t=65))";
    const expectedBlock = [heading, "", "_Not stated in this lecture — added for context_", "", "Summary of the attested unit.", "", "Full AI body of the attested unit."].join("\n");
    expect(markdown).toContain(expectedBlock);
  });

  it("ANLZ-02: an attested UNFLAGGED unit's rendered block is byte-identical to before this plan (no marker line)", () => {
    const markdown = renderCompiledDocument({
      title: "V3 compile",
      source,
      notes: "",
      bubbles: [],
      concepts: [],
      watchedUpTo: 0,
      compiledAt: "2026-07-28",
      analysisUnits: [units[0]],
      unitAttestations: { "u-attested": { status: "attested", at: "t" } },
    });
    const expectedBlock = ["### Attested Unit ([1:05](#t=65))", "", "Summary of the attested unit.", "", "Full AI body of the attested unit."].join("\n");
    expect(markdown).toContain(expectedBlock);
    expect(markdown).not.toContain("Not stated in this lecture");
  });

  it("ANLZ-02: the 'Not yet reviewed' titles-only list carries no marker, even for a flagged unattested unit", () => {
    const flaggedUnits: AnalysisUnit[] = [units[0], { ...units[1], enrichment: true }];
    const markdown = renderCompiledDocument({
      title: "V3 compile",
      source,
      notes: "",
      bubbles: [],
      concepts: [],
      watchedUpTo: 0,
      compiledAt: "2026-07-28",
      analysisUnits: flaggedUnits,
      unitAttestations: {},
    });
    expect(markdown).toContain("### Not yet reviewed");
    expect(markdown).toContain("- Untouched Unit");
    expect(markdown).not.toContain("Not stated in this lecture");
  });
});
