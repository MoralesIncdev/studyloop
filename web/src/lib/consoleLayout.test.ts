// Console slice 8 scaffold (design/mockups/video-console/BUILD-BRIEF.md): tests
// for the fractional pane-layout persistence helpers.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clampFraction,
  clampPaneHeight,
  clampPaneWidth,
  clearPaneLayout,
  loadPaneLayout,
  savePaneHeight,
  savePaneHidden,
  savePaneLayout,
  savePaneMode,
  savePaneWidth,
  snapFraction,
} from "./consoleLayout";

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

describe("clampPaneWidth", () => {
  it("passes through values already in range", () => {
    expect(clampPaneWidth(300)).toBe(300);
  });

  it("clamps to [210, 640]", () => {
    expect(clampPaneWidth(100)).toBe(210);
    expect(clampPaneWidth(999)).toBe(640);
  });

  it("falls back to the minimum for non-finite input", () => {
    expect(clampPaneWidth(NaN)).toBe(210);
  });
});

describe("clampPaneHeight / savePaneHeight (vertical grip)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("clamps to [96, 720] and falls back to the minimum for NaN", () => {
    expect(clampPaneHeight(300)).toBe(300);
    expect(clampPaneHeight(10)).toBe(96);
    expect(clampPaneHeight(9999)).toBe(720);
    expect(clampPaneHeight(NaN)).toBe(96);
  });

  it("persists height without disturbing position/width/mode/hidden", () => {
    vi.stubGlobal("window", fakeWindow());
    savePaneLayout("p1", "p-note", { fx: 0.2, fy: 0.3 });
    savePaneWidth("p1", "p-note", { fx: 0.2, fy: 0.3 }, 400);
    savePaneMode("p1", "p-note", { fx: 0.2, fy: 0.3 }, "glassy");
    savePaneHidden("p1", "p-note", { fx: 0.2, fy: 0.3 }, true);
    savePaneHeight("p1", "p-note", { fx: 0.2, fy: 0.3 }, 240);
    expect(loadPaneLayout("p1", "p-note")).toEqual({ fx: 0.2, fy: 0.3, width: 400, height: 240, mode: "glassy", hidden: true });
  });

  it("width writes preserve an existing height", () => {
    vi.stubGlobal("window", fakeWindow());
    savePaneHeight("p1", "p-note", { fx: 0.2, fy: 0.3 }, 240);
    savePaneWidth("p1", "p-note", { fx: 0.2, fy: 0.3 }, 400);
    expect(loadPaneLayout("p1", "p-note")).toEqual({ fx: 0.2, fy: 0.3, width: 400, height: 240 });
  });
});

describe("savePaneWidth / savePaneMode (slice D schema extension)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists a width without disturbing an existing position", () => {
    vi.stubGlobal("window", fakeWindow());
    savePaneLayout("p1", "p-note", { fx: 0.2, fy: 0.3 });
    savePaneWidth("p1", "p-note", { fx: 0.2, fy: 0.3 }, 400);
    expect(loadPaneLayout("p1", "p-note")).toEqual({ fx: 0.2, fy: 0.3, width: 400 });
  });

  it("persists a mode without disturbing an existing width", () => {
    vi.stubGlobal("window", fakeWindow());
    savePaneLayout("p1", "p-note", { fx: 0.2, fy: 0.3 });
    savePaneWidth("p1", "p-note", { fx: 0.2, fy: 0.3 }, 400);
    savePaneMode("p1", "p-note", { fx: 0.2, fy: 0.3 }, "glassy");
    expect(loadPaneLayout("p1", "p-note")).toEqual({ fx: 0.2, fy: 0.3, width: 400, mode: "glassy" });
  });

  it("uses the caller-supplied currentPos when nothing was ever stored (no silent jump to 0,0)", () => {
    vi.stubGlobal("window", fakeWindow());
    savePaneWidth("p1", "p-note", { fx: 0.62, fy: 0.12 }, 300);
    expect(loadPaneLayout("p1", "p-note")).toEqual({ fx: 0.62, fy: 0.12, width: 300 });
  });

  it("clamps width on save", () => {
    vi.stubGlobal("window", fakeWindow());
    savePaneWidth("p1", "p-note", { fx: 0, fy: 0 }, 9999);
    expect(loadPaneLayout("p1", "p-note")?.width).toBe(640);
  });

  it("ignores an unrecognized mode value already in storage (backward-compat read)", () => {
    vi.stubGlobal(
      "window",
      fakeWindow({ "studyloop:console-layout:p1:p-note": JSON.stringify({ fx: 0.1, fy: 0.2, mode: "neon" }) })
    );
    expect(loadPaneLayout("p1", "p-note")).toEqual({ fx: 0.1, fy: 0.2 });
  });

  it("reads a slice-8-era entry (fx/fy only) with width/mode simply absent", () => {
    vi.stubGlobal("window", fakeWindow({ "studyloop:console-layout:p1:p-note": JSON.stringify({ fx: 0.4, fy: 0.5 }) }));
    expect(loadPaneLayout("p1", "p-note")).toEqual({ fx: 0.4, fy: 0.5 });
  });
});

describe("savePaneHidden (mock's hidePane)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists hidden without disturbing position/width/mode", () => {
    vi.stubGlobal("window", fakeWindow());
    savePaneLayout("p1", "p-note", { fx: 0.2, fy: 0.3 });
    savePaneWidth("p1", "p-note", { fx: 0.2, fy: 0.3 }, 400);
    savePaneMode("p1", "p-note", { fx: 0.2, fy: 0.3 }, "glassy");
    savePaneHidden("p1", "p-note", { fx: 0.2, fy: 0.3 }, true);
    expect(loadPaneLayout("p1", "p-note")).toEqual({ fx: 0.2, fy: 0.3, width: 400, mode: "glassy", hidden: true });
  });

  it("unhiding drops the key rather than storing hidden:false", () => {
    vi.stubGlobal("window", fakeWindow());
    savePaneHidden("p1", "p-note", { fx: 0.2, fy: 0.3 }, true);
    savePaneHidden("p1", "p-note", { fx: 0.2, fy: 0.3 }, false);
    expect(loadPaneLayout("p1", "p-note")).toEqual({ fx: 0.2, fy: 0.3 });
  });

  it("width and mode writes preserve an existing hidden flag", () => {
    vi.stubGlobal("window", fakeWindow());
    savePaneHidden("p1", "p-note", { fx: 0.2, fy: 0.3 }, true);
    savePaneWidth("p1", "p-note", { fx: 0.2, fy: 0.3 }, 400);
    savePaneMode("p1", "p-note", { fx: 0.2, fy: 0.3 }, "glassy");
    expect(loadPaneLayout("p1", "p-note")).toEqual({ fx: 0.2, fy: 0.3, width: 400, mode: "glassy", hidden: true });
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
