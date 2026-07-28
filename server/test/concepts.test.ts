import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  detectProfileAndParse,
  extractBjjAnchors,
  identifyProjectVolume,
  parseBjjCurriculum,
  parseHeadings,
} from "../src/lib/concepts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, "fixtures");

const SEATED_VOL_1 = "/Volumes/SSD2025/Library/BJJ/.../OpenGuardSeatedVolume1.mp4";
const SUPINE_VOL_3 = "/Volumes/SSD2025/Library/BJJ/.../OpenGuardSupineVolume3.mp4";

describe("identifyProjectVolume", () => {
  it("extracts type + volume from a Seated filename", () => {
    expect(identifyProjectVolume(SEATED_VOL_1)).toEqual({ type: "Seated", volume: 1 });
  });

  it("extracts type + volume from a Supine filename", () => {
    expect(identifyProjectVolume(SUPINE_VOL_3)).toEqual({ type: "Supine", volume: 3 });
  });

  it("returns null when the filename has no recognizable volume marker", () => {
    expect(identifyProjectVolume("/videos/random-clip.mp4")).toBeNull();
  });

  it("returns null for a nullish path", () => {
    expect(identifyProjectVolume(null)).toBeNull();
    expect(identifyProjectVolume(undefined)).toBeNull();
  });
});

describe("bjj-curriculum profile", () => {
  it("splits ## and ### headings into cards", async () => {
    const markdown = await fs.readFile(path.join(FIXTURES, "concepts-bjj.md"), "utf8");
    const cards = parseBjjCurriculum(markdown, SEATED_VOL_1);
    const titles = cards.map((c) => c.title);
    expect(titles).toContain("MODULE 1 — Concave Shoulders");
    expect(titles).toContain("MODULE 2 — The Map: Four Stances and the Two Exposures");
    expect(titles).toContain("MODULE 7 — Supine Entanglement Structure");
  });

  it("matches anchors to the project when type+volume agree, with real seconds", async () => {
    const markdown = await fs.readFile(path.join(FIXTURES, "concepts-bjj.md"), "utf8");
    const cards = parseBjjCurriculum(markdown, SEATED_VOL_1);
    const module1 = cards.find((c) => c.title.startsWith("MODULE 1"))!;
    // "Seated Vol 1 @ 31:10, 34:14, 37:02" — all three apply to a Seated Vol 1 project.
    const matched = module1.anchors.filter((a) => a.t !== null).map((a) => a.t);
    expect(matched).toEqual([31 * 60 + 10, 34 * 60 + 14, 37 * 60 + 2]);
  });

  it("keeps anchors from a non-matching volume, but with t:null", async () => {
    const markdown = await fs.readFile(path.join(FIXTURES, "concepts-bjj.md"), "utf8");
    const cards = parseBjjCurriculum(markdown, SEATED_VOL_1);
    const module7 = cards.find((c) => c.title.startsWith("MODULE 7"))!;
    // Citation is "Supine V3 [file 02] @ 5:15" — project is Seated Vol 1, so unmatched.
    expect(module7.anchors).toHaveLength(1);
    expect(module7.anchors[0].t).toBeNull();
  });

  it("matches a Supine project against a Supine citation", async () => {
    const markdown = await fs.readFile(path.join(FIXTURES, "concepts-bjj.md"), "utf8");
    const cards = parseBjjCurriculum(markdown, SUPINE_VOL_3);
    const module7 = cards.find((c) => c.title.startsWith("MODULE 7"))!;
    expect(module7.anchors[0].t).toBe(5 * 60 + 15);
  });

  it("extractBjjAnchors returns t:null with no project identity at all", () => {
    const anchors = extractBjjAnchors("Seated Vol 1 @ 1:00", null);
    expect(anchors).toEqual([{ t: null }]);
  });
});

describe("headings profile", () => {
  it("splits ## headings into cards regardless of citation format", async () => {
    const markdown = await fs.readFile(path.join(FIXTURES, "concepts-headings.md"), "utf8");
    const cards = parseHeadings(markdown);
    expect(cards.map((c) => c.title)).toEqual(["Feedback Loops", "Stocks and Flows", "Leverage Points"]);
  });

  it("extracts @ mm:ss and [mm:ss] tokens as real (non-null) anchors", async () => {
    const markdown = await fs.readFile(path.join(FIXTURES, "concepts-headings.md"), "utf8");
    const cards = parseHeadings(markdown);
    const feedback = cards.find((c) => c.title === "Feedback Loops")!;
    expect(feedback.anchors.map((a) => a.t)).toEqual([2 * 60 + 15, 4 * 60 + 30]);
  });

  it("a section with no timestamp tokens has zero anchors", async () => {
    const markdown = await fs.readFile(path.join(FIXTURES, "concepts-headings.md"), "utf8");
    const cards = parseHeadings(markdown);
    const leverage = cards.find((c) => c.title === "Leverage Points")!;
    expect(leverage.anchors).toHaveLength(0);
  });
});

describe("detectProfileAndParse", () => {
  it("auto-detects bjj-curriculum when >=2 cards have a real anchor", async () => {
    const markdown = await fs.readFile(path.join(FIXTURES, "concepts-bjj.md"), "utf8");
    const { profile } = detectProfileAndParse(markdown, SEATED_VOL_1);
    expect(profile).toBe("bjj-curriculum");
  });

  it("falls back to headings when the doc isn't BJJ-cited", async () => {
    const markdown = await fs.readFile(path.join(FIXTURES, "concepts-headings.md"), "utf8");
    const { profile, cards } = detectProfileAndParse(markdown, null);
    expect(profile).toBe("headings");
    expect(cards.length).toBeGreaterThan(0);
  });

  it("falls back to headings when the project video doesn't match any citation", async () => {
    // Same BJJ doc, but the project is a volume nothing in the fixture cites -> <2 anchored cards.
    const markdown = await fs.readFile(path.join(FIXTURES, "concepts-bjj.md"), "utf8");
    const { profile } = detectProfileAndParse(markdown, "/videos/OpenGuardSeatedVolume99.mp4");
    expect(profile).toBe("headings");
  });
});
