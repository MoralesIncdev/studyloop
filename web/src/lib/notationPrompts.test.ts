import { describe, expect, it } from "vitest";
import { pickPrompt, promptPoolFor } from "./notationPrompts";

describe("promptPoolFor / pickPrompt (V3-A A2 ghost prompts)", () => {
  it("returns a non-empty generic pool regardless of domain (v3-B hook, unimplemented today)", () => {
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
});
