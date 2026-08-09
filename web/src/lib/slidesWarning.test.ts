import { describe, expect, it } from "vitest";
import { slidesWarningText } from "./slidesWarning";
import type { SlidesMeta } from "./types";

function meta(overrides: Partial<SlidesMeta>): SlidesMeta {
  return {
    filename: "deck.pdf",
    pageCount: 0,
    uploadedAt: "2026-08-09T00:00:00.000Z",
    emptyPageCount: 0,
    ...overrides,
  };
}

describe("slidesWarningText (PIPE-02)", () => {
  it("returns null when no pages are empty", () => {
    expect(slidesWarningText(meta({ emptyPageCount: 0, pageCount: 12 }))).toBeNull();
  });

  it("returns singular partial wording for 1 of 2 empty pages", () => {
    expect(slidesWarningText(meta({ emptyPageCount: 1, pageCount: 2 }))).toBe(
      "1 of 2 pages has no extractable text — analysis will miss those slides"
    );
  });

  it("returns plural partial wording for 3 of 12 empty pages", () => {
    expect(slidesWarningText(meta({ emptyPageCount: 3, pageCount: 12 }))).toBe(
      "3 of 12 pages have no extractable text — analysis will miss those slides"
    );
  });

  it("returns all-empty wording (plural noun) when every page is empty", () => {
    expect(slidesWarningText(meta({ emptyPageCount: 4, pageCount: 4 }))).toBe(
      "no extractable text on any of the 4 pages — this deck looks image-only, so the slides channel is empty"
    );
  });

  it("returns all-empty wording (singular noun) for a single-page deck", () => {
    expect(slidesWarningText(meta({ emptyPageCount: 1, pageCount: 1 }))).toBe(
      "no extractable text on any of the 1 page — this deck looks image-only, so the slides channel is empty"
    );
  });

  it("returns null when pageCount is 0", () => {
    expect(slidesWarningText(meta({ emptyPageCount: 0, pageCount: 0 }))).toBeNull();
  });

  it("never produces an emoji glyph in any returned string", () => {
    const cases: SlidesMeta[] = [
      meta({ emptyPageCount: 1, pageCount: 2 }),
      meta({ emptyPageCount: 3, pageCount: 12 }),
      meta({ emptyPageCount: 4, pageCount: 4 }),
      meta({ emptyPageCount: 1, pageCount: 1 }),
    ];
    for (const m of cases) {
      const text = slidesWarningText(m);
      expect(text).not.toBeNull();
      expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});
