import { describe, expect, it } from "vitest";
import { normalizeShotSrc, parseInline, parseMarkdownLite } from "./markdownLite";

describe("parseInline", () => {
  it("parses plain text with no markup", () => {
    expect(parseInline("just text")).toEqual([{ type: "text", value: "just text" }]);
  });

  it("parses a **bold** run", () => {
    expect(parseInline("**Source:** the file")).toEqual([
      { type: "bold", value: "Source:" },
      { type: "text", value: " the file" },
    ]);
  });

  it("parses a [text](url) link", () => {
    expect(parseInline("see [1:05](#t=65) for detail")).toEqual([
      { type: "text", value: "see " },
      { type: "link", text: "1:05", href: "#t=65" },
      { type: "text", value: " for detail" },
    ]);
  });

  it("parses bold and a link in the same line", () => {
    expect(parseInline("**[1:05]** great detail")).toEqual([
      { type: "bold", value: "[1:05]" },
      { type: "text", value: " great detail" },
    ]);
  });
});

describe("parseMarkdownLite", () => {
  it("parses headings at three levels", () => {
    const blocks = parseMarkdownLite("# Title\n\n## Section\n\n### Sub");
    expect(blocks).toEqual([
      { type: "heading", level: 1, text: "Title" },
      { type: "heading", level: 2, text: "Section" },
      { type: "heading", level: 3, text: "Sub" },
    ]);
  });

  it("parses a horizontal rule", () => {
    expect(parseMarkdownLite("---")).toEqual([{ type: "hr" }]);
  });

  it("skips blank lines", () => {
    const blocks = parseMarkdownLite("# A\n\n\n\n# B");
    expect(blocks).toEqual([
      { type: "heading", level: 1, text: "A" },
      { type: "heading", level: 1, text: "B" },
    ]);
  });

  it("parses a standalone image line", () => {
    const blocks = parseMarkdownLite("![shot](shots/x.jpg)");
    expect(blocks).toEqual([{ type: "image", alt: "shot", src: "shots/x.jpg" }]);
  });

  it("parses a plain paragraph", () => {
    expect(parseMarkdownLite("Concave shoulders are the key habit.")).toEqual([
      { type: "paragraph", inline: [{ type: "text", value: "Concave shoulders are the key habit." }] },
    ]);
  });

  it("parses a bubble list item with an image continuation (compileRenderer's exact shape)", () => {
    const markdown = "- **[12:34]** Great detail on grip fighting posture.\n  ![shot](../shots/shot-754000.jpg)";
    const blocks = parseMarkdownLite(markdown);
    expect(blocks).toEqual([
      {
        type: "list",
        items: [
          {
            inline: [
              { type: "bold", value: "[12:34]" },
              { type: "text", value: " Great detail on grip fighting posture." },
            ],
            image: { alt: "shot", src: "../shots/shot-754000.jpg" },
          },
        ],
      },
    ]);
  });

  it("parses a list item with no image continuation (e.g. a text-only bubble)", () => {
    const blocks = parseMarkdownLite("- **[15:00]** No image for this one, just a note.");
    expect(blocks).toEqual([
      {
        type: "list",
        items: [
          {
            inline: [
              { type: "bold", value: "[15:00]" },
              { type: "text", value: " No image for this one, just a note." },
            ],
          },
        ],
      },
    ]);
  });

  it("groups multiple consecutive list items into one list block", () => {
    const blocks = parseMarkdownLite("- MODULE 1 — Concave Shoulders (31:10)\n- MODULE 7 — Supine Entanglement");
    expect(blocks).toEqual([
      {
        type: "list",
        items: [
          { inline: [{ type: "text", value: "MODULE 1 — Concave Shoulders (31:10)" }] },
          { inline: [{ type: "text", value: "MODULE 7 — Supine Entanglement" }] },
        ],
      },
    ]);
  });

  it("parses the full shape of a compiled document end to end", () => {
    const markdown = [
      "# Open Guard Seated — Volume 1",
      "",
      "**Source:** OpenGuardSeatedVolume1.mp4",
      "**Compiled:** 2026-07-28",
      "",
      "---",
      "",
      "## Notes",
      "",
      "Concave shoulders are the key habit. Revisit [31:10](#t=1870) for the cue.",
      "",
      "## Captures",
      "",
      "- **[12:34]** Great detail on grip fighting posture.",
      "  ![shot](../shots/shot-754000.jpg)",
      "",
      "## Concepts Covered",
      "",
      "- MODULE 1 — Concave Shoulders (31:10)",
      "",
    ].join("\n");

    const blocks = parseMarkdownLite(markdown);
    expect(blocks[0]).toEqual({ type: "heading", level: 1, text: "Open Guard Seated — Volume 1" });
    expect(blocks.some((b) => b.type === "hr")).toBe(true);
    expect(blocks.filter((b) => b.type === "heading" && b.level === 2).map((b) => (b as { text: string }).text)).toEqual([
      "Notes",
      "Captures",
      "Concepts Covered",
    ]);
    const captureList = blocks.find(
      (b) => b.type === "list" && b.items.some((item) => item.image)
    );
    expect(captureList).toBeDefined();
  });
});

describe("normalizeShotSrc", () => {
  it("strips a single ../ prefix (Captures section, exports/ relative)", () => {
    expect(normalizeShotSrc("../shots/shot-1.jpg")).toBe("shots/shot-1.jpg");
  });

  it("leaves an already project-relative path untouched (Notes section)", () => {
    expect(normalizeShotSrc("shots/shot-1.jpg")).toBe("shots/shot-1.jpg");
  });

  it("strips a ./ prefix", () => {
    expect(normalizeShotSrc("./shots/shot-1.jpg")).toBe("shots/shot-1.jpg");
  });
});
