import { describe, expect, it, beforeEach } from "vitest";
import { clampRate, useStudyLoopStore } from "./store";

describe("clampRate", () => {
  it("clamps to the 0.5–2.5 range", () => {
    expect(clampRate(0.1)).toBe(0.5);
    expect(clampRate(3)).toBe(2.5);
    expect(clampRate(1.25)).toBe(1.25);
  });
});

describe("A/B loop store logic", () => {
  beforeEach(() => {
    useStudyLoopStore.setState({ loopA: null, loopB: null, toasts: [] });
  });

  it("sets loop A and loop B independently", () => {
    useStudyLoopStore.getState().setLoopA(10);
    useStudyLoopStore.getState().setLoopB(20);
    expect(useStudyLoopStore.getState().loopA).toBe(10);
    expect(useStudyLoopStore.getState().loopB).toBe(20);
  });

  it("rejects a B point at or before A and toasts an error", () => {
    useStudyLoopStore.getState().setLoopA(10);
    useStudyLoopStore.getState().setLoopB(5);
    expect(useStudyLoopStore.getState().loopB).toBeNull();
    expect(useStudyLoopStore.getState().toasts.some((t) => /after A/.test(t.message))).toBe(true);
  });

  it("clears loop B when a new A is set past the existing B", () => {
    useStudyLoopStore.getState().setLoopA(10);
    useStudyLoopStore.getState().setLoopB(20);
    useStudyLoopStore.getState().setLoopA(25);
    expect(useStudyLoopStore.getState().loopB).toBeNull();
  });

  it("clearLoop resets both points", () => {
    useStudyLoopStore.getState().setLoopA(10);
    useStudyLoopStore.getState().setLoopB(20);
    useStudyLoopStore.getState().clearLoop();
    expect(useStudyLoopStore.getState().loopA).toBeNull();
    expect(useStudyLoopStore.getState().loopB).toBeNull();
  });
});
