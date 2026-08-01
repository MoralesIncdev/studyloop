import { describe, expect, it, beforeEach, vi } from "vitest";
import { clampRate, useStudyLoopStore } from "./store";
import type { Project } from "../lib/types";
import type { PlayerHandle } from "../player/types";

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

describe("cycleAbLoop (console slice B, mpv grammar A → B → clear)", () => {
  function fakeController(t: number): PlayerHandle {
    return {
      play: vi.fn(),
      pause: vi.fn(),
      seek: vi.fn(),
      getCurrentTime: () => t,
      getDuration: () => 1800,
      setRate: vi.fn(),
      getVolume: () => 1,
      setVolume: vi.fn(),
      on: () => () => {},
    };
  }

  beforeEach(() => {
    useStudyLoopStore.setState({ loopA: null, loopB: null, toasts: [], controller: fakeController(10) });
  });

  it("is a no-op without a controller", () => {
    useStudyLoopStore.setState({ controller: null });
    useStudyLoopStore.getState().cycleAbLoop();
    expect(useStudyLoopStore.getState().loopA).toBeNull();
  });

  it("sets A on the first press, B on the second, clears on the third", () => {
    useStudyLoopStore.getState().cycleAbLoop();
    expect(useStudyLoopStore.getState().loopA).toBe(10);
    expect(useStudyLoopStore.getState().loopB).toBeNull();

    useStudyLoopStore.setState({ controller: fakeController(20) });
    useStudyLoopStore.getState().cycleAbLoop();
    expect(useStudyLoopStore.getState().loopA).toBe(10);
    expect(useStudyLoopStore.getState().loopB).toBe(20);

    useStudyLoopStore.getState().cycleAbLoop();
    expect(useStudyLoopStore.getState().loopA).toBeNull();
    expect(useStudyLoopStore.getState().loopB).toBeNull();
  });
});

describe("focusMode / keymapOpen / autoPaused (console slice B)", () => {
  beforeEach(() => {
    useStudyLoopStore.setState({ focusMode: false, keymapOpen: false, autoPaused: false });
  });

  it("toggleFocusMode flips focusMode", () => {
    useStudyLoopStore.getState().toggleFocusMode();
    expect(useStudyLoopStore.getState().focusMode).toBe(true);
    useStudyLoopStore.getState().toggleFocusMode();
    expect(useStudyLoopStore.getState().focusMode).toBe(false);
  });

  it("toggleKeymap flips keymapOpen; closeKeymap always lands on false", () => {
    useStudyLoopStore.getState().toggleKeymap();
    expect(useStudyLoopStore.getState().keymapOpen).toBe(true);
    useStudyLoopStore.getState().closeKeymap();
    expect(useStudyLoopStore.getState().keymapOpen).toBe(false);
    useStudyLoopStore.getState().closeKeymap();
    expect(useStudyLoopStore.getState().keymapOpen).toBe(false);
  });

  it("setAutoPaused sets the flag directly", () => {
    useStudyLoopStore.getState().setAutoPaused(true);
    expect(useStudyLoopStore.getState().autoPaused).toBe(true);
    useStudyLoopStore.getState().setAutoPaused(false);
    expect(useStudyLoopStore.getState().autoPaused).toBe(false);
  });
});

