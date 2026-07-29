import { describe, expect, it } from "vitest";
import { lapseTier } from "./lapseTier";

describe("lapseTier", () => {
  it("is 'none' for 0 or 1 Agains this session", () => {
    expect(lapseTier(0)).toBe("none");
    expect(lapseTier(1)).toBe("none");
  });

  it("is 'clip' at exactly 2 Agains", () => {
    expect(lapseTier(2)).toBe("clip");
  });

  it("is 'player' at exactly 3 Agains", () => {
    expect(lapseTier(3)).toBe("player");
  });

  it("stays 'player' for any count above 3", () => {
    expect(lapseTier(4)).toBe("player");
    expect(lapseTier(10)).toBe("player");
  });
});
