import { describe, expect, it } from "vitest";
import { testPrompt } from "./testPrompt";

describe("testPrompt", () => {
  it("poses a question, not just the label, for every unit type", () => {
    const types = [
      "CLAIM",
      "MECHANISM",
      "PROCEDURE",
      "EXAMPLE",
      "BOUNDARY",
      "DOSAGE",
      "CONTRAINDICATION",
      "LAB_VALUE",
      "PRIORITIZATION",
      "CLUSTER",
    ] as const;
    for (const type of types) {
      const prompt = testPrompt({ type, label: "upper body bridging" });
      expect(prompt).toContain("upper body bridging");
      expect(prompt.length).toBeGreaterThan("upper body bridging".length);
    }
  });

  it("includes the member count for multi-member clusters", () => {
    const prompt = testPrompt({
      type: "CLUSTER",
      label: "side effects of metoprolol",
      members: [
        { label: "a", body: "x" },
        { label: "b", body: "y" },
        { label: "c", body: "z" },
      ],
    });
    expect(prompt).toContain("all 3");
  });

  it("does not demand a count for empty or single-member clusters", () => {
    expect(testPrompt({ type: "CLUSTER", label: "grips" })).not.toMatch(/all \d/);
    expect(
      testPrompt({ type: "CLUSTER", label: "grips", members: [{ label: "a", body: "x" }] })
    ).not.toMatch(/all \d/);
  });

  it("flags exact-value framing for safety-tier types", () => {
    expect(testPrompt({ type: "DOSAGE", label: "metoprolol IV push" })).toMatch(/[Ee]xact/);
    expect(testPrompt({ type: "LAB_VALUE", label: "serum potassium" })).toMatch(/[Ee]xact/);
  });
});