describe("cabinets / modality / scaffold / pressure (console slice C)", () => {
  beforeEach(() => {
    useStudyLoopStore.setState({ openCabinet: null, modality: "watch", scaffold: 100, pressure: 100, isPlaying: false });
  });

  it("toggleCabinet opens the named cabinet, closing any other that was open", () => {
    useStudyLoopStore.getState().toggleCabinet("concepts");
    expect(useStudyLoopStore.getState().openCabinet).toBe("concepts");
    useStudyLoopStore.getState().toggleCabinet("session");
    expect(useStudyLoopStore.getState().openCabinet).toBe("session");
  });

  it("toggleCabinet closes the same cabinet on a second click", () => {
    useStudyLoopStore.getState().toggleCabinet("captures");
    useStudyLoopStore.getState().toggleCabinet("captures");
    expect(useStudyLoopStore.getState().openCabinet).toBeNull();
  });

  it("closeCabinet always lands on null", () => {
    useStudyLoopStore.getState().toggleCabinet("session");
    useStudyLoopStore.getState().closeCabinet();
    expect(useStudyLoopStore.getState().openCabinet).toBeNull();
    useStudyLoopStore.getState().closeCabinet();
    expect(useStudyLoopStore.getState().openCabinet).toBeNull();
  });

  it("setModality is a no-op re-set when already in that mode", () => {
    useStudyLoopStore.getState().setModality("watch");
    expect(useStudyLoopStore.getState().modality).toBe("watch");
  });

  function fakePlayerHandle(pause = vi.fn()): PlayerHandle {
    return {
      play: vi.fn(),
      pause,
      seek: vi.fn(),
      getCurrentTime: () => 0,
      getDuration: () => 1800,
      setRate: vi.fn(),
      getVolume: () => 1,
      setVolume: vi.fn(),
      on: () => () => {},
    };
  }

  it("setModality('generate') pauses a currently-playing controller", () => {
    const pause = vi.fn();
    useStudyLoopStore.setState({ isPlaying: true, controller: fakePlayerHandle(pause) });
    useStudyLoopStore.getState().setModality("generate");
    expect(useStudyLoopStore.getState().modality).toBe("generate");
    expect(pause).toHaveBeenCalledOnce();
  });

  it("setModality('review') does not touch playback", () => {
    const pause = vi.fn();
    useStudyLoopStore.setState({ isPlaying: true, controller: fakePlayerHandle(pause) });
    useStudyLoopStore.getState().setModality("review");
    expect(pause).not.toHaveBeenCalled();
  });

  it("setScaffold / setPressure clamp to [0, 100]", () => {
    useStudyLoopStore.getState().setScaffold(-10);
    expect(useStudyLoopStore.getState().scaffold).toBe(0);
    useStudyLoopStore.getState().setScaffold(140);
    expect(useStudyLoopStore.getState().scaffold).toBe(100);
    useStudyLoopStore.getState().setPressure(-10);
    expect(useStudyLoopStore.getState().pressure).toBe(0);
    useStudyLoopStore.getState().setPressure(140);
    expect(useStudyLoopStore.getState().pressure).toBe(100);
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
    llmProvider: "anthropic" as const,
    anthropicAuthMode: "api-key" as const,
    anthropicApiKeySet: false,
    openaiApiKeySet: false,
    googleApiKeySet: false,
    xaiApiKeySet: false,
    deepseekApiKeySet: false,
    kimiApiKeySet: false,
    zaiApiKeySet: false,
    analysisModel: null,
    shareHandle: "anonymous",
    continuityWeights: { related: 0.15, conceptSearch: 0.3, teacherValidation: 0.3, gapFill: 0.25 },
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

  // V3-A review finding #1 (CRITICAL): a failed PATCH must not silently
  // discard the learner's synthesis. patchCurrentProject now returns a
  // boolean (false on failure, never throws) so CompileFlow's
  // handleSynthesisSaveAndContinue can keep its modal open — with the
  // draft text untouched — instead of proceeding to close/compile on stale
  // data. This test covers the store half of that contract; the component
  // half (modal stays open, text intact) is exercised by the browser
  // spot-check per the review's DoD.
  it("returns false (never throws) and leaves currentProject untouched when the PATCH fails, toasting the error", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response("server error", { status: 500, statusText: "Internal Server Error" })));
    vi.stubGlobal("fetch", fetchMock);

    const before = useStudyLoopStore.getState().currentProject;
    const ok = await useStudyLoopStore.getState().patchCurrentProject({ lessonSummary: "Would be lost on failure" });

    expect(ok).toBe(false);
    expect(useStudyLoopStore.getState().currentProject).toBe(before); // unchanged — no lessonSummary applied
    expect(useStudyLoopStore.getState().toasts.some((t) => t.kind === "error")).toBe(true);
    vi.unstubAllGlobals();
  });
});

