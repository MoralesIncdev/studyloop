import { describe, expect, it } from "vitest";
import { findActiveIndex, findFirstIndexAtOrAfter, formatTimestamp, parseTimestamp } from "./time";

describe("parseTimestamp", () => {
  it("parses mm:ss", () => {
    expect(parseTimestamp("31:10")).toBe(31 * 60 + 10);
    expect(parseTimestamp("9:00")).toBe(9 * 60);
  });

  it("parses h:mm:ss", () => {
    expect(parseTimestamp("1:02:03")).toBe(1 * 3600 + 2 * 60 + 3);
  });

  it("returns null for invalid input", () => {
    expect(parseTimestamp("not a time")).toBeNull();
    expect(parseTimestamp("61:99")).toBeNull();
    expect(parseTimestamp("")).toBeNull();
  });
});

describe("formatTimestamp", () => {
  it("formats seconds under an hour as mm:ss", () => {
    expect(formatTimestamp(1870)).toBe("31:10");
    expect(formatTimestamp(5)).toBe("0:05");
  });

  it("formats seconds over an hour as h:mm:ss", () => {
    expect(formatTimestamp(3723)).toBe("1:02:03");
  });

  it("round-trips through parseTimestamp", () => {
    expect(parseTimestamp(formatTimestamp(1870))).toBe(1870);
  });
});

describe("findActiveIndex", () => {
  const items = [{ start: 0 }, { start: 10 }, { start: 25 }, { start: 40 }];

  it("finds the last item whose start is <= t", () => {
    expect(findActiveIndex(items, 0, (i) => i.start)).toBe(0);
    expect(findActiveIndex(items, 24, (i) => i.start)).toBe(1);
    expect(findActiveIndex(items, 25, (i) => i.start)).toBe(2);
    expect(findActiveIndex(items, 999, (i) => i.start)).toBe(3);
  });

  it("returns -1 when t is before the first item", () => {
    expect(findActiveIndex(items, -1, (i) => i.start)).toBe(-1);
  });

  it("handles an empty array", () => {
    expect(findActiveIndex([], 5, (i: { start: number }) => i.start)).toBe(-1);
  });
});

describe("findFirstIndexAtOrAfter", () => {
  const items = [{ start: 0 }, { start: 10 }, { start: 25 }, { start: 40 }];

  it("finds the first item whose start is >= t", () => {
    expect(findFirstIndexAtOrAfter(items, 0, (i) => i.start)).toBe(0);
    expect(findFirstIndexAtOrAfter(items, 5, (i) => i.start)).toBe(1);
    expect(findFirstIndexAtOrAfter(items, 25, (i) => i.start)).toBe(2);
  });

  it("returns items.length when t is past every item", () => {
    expect(findFirstIndexAtOrAfter(items, 999, (i) => i.start)).toBe(4);
  });
});
