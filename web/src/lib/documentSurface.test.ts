// Phase 8 "Document mode" — default-surface selection + per-project
// persistence. Same fakeWindow/vi.stubGlobal pattern as
// lib/consoleLayout.test.ts (vitest's environment here is plain "node" — no
// real `window` global exists unless stubbed).
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultSurfaceForDomain, loadSurfacePreference, saveSurfacePreference } from "./documentSurface";

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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("defaultSurfaceForDomain", () => {
  it("defaults clinical projects to the document surface", () => {
    expect(defaultSurfaceForDomain("clinical")).toBe("document");
  });

  it("defaults every other known domain to console", () => {
    expect(defaultSurfaceForDomain("biology")).toBe("console");
    expect(defaultSurfaceForDomain("history")).toBe("console");
    expect(defaultSurfaceForDomain("music")).toBe("console");
    expect(defaultSurfaceForDomain("physical_skill")).toBe("console");
    expect(defaultSurfaceForDomain("generic")).toBe("console");
  });

  it("defaults an unset/undefined domain to console", () => {
    expect(defaultSurfaceForDomain(undefined)).toBe("console");
  });

  it("defaults an unrecognized domain (e.g. a Phase 9 auto-generated lens id) to console", () => {
    expect(defaultSurfaceForDomain("underwater_basket_weaving")).toBe("console");
  });
});

describe("surface preference persistence", () => {
  it("returns null when nothing has been stored for this project", () => {
    vi.stubGlobal("window", fakeWindow());
    expect(loadSurfacePreference("proj-1")).toBeNull();
  });

  it("round-trips an explicit save through load", () => {
    vi.stubGlobal("window", fakeWindow());
    saveSurfacePreference("proj-1", "document");
    expect(loadSurfacePreference("proj-1")).toBe("document");
    saveSurfacePreference("proj-1", "console");
    expect(loadSurfacePreference("proj-1")).toBe("console");
  });

  it("keeps each project's preference independent", () => {
    vi.stubGlobal("window", fakeWindow());
    saveSurfacePreference("proj-1", "document");
    saveSurfacePreference("proj-2", "console");
    expect(loadSurfacePreference("proj-1")).toBe("document");
    expect(loadSurfacePreference("proj-2")).toBe("console");
  });

  it("ignores a corrupt/unrecognized stored value", () => {
    vi.stubGlobal("window", fakeWindow({ "studyloop:study-surface:proj-1": "not-a-surface" }));
    expect(loadSurfacePreference("proj-1")).toBeNull();
  });

  it("returns null (never throws) when window is undefined (SSR/build-time safety)", () => {
    expect(loadSurfacePreference("proj-1")).toBeNull();
    expect(() => saveSurfacePreference("proj-1", "document")).not.toThrow();
  });
});