describe("runCompile in-flight guard (V3-A review finding #5)", () => {
  beforeEach(() => {
    const project = makeProject("p1", "Project 1");
    useStudyLoopStore.setState({
      currentProject: project,
      compiling: false,
      compileResult: null,
      notes: "",
      currentTime: 0,
      toasts: [],
    });
  });

  it("a second call while a compile is already in flight no-ops — only one POST /compile fires", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/notes")) return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      if (url.includes("/compile")) return Promise.resolve(jsonResponse({ path: "exports/p1.md", markdown: "# P1" }));
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    // `compiling` flips true synchronously, before either call's first
    // `await` yields — so back-to-back calls with no `await` in between
    // (mirrors a doubled Escape/onExited invocation) guarantee the second
    // call's guard check already sees `compiling: true` from the first,
    // regardless of how fast the mocked network resolves.
    const first = useStudyLoopStore.getState().runCompile();
    const second = useStudyLoopStore.getState().runCompile();
    await Promise.all([first, second]);

    const compileCallCount = fetchMock.mock.calls.filter(([input]) => String(input).includes("/compile")).length;
    expect(compileCallCount).toBe(1);
    expect(useStudyLoopStore.getState().compileResult).toEqual({ path: "exports/p1.md", markdown: "# P1" });
    vi.unstubAllGlobals();
  });
});

describe("loadProjectSession — persisted rail-section restore (V3-A review finding #6)", () => {
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

  function stubFetchFor(project: Project) {
    return vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(`/api/projects/${project.id}`)) return Promise.resolve(jsonResponse(project));
      if (url.endsWith("/bubbles")) return Promise.resolve(jsonResponse({ bubbles: [] }));
      if (url.endsWith("/notes")) {
        return Promise.resolve(new Response("", { status: 200, headers: { "content-type": "text/markdown" } }));
      }
      return Promise.resolve(jsonResponse({}));
    });
  }

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

  it('restores railOpenSection to null when "none" (both collapsed) was persisted — not the "transcript" missing-value default', async () => {
    const project = makeProject("rail-none", "Rail none");
    vi.stubGlobal("window", fakeWindow({ "studyloop:railSection:rail-none": "none" }));
    vi.stubGlobal("fetch", stubFetchFor(project));

    await useStudyLoopStore.getState().loadProjectSession("rail-none");

    expect(useStudyLoopStore.getState().railOpenSection).toBeNull();
    vi.unstubAllGlobals();
  });

  it("still defaults to transcript when nothing was ever persisted for this project", async () => {
    const project = makeProject("rail-missing", "Rail missing");
    vi.stubGlobal("window", fakeWindow({}));
    vi.stubGlobal("fetch", stubFetchFor(project));

    await useStudyLoopStore.getState().loadProjectSession("rail-missing");

    expect(useStudyLoopStore.getState().railOpenSection).toBe("transcript");
    vi.unstubAllGlobals();
  });

  it("restores an explicit transcript/concepts choice as before", async () => {
    const project = makeProject("rail-concepts", "Rail concepts");
    vi.stubGlobal("window", fakeWindow({ "studyloop:railSection:rail-concepts": "concepts" }));
    vi.stubGlobal("fetch", stubFetchFor(project));

    await useStudyLoopStore.getState().loadProjectSession("rail-concepts");

    expect(useStudyLoopStore.getState().railOpenSection).toBe("concepts");
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

// --- V3-B review finding #3: attestation races ------------------------------

describe("attestation mutation ordering + races (V3-B review finding #3)", () => {
  beforeEach(() => {
    const project = makeProject("p1", "Project 1");
    useStudyLoopStore.setState({
      currentProject: project,
      attestations: {},
      attestationMutationSeq: 0,
      toasts: [],
    });
  });

  it("serializes two concurrent attestation mutations against the same unit — the second PATCH is not issued until the first resolves", async () => {
    const callOrder: string[] = [];
    let resolveFirst!: (v: Response) => void;
    const pendingFirst = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/attestations/u1") && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body)) as { status?: string; userTake?: string };
        if (body.status === "attested") {
          callOrder.push("first-issued");
          return pendingFirst;
        }
        callOrder.push("second-issued");
        return Promise.resolve(jsonResponse({ u1: { status: "attested", userTake: "second take", at: "t2" } }));
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = useStudyLoopStore.getState().attestUnit("u1");
    const second = useStudyLoopStore.getState().saveUnitTake("u1", "second take");

    // Give the (unserialized) second call every chance to have fired already —
    // several microtask/macrotask turns — before the first call's fetch resolves.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(callOrder).toEqual(["first-issued"]);

    resolveFirst(jsonResponse({ u1: { status: "attested", at: "t1" } }));
    await Promise.all([first, second]);

    expect(callOrder).toEqual(["first-issued", "second-issued"]);
    vi.unstubAllGlobals();
  });

  it("a PATCH response merges only the patched unit's entry — never clobbers a different unit already in local state", async () => {
    useStudyLoopStore.setState({ attestations: { u2: { status: "dismissed", at: "t0" } } });
    // The server's response for u1's PATCH — note it does NOT echo u2 at all
    // (this codebase's real server always would, but the fix must not
    // depend on that: merging only `res[unitId]` is what makes it safe
    // either way).
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ u1: { status: "attested", at: "t1" } })));
    vi.stubGlobal("fetch", fetchMock);

    await useStudyLoopStore.getState().attestUnit("u1");

    expect(useStudyLoopStore.getState().attestations.u1).toEqual({ status: "attested", at: "t1" });
    expect(useStudyLoopStore.getState().attestations.u2).toEqual({ status: "dismissed", at: "t0" }); // untouched
    vi.unstubAllGlobals();
  });

  it("discards a stale loadAttestations GET that resolves after a local mutation landed while it was in flight", async () => {
    let resolveGet!: (v: Response) => void;
    const pendingGet = new Promise<Response>((resolve) => {
      resolveGet = resolve;
    });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "PATCH") return Promise.resolve(jsonResponse({ u1: { status: "attested", at: "t1" } }));
      return pendingGet;
    });
    vi.stubGlobal("fetch", fetchMock);

    const getPromise = useStudyLoopStore.getState().loadAttestations();
    // The learner attests while the initial GET is still in flight.
    await useStudyLoopStore.getState().attestUnit("u1");
    expect(useStudyLoopStore.getState().attestations.u1?.status).toBe("attested");

    // The stale GET finally resolves with what the server had BEFORE the PATCH.
    resolveGet(jsonResponse({}));
    await getPromise;

    // Must not have regressed — the newer local mutation wins.
    expect(useStudyLoopStore.getState().attestations.u1?.status).toBe("attested");
    vi.unstubAllGlobals();
  });
});

