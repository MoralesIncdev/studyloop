import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderCompiledDocument, renderNotesTokens } from "../src/lib/compileRenderer.js";
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
