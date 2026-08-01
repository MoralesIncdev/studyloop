// Console slice 8 scaffold (design/mockups/video-console/BUILD-BRIEF.md): tests
// for the fractional pane-layout persistence helpers.
import { afterEach, describe, expect, it, vi } from "vitest";
import { clampFraction, clearPaneLayout, loadPaneLayout, savePaneLayout, snapFraction } from "./consoleLayout";

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

describe("clearPaneLayout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forgets a stored position so load returns null", () => {
    vi.stubGlobal("window", fakeWindow());
    savePaneLayout("p1", "pane", { fx: 0.3, fy: 0.4 });
    expect(loadPaneLayout("p1", "pane")).not.toBeNull();
    clearPaneLayout("p1", "pane");
    expect(loadPaneLayout("p1", "pane")).toBeNull();
  });

  it("leaves other panes' positions alone", () => {
    vi.stubGlobal("window", fakeWindow());
    savePaneLayout("p1", "a", { fx: 0.3, fy: 0.4 });
    savePaneLayout("p1", "b", { fx: 0.6, fy: 0.7 });
    clearPaneLayout("p1", "a");
    expect(loadPaneLayout("p1", "b")).toEqual({ fx: 0.6, fy: 0.7 });
  });
});

describe("snapFraction", () => {
  it("quantizes to the default step", () => {
    expect(snapFraction(0.316)).toBeCloseTo(0.32);
    expect(snapFraction(0.309)).toBeCloseTo(0.3);
  });

  it("clamps while snapping", () => {
    expect(snapFraction(1.4)).toBe(1);
    expect(snapFraction(-0.3)).toBe(0);
  });

  it("honors a custom step", () => {
    expect(snapFraction(0.26, 0.25)).toBe(0.25);
  });
});