// --- V3-B review finding #4: caption-pass integrity (patchBubble half) -----

describe("patchBubble (V3-B review finding #4)", () => {
  beforeEach(() => {
    const project = makeProject("p1", "Project 1");
    useStudyLoopStore.setState({
      currentProject: project,
      bubbles: [
        { id: "b1", t: 10, text: "one", shot: null, createdAt: "t" },
        { id: "b2", t: 20, text: "two", shot: null, createdAt: "t" },
      ],
      toasts: [],
    });
  });

  it("returns true on success and applies the server's response", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(jsonResponse({ id: "b1", t: 10, text: "updated", shot: null, createdAt: "t" }))
    );
    vi.stubGlobal("fetch", fetchMock);

    const ok = await useStudyLoopStore.getState().patchBubble("b1", { text: "updated" });

    expect(ok).toBe(true);
    expect(useStudyLoopStore.getState().bubbles.find((b) => b.id === "b1")?.text).toBe("updated");
    vi.unstubAllGlobals();
  });

  it("returns false (never throws) on failure, rolling back only the failed bubble — a concurrently-succeeded different bubble survives", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/bubbles/b1")) return Promise.resolve(new Response("fail", { status: 500, statusText: "Internal Server Error" }));
      if (url.includes("/bubbles/b2")) {
        return Promise.resolve(jsonResponse({ id: "b2", t: 20, text: "b2 succeeded", shot: null, createdAt: "t" }));
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const [okB1, okB2] = await Promise.all([
      useStudyLoopStore.getState().patchBubble("b1", { text: "b1 attempt" }),
      useStudyLoopStore.getState().patchBubble("b2", { text: "b2 attempt" }),
    ]);

    expect(okB1).toBe(false);
    expect(okB2).toBe(true);
    // b1 rolled back to its pre-patch text; the whole-array-snapshot bug this
    // fix replaces would have let b1's rollback erase b2's success too.
    expect(useStudyLoopStore.getState().bubbles.find((b) => b.id === "b1")?.text).toBe("one");
    expect(useStudyLoopStore.getState().bubbles.find((b) => b.id === "b2")?.text).toBe("b2 succeeded");
    expect(useStudyLoopStore.getState().toasts.some((t) => t.kind === "error")).toBe(true);
    vi.unstubAllGlobals();
  });
});

