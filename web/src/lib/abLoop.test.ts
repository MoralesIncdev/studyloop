import { describe, expect, it } from "vitest";
import { nextAbLoopAction } from "./abLoop";

describe("nextAbLoopAction", () => {
  it("sets A when neither point exists", () => {
    expect(nextAbLoopAction(null, null)).toBe("setA");
  });

  it("sets B once A exists", () => {
    expect(nextAbLoopAction(10, null)).toBe("setB");
  });

  it("clears once both points exist", () => {
    expect(nextAbLoopAction(10, 20)).toBe("clear");
  });
});
