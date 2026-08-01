import { describe, expect, it } from "vitest";
import { buildCaptureCabinetRows } from "./captureCabinet";
import type { Bubble } from "./types";

const bubble = (over: Partial<Bubble>): Bubble => ({
  id: "b",
  t: 0,
  text: "",
  shot: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("buildCaptureCabinetRows", () => {
  it("orders reverse-chronologically by createdAt, not by video timestamp", () => {
    const rows = buildCaptureCabinetRows([
      bubble({ id: "first", t: 900, createdAt: "2026-01-01T00:00:00.000Z" }),
      bubble({ id: "second", t: 10, createdAt: "2026-01-01T00:00:05.000Z" }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["second", "first"]);
  });

  it("flags mined captures via the lib/mining.ts header convention", () => {
    const rows = buildCaptureCabinetRows([bubble({ text: "[mined 01:00–01:20] some transcript" })]);
    expect(rows[0].mined).toBe(true);
  });

  it("does not flag a plain note as mined", () => {
    const rows = buildCaptureCabinetRows([bubble({ text: "just a note" })]);
    expect(rows[0].mined).toBe(false);
  });

  it("flags a screenshot-only capture (empty text + a shot)", () => {
    const rows = buildCaptureCabinetRows([bubble({ text: "", shot: "frame.jpg" })]);
    expect(rows[0].screenshotOnly).toBe(true);
  });

  it("does not flag a captioned capture with a shot as screenshot-only", () => {
    const rows = buildCaptureCabinetRows([bubble({ text: "captioned", shot: "frame.jpg" })]);
    expect(rows[0].screenshotOnly).toBe(false);
  });

  it("does not flag a text-only note (no shot) as screenshot-only", () => {
    const rows = buildCaptureCabinetRows([bubble({ text: "", shot: null })]);
    expect(rows[0].screenshotOnly).toBe(false);
  });
});