// --- V3-B review finding #5: stale-session guards on compile/export --------

function stubProjectSwitchFetch(target: Project) {
  return (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes(`/api/projects/${target.id}`)) return Promise.resolve(jsonResponse(target));
    if (url.endsWith("/bubbles")) return Promise.resolve(jsonResponse({ bubbles: [] }));
    if (url.endsWith("/notes")) {
      return Promise.resolve(new Response("", { status: 200, headers: { "content-type": "text/markdown" } }));
    }
    if (url.includes("/pearls/review-adds")) return Promise.resolve(jsonResponse({ added: [] }));
    if (url.includes("/continuity")) return Promise.resolve(jsonResponse({ candidates: [] }));
    if (url.includes("/attestations")) return Promise.resolve(jsonResponse({}));
    if (url.includes("/overlays")) return Promise.resolve(jsonResponse({ overlays: [] }));
    return Promise.resolve(jsonResponse({}));
  };
}

describe("runCompile / runExportAnalysis stale-session guard (V3-B review finding #5)", () => {
  it("runCompile: a result that resolves after navigating to a different project is discarded, never shown in the new session", async () => {
    const projectA = makeProject("stale-a", "Project A");
    const projectB = makeProject("stale-b", "Project B");
    useStudyLoopStore.setState({
      currentProject: projectA,
      sessionRequestId: 1,
      compiling: false,
      compileResult: null,
      notes: "",
      currentTime: 0,
      toasts: [],
    });

    let resolveCompile!: (v: Response) => void;
    const pendingCompile = new Promise<Response>((resolve) => {
      resolveCompile = resolve;
    });
    const switchFetch = stubProjectSwitchFetch(projectB);
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/notes") && init?.method === "PUT") {
        return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      }
      if (url.includes("/compile")) return pendingCompile;
      return switchFetch(input);
    });
    vi.stubGlobal("fetch", fetchMock);

    const compilePromise = useStudyLoopStore.getState().runCompile();
    // Navigate away before POST /compile resolves.
    await useStudyLoopStore.getState().loadProjectSession(projectB.id);
    expect(useStudyLoopStore.getState().currentProject?.id).toBe(projectB.id);

    resolveCompile(jsonResponse({ path: "exports/stale-a.md", markdown: "# A" }));
    await compilePromise;

    expect(useStudyLoopStore.getState().compileResult).toBeNull();
    // `compiling` must still reset (a global flag) — otherwise B's own Compile button stays stuck disabled.
    expect(useStudyLoopStore.getState().compiling).toBe(false);
    vi.unstubAllGlobals();
  });

  it("runExportAnalysis: a result that resolves after navigating to a different project is discarded", async () => {
    const projectA = makeProject("stale-share-a", "Project A");
    const projectB = makeProject("stale-share-b", "Project B");
    useStudyLoopStore.setState({
      currentProject: projectA,
      sessionRequestId: 1,
      exportingAnalysis: false,
      shareResult: null,
      toasts: [],
    });

    let resolveExport!: (v: Response) => void;
    const pendingExport = new Promise<Response>((resolve) => {
      resolveExport = resolve;
    });
    const switchFetch = stubProjectSwitchFetch(projectB);
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/export-analysis")) return pendingExport;
      return switchFetch(input);
    });
    vi.stubGlobal("fetch", fetchMock);

    const exportPromise = useStudyLoopStore.getState().runExportAnalysis();
    await useStudyLoopStore.getState().loadProjectSession(projectB.id);

    resolveExport(jsonResponse({ path: "exports/stale-a.studyloop.json", bundle: { version: 1 } }));
    await exportPromise;

    expect(useStudyLoopStore.getState().shareResult).toBeNull();
    expect(useStudyLoopStore.getState().exportingAnalysis).toBe(false);
    vi.unstubAllGlobals();
  });
});

