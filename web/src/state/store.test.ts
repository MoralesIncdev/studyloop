import { describe, expect, it, beforeEach, vi } from "vitest";
import { clampRate, useStudyLoopStore } from "./store";
import type { Project } from "../lib/types";

describe("clampRate", () => {
  it("clamps to the 0.5–2.5 range", () => {
    expect(clampRate(0.1)).toBe(0.5);
    expect(clampRate(3)).toBe(2.5);
    expect(clampRate(1.25)).toBe(1.25);
  });
});

function jsonResponseFor(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

describe("loadLibrary / rescanLibrary no-op while already loading", () => {
  beforeEach(() => {
    useStudyLoopStore.setState({ libraryLoading: false, libraryLoaded: false, libraryItems: [], toasts: [] });
  });

  it("does not fire a second GET /api/library while the first is still in flight", async () => {
    let resolveFirst!: (v: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const fetchMock = vi.fn(() => pending);
    vi.stubGlobal("fetch", fetchMock);

    // Two stacked calls before the first resolves — mirrors React
    // StrictMode's double-mount firing loadLibrary() twice in a row.
    const first = useStudyLoopStore.getState().loadLibrary();
    const second = useStudyLoopStore.getState().loadLibrary();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFirst(jsonResponseFor({ items: [], warnings: [] }));
    await Promise.all([first, second]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useStudyLoopStore.getState().libraryLoaded).toBe(true);

    vi.unstubAllGlobals();
  });

  it("a second call after the first has fully resolved is not blocked (the guard is concurrency-only, not a cache)", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponseFor({ items: [], warnings: [] })));
    vi.stubGlobal("fetch", fetchMock);

    await useStudyLoopStore.getState().loadLibrary();
    await useStudyLoopStore.getState().loadLibrary();

    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.unstubAllGlobals();
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

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

function makeProject(id: string, title: string): Project {
  return {
    id,
    title,
    source: { type: "local", path: `/videos/${id}.mp4` },
    transcript: { type: "none" },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    lastPosition: 0,
    watchedUpTo: 0,
  };
}

describe("loadProjectSession stale-response guard", () => {
  beforeEach(() => {
    useStudyLoopStore.setState({
      currentProject: null,
      currentProjectLoading: false,
      sessionRequestId: 0,
      bubbles: [],
      bubblesLoading: false,
      notes: "",
      notesLoaded: false,
      transcriptSegments: [],
      toasts: [],
    });
  });

  it("discards a project fetch that resolves after a newer loadProjectSession call has superseded it", async () => {
    const projectA = makeProject("a", "Project A");
    const projectB = makeProject("b", "Project B");

    let resolveA!: (v: Response) => void;
    const pendingA = new Promise<Response>((resolve) => {
      resolveA = resolve;
    });

    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/projects/a")) return pendingA; // never resolves until we say so
      if (url.includes("/api/projects/b")) return Promise.resolve(jsonResponse(projectB));
      if (url.endsWith("/bubbles")) return Promise.resolve(jsonResponse({ bubbles: [] }));
      if (url.endsWith("/notes")) {
        return Promise.resolve(new Response("", { status: 200, headers: { "content-type": "text/markdown" } }));
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal("fetch", fetchMock);

    // Start loading "a" (its getProject call hangs on `pendingA`), then — before
    // it resolves — navigate to "b", the way a user clicking two library items
    // in quick succession would. This used to be the "Loading project… forever"
    // bug: a's slow response would land after b's fast one and either flip
    // currentProjectLoading back on or overwrite currentProject with the wrong id.
    const loadA = useStudyLoopStore.getState().loadProjectSession("a");
    const loadB = useStudyLoopStore.getState().loadProjectSession("b");
    await loadB;

    expect(useStudyLoopStore.getState().currentProject?.id).toBe("b");
    expect(useStudyLoopStore.getState().currentProjectLoading).toBe(false);

    // Now let a's stale response finally arrive.
    resolveA(jsonResponse(projectA));
    await loadA;

    // It must not have clobbered the already-current "b" session.
    expect(useStudyLoopStore.getState().currentProject?.id).toBe("b");
    expect(useStudyLoopStore.getState().currentProjectLoading).toBe(false);

    vi.unstubAllGlobals();
  });
});

function makeYoutubeProject(id: string, videoId: string): Project {
  return {
    id,
    title: `Video ${videoId}`,
    source: { type: "youtube", videoId, url: `https://www.youtube.com/watch?v=${videoId}` },
    transcript: { type: "none" },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    lastPosition: 0,
    watchedUpTo: 0,
  };
}

function baseConfig(overrides: Partial<{ anthropicApiKeySet: boolean; analysisModel: string | null; shareHandle: string }> = {}) {
  return {
    dataDir: "~/StudyLoopData",
    libraryRoots: [],
    transcriptRoots: [],
    conceptDocs: [],
    anthropicApiKeySet: false,
    analysisModel: null,
    shareHandle: "anonymous",
    ...overrides,
  };
}

describe("startAnalyze (V2-C)", () => {
  beforeEach(() => {
    useStudyLoopStore.setState({
      currentProject: makeProject("p1", "Project 1"),
      config: null,
      analyzeStatus: { state: "idle" },
      analysis: null,
      toasts: [],
      route: { view: "library" },
    });
  });

  it("no API key configured → toasts an info message and navigates to Settings, without ever POSTing /analyze", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/config")) return Promise.resolve(jsonResponse(baseConfig({ anthropicApiKeySet: false })));
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await useStudyLoopStore.getState().startAnalyze();

    expect(useStudyLoopStore.getState().route).toEqual({ view: "settings" });
    expect(useStudyLoopStore.getState().toasts.some((t) => /API key/.test(t.message))).toBe(true);
    expect(fetchMock.mock.calls.every(([input]) => !String(input).includes("/analyze"))).toBe(true);

    vi.unstubAllGlobals();
  });

  it("API key configured → POSTs /analyze and applies the returned running status", async () => {
    // Fake timers: applying a "running" status starts the poll loop's
    // setInterval, which must not survive past this test as a real timer.
    vi.useFakeTimers();
    useStudyLoopStore.setState({ config: baseConfig({ anthropicApiKeySet: true }) });
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/analyze/status")) return Promise.resolve(jsonResponse({ state: "running", pct: 0 }));
      if (url.includes("/analyze")) return Promise.resolve(jsonResponse({ state: "running", pct: 0 }));
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await useStudyLoopStore.getState().startAnalyze();

    expect(useStudyLoopStore.getState().analyzeStatus).toEqual({ state: "running", pct: 0 });
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("/analyze") && !String(input).includes("status"))).toBe(true);

    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("idempotent path: POST /analyze returns the full Analysis directly (analysis.json already existed) → applies it immediately, marks done", async () => {
    useStudyLoopStore.setState({ config: baseConfig({ anthropicApiKeySet: true }) });
    const analysis = {
      generatedAt: "2026-07-28T00:00:00Z",
      model: "claude-opus-5",
      version: 2 as const,
      source: "model" as const,
      pearls: [{ t: 10, label: "L", insight: "I", importance: 3 as const }],
      concepts: [],
      themes: [],
    };
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/analyze")) return Promise.resolve(jsonResponse(analysis));
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await useStudyLoopStore.getState().startAnalyze();

    expect(useStudyLoopStore.getState().analysis).toEqual(analysis);
    expect(useStudyLoopStore.getState().analyzeStatus).toEqual({ state: "done" });

    vi.unstubAllGlobals();
  });

  it("a 409 (already running elsewhere) is treated as running, not an error toast", async () => {
    // Fake timers so the poll loop's setInterval this triggers (pollAnalyzeStatus)
    // never actually fires a real, unstubbed fetch after this test tears down.
    vi.useFakeTimers();
    useStudyLoopStore.setState({ config: baseConfig({ anthropicApiKeySet: true }) });
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/analyze/status")) return Promise.resolve(jsonResponse({ state: "running", pct: 5 }));
      if (url.includes("/analyze")) {
        return Promise.resolve(new Response(JSON.stringify({ error: "already running", code: "already_running" }), { status: 409 }));
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await useStudyLoopStore.getState().startAnalyze();

    expect(useStudyLoopStore.getState().analyzeStatus.state).toBe("running");
    expect(useStudyLoopStore.getState().toasts.some((t) => t.kind === "error")).toBe(false);

    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
});

describe("playbackFocus debounce + focusOverride (V3-A A1 state-aware surface purge)", () => {
  beforeEach(() => {
    useStudyLoopStore.setState({ isPlaying: false, playbackFocus: false, focusOverride: false });
  });

  it("does not flip playbackFocus immediately on play — only after the full 1.5s debounce", () => {
    vi.useFakeTimers();
    useStudyLoopStore.getState().setIsPlaying(true);
    expect(useStudyLoopStore.getState().playbackFocus).toBe(false);
    vi.advanceTimersByTime(1499);
    expect(useStudyLoopStore.getState().playbackFocus).toBe(false);
    vi.advanceTimersByTime(1);
    expect(useStudyLoopStore.getState().playbackFocus).toBe(true);
    vi.useRealTimers();
  });

  it("pausing mid-debounce cancels it — playbackFocus never flips even once the original 1.5s mark passes", () => {
    vi.useFakeTimers();
    const store = useStudyLoopStore.getState();
    store.setIsPlaying(true);
    vi.advanceTimersByTime(1000);
    store.setIsPlaying(false); // pause partway through the debounce
    expect(useStudyLoopStore.getState().playbackFocus).toBe(false);
    vi.advanceTimersByTime(1000); // well past the original 1.5s mark
    expect(useStudyLoopStore.getState().playbackFocus).toBe(false);
    vi.useRealTimers();
  });

  it("resuming after a pause restarts a fresh 1.5s debounce (scrubbing/quick pause-resume doesn't flicker the purge on)", () => {
    vi.useFakeTimers();
    const store = useStudyLoopStore.getState();
    store.setIsPlaying(true);
    vi.advanceTimersByTime(1000);
    store.setIsPlaying(false);
    store.setIsPlaying(true); // fresh pause→play transition — fresh debounce
    vi.advanceTimersByTime(1000);
    expect(useStudyLoopStore.getState().playbackFocus).toBe(false); // only 1s of the *new* debounce elapsed
    vi.advanceTimersByTime(500);
    expect(useStudyLoopStore.getState().playbackFocus).toBe(true);
    vi.useRealTimers();
  });

  it("pause immediately clears playbackFocus once it has already flipped true", () => {
    vi.useFakeTimers();
    const store = useStudyLoopStore.getState();
    store.setIsPlaying(true);
    vi.advanceTimersByTime(2000);
    expect(useStudyLoopStore.getState().playbackFocus).toBe(true);
    store.setIsPlaying(false);
    expect(useStudyLoopStore.getState().playbackFocus).toBe(false);
    vi.useRealTimers();
  });

  it("a redundant setIsPlaying(true) while already playing does not restart the debounce", () => {
    vi.useFakeTimers();
    const store = useStudyLoopStore.getState();
    store.setIsPlaying(true);
    vi.advanceTimersByTime(1000);
    store.setIsPlaying(true); // redundant — already playing, must not reset the timer
    vi.advanceTimersByTime(500); // total 1500ms since the *first* setIsPlaying(true)
    expect(useStudyLoopStore.getState().playbackFocus).toBe(true);
    vi.useRealTimers();
  });

  it("setFocusOverride suspends the purge and persists through a pause, clearing only on the next pause→play transition ('the user always wins')", () => {
    vi.useFakeTimers();
    const store = useStudyLoopStore.getState();
    store.setIsPlaying(true);
    vi.advanceTimersByTime(1500);
    expect(useStudyLoopStore.getState().playbackFocus).toBe(true);

    store.setFocusOverride();
    expect(useStudyLoopStore.getState().focusOverride).toBe(true);

    store.setIsPlaying(false); // pause alone must not clear the override
    expect(useStudyLoopStore.getState().focusOverride).toBe(true);

    store.setIsPlaying(true); // this pause→play transition clears it
    expect(useStudyLoopStore.getState().focusOverride).toBe(false);
    vi.useRealTimers();
  });
});

describe("patchCurrentProject — V3-A lessonSummary round trip", () => {
  beforeEach(() => {
    const project = makeProject("p1", "Project 1");
    useStudyLoopStore.setState({ currentProject: project, projects: [project], toasts: [] });
  });

  it("PATCHes { lessonSummary } and applies the server's response to currentProject/projects", async () => {
    const updated = { ...makeProject("p1", "Project 1"), lessonSummary: "This lesson covered grip fighting." };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(url).toContain("/api/projects/p1");
      expect(init?.method).toBe("PATCH");
      expect(JSON.parse(String(init?.body))).toEqual({ lessonSummary: "This lesson covered grip fighting." });
      return Promise.resolve(jsonResponse(updated));
    });
    vi.stubGlobal("fetch", fetchMock);

    await useStudyLoopStore.getState().patchCurrentProject({ lessonSummary: "This lesson covered grip fighting." });

    expect(useStudyLoopStore.getState().currentProject?.lessonSummary).toBe("This lesson covered grip fighting.");
    expect(useStudyLoopStore.getState().projects.find((p) => p.id === "p1")?.lessonSummary).toBe(
      "This lesson covered grip fighting."
    );
    vi.unstubAllGlobals();
  });
});

describe("openOrCreateYoutubeProject (V2-B — search/up-next click target)", () => {
  beforeEach(() => {
    useStudyLoopStore.setState({ projects: [], projectsLoaded: true, toasts: [] });
  });

  it("returns an already-open project for the same videoId without hitting the network", async () => {
    const existing = makeYoutubeProject("proj-1", "abc123");
    useStudyLoopStore.setState({ projects: [existing], projectsLoaded: true });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await useStudyLoopStore.getState().openOrCreateYoutubeProject("abc123");

    expect(result).toBe(existing);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("creates a new project (via resolve + create) for a videoId with no existing project", async () => {
    const created = makeYoutubeProject("proj-new", "xyz789");
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/youtube/resolve")) {
        return Promise.resolve(jsonResponse({ videoId: "xyz789", title: "Video xyz789", captions: [] }));
      }
      if (url.includes("/api/projects")) {
        return Promise.resolve(jsonResponse(created));
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await useStudyLoopStore.getState().openOrCreateYoutubeProject("xyz789");

    expect(result.id).toBe("proj-new");
    expect(useStudyLoopStore.getState().projects.some((p) => p.id === "proj-new")).toBe(true);
    vi.unstubAllGlobals();
  });
});
