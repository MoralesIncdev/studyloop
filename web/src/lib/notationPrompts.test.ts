import { describe, expect, it } from "vitest";
import { pickPrompt, promptPoolFor } from "./notationPrompts";

describe("promptPoolFor / pickPrompt (V3-A A2 ghost prompts)", () => {
  it("returns a non-empty generic pool for no/unrecognized domain", () => {
    expect(promptPoolFor(null).length).toBeGreaterThan(0);
    expect(promptPoolFor("bjj").length).toBeGreaterThan(0);
    expect(promptPoolFor(undefined).length).toBeGreaterThan(0);
  });

  it("pickPrompt always returns a member of the pool", () => {
    const pool = promptPoolFor(null);
    for (let i = 0; i < 50; i++) {
      expect(pool).toContain(pickPrompt(pool));
    }
  });

  it("pickPrompt on an empty pool returns an empty string rather than throwing", () => {
    expect(pickPrompt([])).toBe("");
  });

  // --- V3-D D1 "domain slot types": promptPoolFor(domain) branches per lens ---

  it("returns a distinct, non-empty pool for each of the four domain lenses", () => {
    const generic = promptPoolFor(null);
    for (const domain of ["biology", "history", "music", "physical_skill"]) {
      const pool = promptPoolFor(domain);
      expect(pool.length).toBeGreaterThan(0);
      expect(pool).not.toEqual(generic);
    }
  });

  it("routes 'generic' to the same shared generic pool as null/undefined", () => {
    expect(promptPoolFor("generic")).toEqual(promptPoolFor(null));
  });

  it("history pool reads as a source-question style (SPEC: 'who claims this and why?')", () => {
    expect(promptPoolFor("history").some((p) => /claims/i.test(p))).toBe(true);
  });

  it("physical_skill pool reads as an execute-step style (SPEC: 'you're in X, opponent does Y — next?')", () => {
    expect(promptPoolFor("physical_skill").some((p) => /next/i.test(p))).toBe(true);
  });

  it("music pool reads as a notation-map style", () => {
    expect(promptPoolFor("music").some((p) => /notation/i.test(p))).toBe(true);
  });

  it("biology pool reads as a mechanism-why style", () => {
    expect(promptPoolFor("biology").some((p) => /mechanism/i.test(p))).toBe(true);
  });

  it("is deterministic — same domain always returns the same pool instance's contents", () => {
    expect(promptPoolFor("history")).toEqual(promptPoolFor("history"));
  });
});