// --- V3-C review finding #6: heatmap duration preference (client-learned half) --

describe("reportLearnedDuration (V3-C review finding #6)", () => {
  beforeEach(() => {
    const project = makeProject("p1", "Project 1");
    useStudyLoopStore.setState({ currentProject: project, projects: [project], toasts: [] });
  });

  it("PATCHes durationSeconds (rounded) when the project has none stored yet", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("PATCH");
      expect(JSON.parse(String(init?.body))).toEqual({ durationSeconds: 600 });
      return Promise.resolve(jsonResponse({ ...makeProject("p1", "Project 1"), durationSeconds: 600 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    useStudyLoopStore.getState().reportLearnedDuration(600.4);
    await new Promise((resolve) => setTimeout(resolve, 0)); // flush the fire-and-forget PATCH

    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("no-ops (no PATCH fired) when the reported duration already matches what's stored", async () => {
    useStudyLoopStore.setState({ currentProject: { ...makeProject("p1", "Project 1"), durationSeconds: 600 } });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    useStudyLoopStore.getState().reportLearnedDuration(600);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("no-ops for a nonpositive or non-finite duration", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    useStudyLoopStore.getState().reportLearnedDuration(0);
    useStudyLoopStore.getState().reportLearnedDuration(-5);
    useStudyLoopStore.getState().reportLearnedDuration(NaN);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

// --- V3-B review finding #7: pearl "Add to review" (client half) -----------

describe("addPearlToReview (V3-B review finding #7)", () => {
  beforeEach(() => {
    const project = makeProject("p1", "Project 1");
    useStudyLoopStore.setState({ currentProject: project, pearlReviewAdds: new Set(), toasts: [] });
  });

  it("optimistically adds the key, then applies the confirmed server set", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ added: ["60"] })));
    vi.stubGlobal("fetch", fetchMock);

    await useStudyLoopStore.getState().addPearlToReview(60);

    expect(useStudyLoopStore.getState().pearlReviewAdds.has("60")).toBe(true);
    vi.unstubAllGlobals();
  });

  it("rolls back the optimistic add on failure and toasts an error", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response("fail", { status: 500, statusText: "Internal Server Error" })));
    vi.stubGlobal("fetch", fetchMock);

    await useStudyLoopStore.getState().addPearlToReview(60);

    expect(useStudyLoopStore.getState().pearlReviewAdds.has("60")).toBe(false);
    expect(useStudyLoopStore.getState().toasts.some((t) => t.kind === "error")).toBe(true);
    vi.unstubAllGlobals();
  });

  it("is a no-op (no fetch fired) when the pearl is already in the set", async () => {
    useStudyLoopStore.setState({ pearlReviewAdds: new Set(["60"]) });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await useStudyLoopStore.getState().addPearlToReview(60);

    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

// --- V3-C review finding #8: rationale persistence round trip --------------

describe("patchCurrentProject — conceptRationales round trip (V3-C review finding #8)", () => {
  beforeEach(() => {
    const project = makeProject("p1", "Project 1");
    useStudyLoopStore.setState({ currentProject: project, projects: [project], toasts: [] });
  });

  it("PATCHes { conceptRationales } and applies the server's merged response to currentProject", async () => {
    const updated = { ...makeProject("p1", "Project 1"), conceptRationales: { c1: "groups by joint locks" } };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("PATCH");
      expect(JSON.parse(String(init?.body))).toEqual({ conceptRationales: { c1: "groups by joint locks" } });
      return Promise.resolve(jsonResponse(updated));
    });
    vi.stubGlobal("fetch", fetchMock);

    const ok = await useStudyLoopStore.getState().patchCurrentProject({ conceptRationales: { c1: "groups by joint locks" } });

    expect(ok).toBe(true);
    expect(useStudyLoopStore.getState().currentProject?.conceptRationales).toEqual({ c1: "groups by joint locks" });
    vi.unstubAllGlobals();
  });
});
