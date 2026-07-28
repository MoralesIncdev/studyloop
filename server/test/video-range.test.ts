import { describe, expect, it } from "vitest";
import { parseRangeHeader } from "../src/routes/video.js";

const SIZE = 1000;

describe("parseRangeHeader", () => {
  it("returns 'none' when there is no Range header", () => {
    expect(parseRangeHeader(undefined, SIZE)).toBe("none");
  });

  it("parses a normal bytes=start-end range", () => {
    expect(parseRangeHeader("bytes=0-499", SIZE)).toEqual({ start: 0, end: 499 });
    expect(parseRangeHeader("bytes=500-999", SIZE)).toEqual({ start: 500, end: 999 });
  });

  it("parses an open-ended range (bytes=start-)", () => {
    expect(parseRangeHeader("bytes=900-", SIZE)).toEqual({ start: 900, end: 999 });
  });

  it("parses a suffix range (bytes=-N) as the final N bytes", () => {
    expect(parseRangeHeader("bytes=-500", SIZE)).toEqual({ start: 500, end: 999 });
    expect(parseRangeHeader("bytes=-1", SIZE)).toEqual({ start: 999, end: 999 });
  });

  it("clamps a suffix range longer than the file to the whole file", () => {
    expect(parseRangeHeader("bytes=-5000", SIZE)).toEqual({ start: 0, end: 999 });
  });

  it("clamps an end beyond the file size instead of rejecting it", () => {
    expect(parseRangeHeader("bytes=0-999999", SIZE)).toEqual({ start: 0, end: 999 });
  });

  it("rejects a suffix range of 0 or negative length as invalid", () => {
    expect(parseRangeHeader("bytes=-0", SIZE)).toBe("invalid");
  });

  it("rejects a suffix range against an empty file as invalid", () => {
    expect(parseRangeHeader("bytes=-500", 0)).toBe("invalid");
  });

  it("rejects a totally malformed Range header", () => {
    expect(parseRangeHeader("bytes=", SIZE)).toBe("invalid");
    expect(parseRangeHeader("bytes=-", SIZE)).toBe("invalid");
    expect(parseRangeHeader("not-a-range", SIZE)).toBe("invalid");
    expect(parseRangeHeader("bytes=abc-def", SIZE)).toBe("invalid");
  });

  it("rejects a start at or past the file size as invalid (unsatisfiable)", () => {
    expect(parseRangeHeader("bytes=1000-1001", SIZE)).toBe("invalid");
    expect(parseRangeHeader(`bytes=${SIZE}-`, SIZE)).toBe("invalid");
  });

  it("rejects start > end as invalid", () => {
    expect(parseRangeHeader("bytes=500-100", SIZE)).toBe("invalid");
  });

  it("treats a multi-range request as unsupported (caller falls back to a full 200)", () => {
    expect(parseRangeHeader("bytes=0-99,200-299", SIZE)).toBe("unsupported");
  });
});
