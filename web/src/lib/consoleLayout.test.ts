// Console slice 8 scaffold (design/mockups/video-console/BUILD-BRIEF.md): tests
// for the fractional pane-layout persistence helpers.
import { afterEach, describe, expect, it, vi } from "vitest";
import { clampFraction, loadPaneLayout, savePaneLayout } from "./consoleLayout";

function fakeWindow(initialStorage: Record<string, string> = {}): { localStorage: Storage } {
  const backing = new Map(Object.entries(initialStorage));
  return {
    localStorage: {
      getItem: (k: string) => (backing.has(k) ? backing.get(k)! : null),
      setItem: (k: string, v: string) => {
        backing.set(k, v);
      },
      removeItem: (k: string) => backing.delete(k),
      clear: () => backing.clear(),
      key: () => null,
      get length() {
        return backing.size;
      },
    } as Storage,
  };
}

describe("clampFraction", () => {
  it("passes through values already in [0, 1]", () => {
    expect(clampFraction(0.5)).toBe(0.5);
    expect(clampFraction(0)).toBe(0);
    expect(clampFraction(1)).toBe(1);
  });

  it("clamps values outside [0, 1]", () => {
    expect(clampFraction(-0.2)).toBe(0);
    expect(clampFraction(1.4)).toBe(1);
  });

  it("falls back to 0 for non-finite input", () => {
    expect(clampFraction(NaN)).toBe(0);
    expect(clampFraction(Infinity)).toBe(0);
  });
});

describe("loadPaneLayout / savePaneLayout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null when window is unavailable (non-browser environment)", () => {
    expect(loadPaneLayout("proj1", "p-concept")).toBeNull();
  });

  it("returns null when no layout has been saved for that project+pane", () => {
    vi.stubGlobal("window", fakeWindow({}));
    expect(loadPaneLayout("proj1", "p-concept")).toBeNull();
  });

  it("round-trips a saved position", () => {
    vi.stubGlobal("window", fakeWindow({}));
    savePaneLayout("proj1", "p-concept", { fx: 0.62, fy: 0.12 });
    expect(loadPaneLayout("proj1", "p-concept")).toEqual({ fx: 0.62, fy: 0.12 });
  });

  it("keys layouts independently per project and per pane", () => {
    vi.stubGlobal("window", fakeWindow({}));
    savePaneLayout("proj1", "p-concept", { fx: 0.1, fy: 0.2 });
    savePaneLayout("proj2", "p-concept", { fx: 0.3, fy: 0.4 });
    savePaneLayout("proj1", "p-note", { fx: 0.5, fy: 0.6 });
    expect(loadPaneLayout("proj1", "p-concept")).toEqual({ fx: 0.1, fy: 0.2 });
    expect(loadPaneLayout("proj2", "p-concept")).toEqual({ fx: 0.3, fy: 0.4 });
    expect(loadPaneLayout("proj1", "p-note")).toEqual({ fx: 0.5, fy: 0.6 });
  });

  it("clamps out-of-range values on save", () => {
    vi.stubGlobal("window", fakeWindow({}));
    savePaneLayout("proj1", "p-concept", { fx: 1.5, fy: -0.3 });
    expect(loadPaneLayout("proj1", "p-concept")).toEqual({ fx: 1, fy: 0 });
  });

  it("returns null for corrupt JSON", () => {
    vi.stubGlobal(
      "window",
      fakeWindow({ "studyloop:console-layout:proj1:p-concept": "{not json" })
    );
    expect(loadPaneLayout("proj1", "p-concept")).toBeNull();
  });

  it("returns null for JSON that doesn't match the expected shape", () => {
    vi.stubGlobal(
      "window",
      fakeWindow({ "studyloop:console-layout:proj1:p-concept": JSON.stringify({ foo: "bar" }) })
    );
    expect(loadPaneLayout("proj1", "p-concept")).toBeNull();
  });
});
