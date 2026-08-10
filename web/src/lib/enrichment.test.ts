import { describe, expect, it } from "vitest";
import { enrichmentNoticeText } from "./enrichment";

describe("enrichmentNoticeText (ANLZ-02)", () => {
  it("returns null when enrichment is absent", () => {
    expect(enrichmentNoticeText({})).toBeNull();
  });

  it("returns null when enrichment is explicitly false", () => {
    expect(enrichmentNoticeText({ enrichment: false })).toBeNull();
  });

  it("returns the exact locked notice copy when enrichment is true", () => {
    expect(enrichmentNoticeText({ enrichment: true })).toBe("Not stated in this lecture — added for context");
  });

  it("never produces an emoji glyph in any returned string", () => {
    const text = enrichmentNoticeText({ enrichment: true });
    expect(text).not.toBeNull();
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
