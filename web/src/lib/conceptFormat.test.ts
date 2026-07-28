import { describe, expect, it } from "vitest";
import { firstBodyLine, parseConceptBody } from "./conceptFormat";

describe("parseConceptBody", () => {
  it("splits headings and paragraphs into blocks", () => {
    const body = "## Objective\nControl the collar.\n\n### Detail\nSecond paragraph.";
    const blocks = parseConceptBody(body);
    expect(blocks).toEqual([
      { type: "heading", level: 2, inlines: [{ bold: false, text: "Objective" }] },
      { type: "paragraph", inlines: [{ bold: false, text: "Control the collar." }] },
      { type: "heading", level: 3, inlines: [{ bold: false, text: "Detail" }] },
      { type: "paragraph", inlines: [{ bold: false, text: "Second paragraph." }] },
    ]);
  });

  it("joins hard-wrapped consecutive lines into one paragraph", () => {
    const blocks = parseConceptBody("line one\nline two\nline three");
    expect(blocks).toEqual([
      { type: "paragraph", inlines: [{ bold: false, text: "line one line two line three" }] },
    ]);
  });

  it("parses bold spans within a paragraph", () => {
    const blocks = parseConceptBody("Keep **strong grips** and posture.");
    expect(blocks).toEqual([
      {
        type: "paragraph",
        inlines: [
          { bold: false, text: "Keep " },
          { bold: true, text: "strong grips" },
          { bold: false, text: " and posture." },
        ],
      },
    ]);
  });

  it("returns an empty array for an empty body", () => {
    expect(parseConceptBody("")).toEqual([]);
    expect(parseConceptBody("   \n  \n")).toEqual([]);
  });

  it("ignores blank lines between paragraphs", () => {
    const blocks = parseConceptBody("para one\n\n\npara two");
    expect(blocks).toEqual([
      { type: "paragraph", inlines: [{ bold: false, text: "para one" }] },
      { type: "paragraph", inlines: [{ bold: false, text: "para two" }] },
    ]);
  });
});

describe("firstBodyLine", () => {
  it("returns the first non-empty line", () => {
    expect(firstBodyLine("\n\nFirst real line.\nSecond line.")).toBe("First real line.");
  });

  it("strips a leading heading marker", () => {
    expect(firstBodyLine("### OBJECTIVE\nSecure the underhook.")).toBe("OBJECTIVE");
  });

  it("strips bold markup", () => {
    expect(firstBodyLine("**OBJECTIVE:** secure the underhook.")).toBe("OBJECTIVE: secure the underhook.");
  });

  it("returns an empty string for a body with no content", () => {
    expect(firstBodyLine("   \n\n  ")).toBe("");
    expect(firstBodyLine("")).toBe("");
  });
});
