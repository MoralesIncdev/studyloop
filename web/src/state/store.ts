// Single source of truth for the app, per SPEC ("state/store.ts — zustand store,
// incl. currentTime"). Network calls live here too (rather than scattered across
// components) so every error path has exactly one place to funnel into a toast.
import { create } from "zustand";
import { api, ApiError } from "../lib/api";
import { parseHash, routeToHash, type Route } from "../lib/router";
import { activeConcepts, activeSegmentIndex } from "../lib/selectors";
import { formatTimestamp } from "../lib/time";
import type {
  Bubble,
  ConceptCard,
  HealthResponse,
  LibraryItem,
  Project,
  StudyLoopConfig,
  StudyLoopConfigPatch,
  TranscriptSegment,
} from "../lib/types";
import type { PlayerHandle } from "../player/types";

// "concepts" moved out of the bottom dock into the V2 right-rail Concepts
// card (see study/RightRail.tsx) — the description box below the player now
// only hosts Notes/Bubbles, matching YouTube's description-box tabs.
export type DockTab = "notes" | "bubbles";

export interface Toast {
  id: string;
  message: string;
  kind: "error" | "info" | "success";
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sortBubbles(bubbles: readonly Bubble[]): Bubble[] {
  return [...bubbles].sort((a, b) => a.t - b.t);
}

// Notes autosave debounce timer + in-flight shot-capture promise. Kept as
// module-level state (not component-local, e.g. a NotesPane ref) so a
// `flushNotes()`/wait-for-shot action can be called from anywhere that has
// the store — CompileFlow (via runCompile) and StudyView's unmount cleanup
// in particular — without needing a live reference to whatever component
// happens to be mounted.
const NOTES_AUTOSAVE_DEBOUNCE_MS = 800;
let notesSaveTimer: ReturnType<typeof setTimeout> | null = null;
function clearPendingNotesSave(): void {
  if (notesSaveTimer) {
    clearTimeout(notesSaveTimer);
    notesSaveTimer = null;
  }
}

/** F4 Notation modal state — a shot capture is in flight the moment the modal opens. */
export interface NotationModalState {
  t: number;
  /** Prefilled quote of the active transcript segment at t, if any. Removable, not saved if cleared. */
  quote: string | null;
  /** Title of the concept active at t, if any (F7). Removable, like the quote. */
  conceptTitle: string | null;
  shot: string | null;
  shotLoading: boolean;
  shotFailed: boolean;
  saving: boolean;
  /**
   * The in-flight POST /shots promise, while shotLoading is true (null once
   * settled or if no capture was attempted at all — e.g. ffmpeg is known
   * missing). NotationModal awaits this (bounded by a 15s timeout, after
   * which it offers "Save without frame") so a fast Save can't race ahead of
   * the capture and create an orphaned-shot/empty-shot bubble.
   */
  shotPromise: Promise<{ shot: string | null; error?: string }> | null;
}

const MIN_RATE = 0.5;
const MAX_RATE = 2.5;
export function clampRate(r: number): number {
  return Math.min(MAX_RATE, Math.max(MIN_RATE, Math.round(r * 100) / 100));
}

export function clampVolume(v: number): number {
  return Math.min(1, Math.max(0, v));
}

// CC-on/off is persisted client-side only (V2-A chunk — the project model's
// PATCH surface isn't touched this chunk; see SPEC "CC overlay" note). Keyed
// per project so it doesn't leak across videos.
const CC_STORAGE_PREFIX = "studyloop:ccEnabled:";
function ccStorageKey(projectId: string): string {
  return `${CC_STORAGE_PREFIX}${projectId}`;
}
function readCcEnabled(projectId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(ccStorageKey(projectId)) === "1";
  } catch {
    return false;
  }
}
function writeCcEnabled(projectId: string, value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ccStorageKey(projectId), value ? "1" : "0");
  } catch {
    // Storage can throw (private browsing, quota) — CC toggling still works
    // for the session, it just won't persist. Not worth a toast.
  }
}

export interface StudyLoopStore {
  // --- routing -------------------------------------------------------------
  route: Route;
  navigate: (route: Route) => void;

  // --- library ---------------------------------------------------------------
  libraryItems: LibraryItem[];
  libraryWarnings: string[];
  libraryLoading: boolean;
  libraryLoaded: boolean;
  loadLibrary: () => Promise<void>;
  rescanLibrary: () => Promise<void>;

  // --- config ----------------------------------------------------------------
  config: StudyLoopConfig | null;
  configLoading: boolean;
  loadConfig: () => Promise<StudyLoopConfig | null>;
  saveConfig: (patch: StudyLoopConfigPatch) => Promise<StudyLoopConfig>;

  // --- health (out-of-box polish: ffmpeg/yt-dlp availability) -----------------
  /** `null` until loadHealth() resolves once — see App.tsx mount effect. */
  health: HealthResponse | null;
  loadHealth: () => Promise<void>;

  // --- projects ----------------------------------------------------------------
  projects: Project[];
  projectsLoaded: boolean;
  loadProjects: () => Promise<Project[]>;
  openOrCreateLocalProject: (item: LibraryItem) => Promise<Project>;
  createYoutubeProject: (url: string) => Promise<Project>;

  // --- current study session ----------------------------------------------------
  currentProject: Project | null;
  currentProjectLoading: boolean;
  /** Bumped on every loadProjectSession/clearProjectSession call; late responses from a
   *  superseded call compare their captured id against this and discard themselves. */
  sessionRequestId: number;
  transcriptSegments: TranscriptSegment[];
  transcriptLoading: boolean;
  loadProjectSession: (id: string) => Promise<void>;
  clearProjectSession: () => void;
  patchCurrentProject: (patch: Partial<Pick<Project, "title" | "lastPosition" | "watchedUpTo">>) => Promise<void>;

  // --- concepts (F7) ---------------------------------------------------------------
  concepts: ConceptCard[];
  conceptsLoading: boolean;
  conceptTickerMuted: boolean;
  setConceptTickerMuted: (muted: boolean) => void;
  /** PATCHes the project's conceptDoc then loads its parsed concepts. */
  attachConceptDoc: (path: string) => Promise<void>;
  /** Clears the project's conceptDoc and its loaded concepts. */
  detachConceptDoc: () => Promise<void>;

  // --- player + sync engine -------------------------------------------------------
  controller: PlayerHandle | null;
  setController: (c: PlayerHandle | null) => void;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  playbackRate: number;
  setCurrentTime: (t: number) => void;
  setDuration: (d: number) => void;
  setIsPlaying: (p: boolean) => void;
  setPlaybackRate: (r: number) => void;
  volume: number;
  setVolume: (v: number) => void;

  // --- CC overlay (V2-A; persisted client-side only, see ccStorageKey) -----------
  ccEnabled: boolean;
  setCcEnabled: (v: boolean) => void;
  toggleCcEnabled: () => void;

  // --- A/B loop -----------------------------------------------------------------
  loopA: number | null;
  loopB: number | null;
  setLoopA: (t: number | null) => void;
  setLoopB: (t: number | null) => void;
  clearLoop: () => void;

  // --- transcript UX --------------------------------------------------------------
  lastUserScrollAt: number;
  markUserScroll: () => void;

  // --- bottom dock ----------------------------------------------------------------
  activeDockTab: DockTab;
  setActiveDockTab: (tab: DockTab) => void;

  // --- notes (F6) -------------------------------------------------------------------
  notes: string;
  notesLoaded: boolean;
  notesSaveStatus: "idle" | "saving" | "saved" | "error";
  /** Updates the notes buffer immediately (optimistic) and (re)schedules a debounced save. */
  setNotesDraft: (content: string) => void;
  saveNotes: (content: string) => Promise<void>;
  /** Flushes any pending debounced note save immediately. Called before compiling
   *  and on leaving the Study view, so the latest edit is never dropped. */
  flushNotes: () => Promise<void>;

  // --- bubbles (F4/F5/F6) -------------------------------------------------------------
  bubbles: Bubble[];
  bubblesLoading: boolean;
  patchBubble: (bubbleId: string, patch: { t?: number; text?: string; shot?: string | null }) => Promise<void>;
  deleteBubble: (bubbleId: string) => Promise<void>;
  appendBubbleToNotes: (bubbleId: string) => Promise<void>;

  // --- F4 notation modal --------------------------------------------------------------
  notationModal: NotationModalState | null;
  notationGeneration: number;
  openNotation: () => void;
  removeNotationQuote: () => void;
  removeNotationConcept: () => void;
  cancelNotation: () => void;
  saveNotation: (text: string) => Promise<void>;

  // --- F5 screenshot-only ---------------------------------------------------------------
  captureScreenshotOnly: () => Promise<void>;

  // --- F10 compile ------------------------------------------------------------------
  compiling: boolean;
  /** Set once POST /api/projects/:id/compile succeeds; drives the preview modal. */
  compileResult: { path: string; markdown: string } | null;
  runCompile: () => Promise<void>;
  clearCompileResult: () => void;
  /** `path` defaults to the project's exports/ directory when omitted. */
  revealExport: (path?: string) => Promise<void>;

  // --- toasts -----------------------------------------------------------------------
  toasts: Toast[];
  pushToast: (message: string, kind?: Toast["kind"]) => void;
  dismissToast: (id: string) => void;
}

export const useStudyLoopStore = create<StudyLoopStore>((set, get) => ({
  // --- routing -------------------------------------------------------------
  route: typeof window !== "undefined" ? parseHash(window.location.hash) : { view: "library" },
  navigate: (route) => {
    const hash = routeToHash(route);
    if (window.location.hash === hash) {
      // Same route (e.g. re-opening the same project) — hashchange won't fire.
      set({ route });
      return;
    }
    window.location.hash = hash;
  },

  // --- library ---------------------------------------------------------------
  libraryItems: [],
  libraryWarnings: [],
  libraryLoading: false,
  libraryLoaded: false,
  loadLibrary: async () => {
    // React StrictMode's double-mount (plus LibraryView's own mount effect
    // re-running on re-renders) fired several stacked GETs on first load —
    // each one re-walking the whole library. A scan is idempotent from the
    // caller's point of view, so just no-op while one is already in flight.
    if (get().libraryLoading) return;
    set({ libraryLoading: true });
    try {
      const res = await api.getLibrary();
      set({ libraryItems: res.items, libraryWarnings: res.warnings, libraryLoading: false, libraryLoaded: true });
      for (const w of res.warnings) get().pushToast(w, "info");
    } catch (err) {
      set({ libraryLoading: false });
      get().pushToast(`Could not load library: ${errorMessage(err)}`, "error");
    }
  },
  rescanLibrary: async () => {
    if (get().libraryLoading) return;
    set({ libraryLoading: true });
    try {
      const res = await api.rescanLibrary();
      set({ libraryItems: res.items, libraryWarnings: res.warnings, libraryLoading: false, libraryLoaded: true });
      get().pushToast(`Rescanned: ${res.items.length} item(s) found`, "success");
      for (const w of res.warnings) get().pushToast(w, "info");
    } catch (err) {
      set({ libraryLoading: false });
      get().pushToast(`Rescan failed: ${errorMessage(err)}`, "error");
    }
  },

  // --- config ----------------------------------------------------------------
  config: null,
  configLoading: false,
  loadConfig: async () => {
    set({ configLoading: true });
    try {
      const config = await api.getConfig();
      set({ config, configLoading: false });
      return config;
    } catch (err) {
      set({ configLoading: false });
      get().pushToast(`Could not load settings: ${errorMessage(err)}`, "error");
      return null;
    }
  },
  saveConfig: async (patch) => {
    try {
      const config = await api.putConfig(patch);
      set({ config });
      return config;
    } catch (err) {
      get().pushToast(`Could not save settings: ${errorMessage(err)}`, "error");
      throw err;
    }
  },

  // --- health ------------------------------------------------------------------
  health: null,
  loadHealth: async () => {
    try {
      const health = await api.getHealth();
      set({ health });
    } catch {
      // Non-critical: screenshot controls just won't be able to explain
      // *why* they're disabled. No toast — this runs once on app mount and
      // a health-check failure shouldn't greet the user with an error.
    }
  },

  // --- projects ----------------------------------------------------------------
  projects: [],
  projectsLoaded: false,
  loadProjects: async () => {
    try {
      const res = await api.listProjects();
      set({ projects: res.projects, projectsLoaded: true });
      return res.projects;
    } catch (err) {
      get().pushToast(`Could not load projects: ${errorMessage(err)}`, "error");
      throw err;
    }
  },
  openOrCreateLocalProject: async (item) => {
    try {
      const list = get().projectsLoaded ? get().projects : await get().loadProjects();
      const existing = list.find((p) => p.source.type === "local" && p.source.path === item.videoPath);
      if (existing) return existing;
      const created = await api.createProject({
        title: item.title,
        source: { type: "local", path: item.videoPath },
        transcriptPath: item.transcriptPath,
      });
      set((state) => ({ projects: [...state.projects, created] }));
      return created;
    } catch (err) {
      get().pushToast(`Could not open "${item.title}": ${errorMessage(err)}`, "error");
      throw err;
    }
  },
  createYoutubeProject: async (url) => {
    try {
      const resolved = await api.resolveYoutube(url);
      if (!resolved.videoId) {
        const message = resolved.error ?? "Could not resolve that YouTube URL";
        get().pushToast(message, "error");
        throw new ApiError(message, 502);
      }
      // yt-dlp missing must not block project creation — playback/captions are
      // a later chunk; the project is still created with title = URL.
      if (resolved.ytdlpMissing) {
        get().pushToast("yt-dlp not found — the project was created without a title or captions.", "info");
      } else if (resolved.error) {
        get().pushToast(resolved.error, "info");
      }
      const created = await api.createProject({
        title: resolved.title ?? url,
        source: { type: "youtube", videoId: resolved.videoId, url },
        // Persisted server-side as captions.json and wired up as the
        // project's transcript (see server/src/routes/projects.ts) — the
        // TranscriptPane then "just works" for YouTube projects with no
        // further client-side plumbing.
        captions: resolved.captions,
      });
      set((state) => ({ projects: [...state.projects, created] }));
      return created;
    } catch (err) {
      if (!(err instanceof ApiError)) get().pushToast(`Could not add YouTube video: ${errorMessage(err)}`, "error");
      throw err;
    }
  },

  // --- current study session ----------------------------------------------------
  currentProject: null,
  currentProjectLoading: false,
  sessionRequestId: 0,
  transcriptSegments: [],
  transcriptLoading: false,
  loadProjectSession: async (id) => {
    // Tag this call with a fresh request id. Every async continuation below
    // checks it's still current before touching state — if the user
    // navigates to a different project (or back to the library and into a
    // third project) before an earlier fetch resolves, that response is
    // discarded instead of clobbering the now-current session (which was the
    // "Loading project…" forever bug: a stale response could flip
    // currentProjectLoading back on, or set currentProject to the wrong id,
    // after a newer load had already finished).
    const requestId = get().sessionRequestId + 1;
    const isCurrent = () => get().sessionRequestId === requestId;

    // Defensive: a pending debounced save from the *previous* project must
    // never fire against whatever project ends up current by the time its
    // timer goes off. StudyView's unmount/project-switch cleanup already
    // flushes synchronously before calling here, but this is cheap and
    // guards any other caller of loadProjectSession too.
    clearPendingNotesSave();

    set({
      sessionRequestId: requestId,
      currentProjectLoading: true,
      currentProject: null,
      transcriptSegments: [],
      transcriptLoading: false,
      currentTime: 0,
      duration: 0,
      isPlaying: false,
      volume: get().volume,
      ccEnabled: false,
      loopA: null,
      loopB: null,
      controller: null,
      bubbles: [],
      bubblesLoading: false,
      notes: "",
      notesLoaded: false,
      notesSaveStatus: "idle",
      concepts: [],
      conceptsLoading: false,
      notationModal: null,
      notationGeneration: get().notationGeneration + 1,
      compiling: false,
      compileResult: null,
    });
    let project: Project;
    try {
      project = await api.getProject(id);
    } catch (err) {
      if (!isCurrent()) return;
      set({ currentProjectLoading: false });
      get().pushToast(`Could not load project: ${errorMessage(err)}`, "error");
      return;
    }
    if (!isCurrent()) return;
    set({ currentProject: project, currentProjectLoading: false, ccEnabled: readCcEnabled(project.id) });

    const bubblesPromise = (async () => {
      set({ bubblesLoading: true });
      try {
        const res = await api.listBubbles(id);
        if (!isCurrent()) return;
        set({ bubbles: sortBubbles(res.bubbles), bubblesLoading: false });
      } catch (err) {
        if (!isCurrent()) return;
        set({ bubblesLoading: false });
        get().pushToast(`Could not load bubbles: ${errorMessage(err)}`, "error");
      }
    })();

    const notesPromise = (async () => {
      try {
        const content = await api.getNotes(id);
        if (!isCurrent()) return;
        set({ notes: content, notesLoaded: true });
      } catch (err) {
        if (!isCurrent()) return;
        set({ notesLoaded: true });
        get().pushToast(`Could not load notes: ${errorMessage(err)}`, "error");
      }
    })();

    const conceptsPromise = (async () => {
      if (!project.conceptDoc?.path) return;
      set({ conceptsLoading: true });
      try {
        const res = await api.getConcepts(id);
        if (!isCurrent()) return;
        set({ concepts: res.concepts, conceptsLoading: false });
      } catch (err) {
        if (!isCurrent()) return;
        set({ conceptsLoading: false });
        get().pushToast(`Could not load concepts: ${errorMessage(err)}`, "error");
      }
    })();

    if (project.transcript.type === "file") {
      set({ transcriptLoading: true });
      try {
        const res = await api.getTranscript(project.transcript.path, project.id);
        if (!isCurrent()) return;
        set({ transcriptSegments: res.segments, transcriptLoading: false });
      } catch (err) {
        if (!isCurrent()) return;
        set({ transcriptLoading: false });
        get().pushToast(`Could not load transcript: ${errorMessage(err)}`, "error");
      }
    }

    await Promise.all([bubblesPromise, notesPromise, conceptsPromise]);
  },
  clearProjectSession: () => {
    clearPendingNotesSave();
    set((state) => ({
      sessionRequestId: state.sessionRequestId + 1,
      currentProject: null,
      transcriptSegments: [],
      controller: null,
      currentTime: 0,
      duration: 0,
      isPlaying: false,
      ccEnabled: false,
      loopA: null,
      loopB: null,
      bubbles: [],
      bubblesLoading: false,
      notes: "",
      notesLoaded: false,
      notesSaveStatus: "idle",
      concepts: [],
      conceptsLoading: false,
      notationModal: null,
      notationGeneration: state.notationGeneration + 1,
      compiling: false,
      compileResult: null,
    }));
  },
  patchCurrentProject: async (patch) => {
    const project = get().currentProject;
    if (!project) return;
    try {
      const updated = await api.patchProject(project.id, patch);
      set((state) => ({
        currentProject: state.currentProject?.id === updated.id ? updated : state.currentProject,
        projects: state.projects.map((p) => (p.id === updated.id ? updated : p)),
      }));
    } catch (err) {
      get().pushToast(`Could not save progress: ${errorMessage(err)}`, "error");
    }
  },

  // --- concepts (F7) ---------------------------------------------------------------
  concepts: [],
  conceptsLoading: false,
  conceptTickerMuted: false,
  setConceptTickerMuted: (muted) => set({ conceptTickerMuted: muted }),
  attachConceptDoc: async (path) => {
    const project = get().currentProject;
    if (!project) return;
    try {
      const updated = await api.patchProject(project.id, { conceptDoc: { path } });
      set((state) => ({
        currentProject: state.currentProject?.id === updated.id ? updated : state.currentProject,
        projects: state.projects.map((p) => (p.id === updated.id ? updated : p)),
      }));
    } catch (err) {
      get().pushToast(`Could not attach concept doc: ${errorMessage(err)}`, "error");
      throw err;
    }
    set({ conceptsLoading: true });
    try {
      const res = await api.getConcepts(project.id);
      // The project could have been navigated away from while this GET was
      // in flight — only apply if we're still looking at the same project.
      if (get().currentProject?.id !== project.id) return;
      set({ concepts: res.concepts, conceptsLoading: false });
    } catch (err) {
      if (get().currentProject?.id !== project.id) return;
      set({ conceptsLoading: false });
      get().pushToast(`Could not load concepts: ${errorMessage(err)}`, "error");
    }
  },
  detachConceptDoc: async () => {
    const project = get().currentProject;
    if (!project) return;
    try {
      const updated = await api.patchProject(project.id, { conceptDoc: {} });
      set((state) => ({
        currentProject: state.currentProject?.id === updated.id ? updated : state.currentProject,
        projects: state.projects.map((p) => (p.id === updated.id ? updated : p)),
        concepts: [],
      }));
    } catch (err) {
      get().pushToast(`Could not detach concept doc: ${errorMessage(err)}`, "error");
      throw err;
    }
  },

  // --- player + sync engine -------------------------------------------------------
  controller: null,
  setController: (c) => set({ controller: c }),
  currentTime: 0,
  duration: 0,
  isPlaying: false,
  playbackRate: 1,
  setCurrentTime: (t) => set({ currentTime: t }),
  setDuration: (d) => set({ duration: d }),
  setIsPlaying: (p) => set({ isPlaying: p }),
  setPlaybackRate: (r) => set({ playbackRate: clampRate(r) }),
  volume: 1,
  setVolume: (v) => set({ volume: clampVolume(v) }),

  // --- CC overlay (V2-A) ----------------------------------------------------------
  ccEnabled: false,
  setCcEnabled: (v) => {
    set({ ccEnabled: v });
    const project = get().currentProject;
    if (project) writeCcEnabled(project.id, v);
  },
  toggleCcEnabled: () => get().setCcEnabled(!get().ccEnabled),

  // --- A/B loop -----------------------------------------------------------------
  loopA: null,
  loopB: null,
  setLoopA: (t) =>
    set((state) => ({
      loopA: t,
      loopB: t != null && state.loopB != null && state.loopB <= t ? null : state.loopB,
    })),
  setLoopB: (t) =>
    set((state) => {
      if (t != null && state.loopA != null && t <= state.loopA) {
        get().pushToast("Loop point B must be after A", "error");
        return {};
      }
      return { loopB: t };
    }),
  clearLoop: () => set({ loopA: null, loopB: null }),

  // --- transcript UX --------------------------------------------------------------
  lastUserScrollAt: 0,
  markUserScroll: () => set({ lastUserScrollAt: Date.now() }),

  // --- bottom dock ----------------------------------------------------------------
  activeDockTab: "notes",
  setActiveDockTab: (tab) => set({ activeDockTab: tab }),

  // --- notes (F6) -------------------------------------------------------------------
  notes: "",
  notesLoaded: false,
  notesSaveStatus: "idle",
  setNotesDraft: (content) => {
    // `notes` is updated immediately (optimistic) rather than only after the
    // debounced save lands — this is what makes it safe for flushNotes() (and
    // appendBubbleToNotes, and anything else reading get().notes) to always
    // see the very latest edit, not a stale last-saved snapshot.
    set({ notes: content, notesSaveStatus: "saving" });
    clearPendingNotesSave();
    notesSaveTimer = setTimeout(() => {
      notesSaveTimer = null;
      void get().saveNotes(content);
    }, NOTES_AUTOSAVE_DEBOUNCE_MS);
  },
  saveNotes: async (content) => {
    const project = get().currentProject;
    if (!project) return;
    try {
      await api.putNotes(project.id, content);
      set({ notes: content, notesSaveStatus: "saved" });
    } catch (err) {
      set({ notesSaveStatus: "error" });
      get().pushToast(`Could not save notes: ${errorMessage(err)}`, "error");
      throw err;
    }
  },
  flushNotes: async () => {
    clearPendingNotesSave();
    await get().saveNotes(get().notes);
  },

  // --- bubbles (F4/F5/F6) -------------------------------------------------------------
  bubbles: [],
  bubblesLoading: false,
  patchBubble: async (bubbleId, patch) => {
    const project = get().currentProject;
    if (!project) return;
    const prev = get().bubbles;
    set({ bubbles: sortBubbles(prev.map((b) => (b.id === bubbleId ? { ...b, ...patch } : b))) });
    try {
      const updated = await api.patchBubble(project.id, bubbleId, patch);
      set((state) => ({ bubbles: sortBubbles(state.bubbles.map((b) => (b.id === bubbleId ? updated : b))) }));
    } catch (err) {
      set({ bubbles: prev });
      get().pushToast(`Could not update capture: ${errorMessage(err)}`, "error");
    }
  },
  deleteBubble: async (bubbleId) => {
    const project = get().currentProject;
    if (!project) return;
    const prev = get().bubbles;
    set({ bubbles: prev.filter((b) => b.id !== bubbleId) });
    try {
      await api.deleteBubble(project.id, bubbleId);
    } catch (err) {
      set({ bubbles: prev });
      get().pushToast(`Could not delete capture: ${errorMessage(err)}`, "error");
    }
  },
  appendBubbleToNotes: async (bubbleId) => {
    const bubble = get().bubbles.find((b) => b.id === bubbleId);
    const project = get().currentProject;
    if (!bubble || !project) return;
    const line = `^t:${bubble.t}${bubble.text ? ` ${bubble.text}` : ""}`;
    const shotLine = bubble.shot ? `\n![shot](${bubble.shot})` : "";
    const separator = get().notes.length > 0 && !get().notes.endsWith("\n") ? "\n" : "";
    const nextNotes = `${get().notes}${separator}\n${line}${shotLine}\n`;
    // Supersede any pending debounced save — it would otherwise fire later
    // with the pre-append text and clobber this direct write.
    clearPendingNotesSave();
    try {
      await api.putNotes(project.id, nextNotes);
      set({ notes: nextNotes, notesSaveStatus: "saved" });
      get().pushToast("Added to notes", "success");
    } catch (err) {
      get().pushToast(`Could not update notes: ${errorMessage(err)}`, "error");
    }
  },

  // --- F4 notation modal --------------------------------------------------------------
  notationModal: null,
  notationGeneration: 0,
  openNotation: () => {
    const controller = get().controller;
    const project = get().currentProject;
    if (!controller || !project || get().notationModal) return;
    controller.pause();
    const t = controller.getCurrentTime();
    const idx = activeSegmentIndex(get().transcriptSegments, t);
    const quote = idx >= 0 ? get().transcriptSegments[idx].text : null;
    const activeAtT = activeConcepts(get().concepts, t);
    const conceptTitle = activeAtT.length > 0 ? activeAtT[0].card.title : null;
    const gen = get().notationGeneration + 1;

    // Respect the ffmpeg-missing health gate exactly like the disabled Shot
    // button: don't even attempt the capture (which would just fail on the
    // server after a wasted round trip) — open the modal straight into its
    // "no frame" state with an explanatory toast instead.
    const ffmpegMissing = get().health?.ffmpeg === false;
    if (ffmpegMissing) {
      set({
        notationGeneration: gen,
        notationModal: {
          t,
          quote,
          conceptTitle,
          shot: null,
          shotLoading: false,
          shotFailed: true,
          saving: false,
          shotPromise: null,
        },
      });
      get().pushToast("ffmpeg not found on PATH — capturing a frame is disabled", "info");
      return;
    }

    const capturePromise = api.captureShot(project.id, t);
    set({
      notationGeneration: gen,
      notationModal: {
        t,
        quote,
        conceptTitle,
        shot: null,
        shotLoading: true,
        shotFailed: false,
        saving: false,
        shotPromise: capturePromise,
      },
    });
    capturePromise.then(
      (res) => {
        set((state) => {
          if (state.notationGeneration !== gen || !state.notationModal) return {};
          return res.shot
            ? { notationModal: { ...state.notationModal, shot: res.shot, shotLoading: false } }
            : { notationModal: { ...state.notationModal, shotLoading: false, shotFailed: true } };
        });
      },
      () => {
        set((state) => {
          if (state.notationGeneration !== gen || !state.notationModal) return {};
          return { notationModal: { ...state.notationModal, shotLoading: false, shotFailed: true } };
        });
      }
    );
  },
  removeNotationQuote: () =>
    set((state) => (state.notationModal ? { notationModal: { ...state.notationModal, quote: null } } : {})),
  removeNotationConcept: () =>
    set((state) => (state.notationModal ? { notationModal: { ...state.notationModal, conceptTitle: null } } : {})),
  cancelNotation: () => {
    set((state) => ({ notationGeneration: state.notationGeneration + 1, notationModal: null }));
    get().controller?.play();
  },
  saveNotation: async (text) => {
    const state = get();
    const modal = state.notationModal;
    const project = state.currentProject;
    if (!modal || !project) return;
    set({ notationModal: { ...modal, saving: true } });
    // "re: <concept title>" (if any) is its own line above the quote (if any);
    // the free-text note follows as a separate paragraph, mirroring how the
    // quote alone used to be joined to the text.
    const header = [modal.conceptTitle ? `re: ${modal.conceptTitle}` : null, modal.quote].filter(
      (line): line is string => line != null
    ).join("\n");
    const finalText = header ? `${header}${text.trim() ? `\n\n${text.trim()}` : ""}` : text.trim();
    try {
      const bubble = await api.createBubble(project.id, { t: modal.t, text: finalText, shot: modal.shot });
      set((s) => ({
        bubbles: sortBubbles([...s.bubbles, bubble]),
        notationGeneration: s.notationGeneration + 1,
        notationModal: null,
      }));
      get().controller?.play();
    } catch (err) {
      get().pushToast(`Could not save note: ${errorMessage(err)}`, "error");
      set((s) => ({ notationModal: s.notationModal ? { ...s.notationModal, saving: false } : null }));
    }
  },

  // --- F5 screenshot-only ---------------------------------------------------------------
  captureScreenshotOnly: async () => {
    const controller = get().controller;
    const project = get().currentProject;
    if (!controller || !project) return;
    // Respect the ffmpeg-missing health gate exactly like the disabled Shot
    // button (and the S hotkey, which calls this same action) — explain why
    // instead of attempting a capture already known to fail.
    if (get().health?.ffmpeg === false) {
      get().pushToast("ffmpeg not found on PATH — screenshots are disabled", "info");
      return;
    }
    const t = controller.getCurrentTime();
    try {
      const res = await api.captureShot(project.id, t);
      const bubble = await api.createBubble(project.id, { t, text: "", shot: res.shot ?? null });
      set((state) => ({ bubbles: sortBubbles([...state.bubbles, bubble]) }));
      if (res.shot) {
        get().pushToast(`Captured ${formatTimestamp(t)}`, "success");
      } else {
        get().pushToast(`Screenshot failed (${res.error ?? "unknown error"}) — capture saved without image`, "error");
      }
    } catch (err) {
      get().pushToast(`Could not capture: ${errorMessage(err)}`, "error");
    }
  },

  // --- F10 compile --------------------------------------------------------------------
  compiling: false,
  compileResult: null,
  runCompile: async () => {
    const project = get().currentProject;
    if (!project) return;
    set({ compiling: true });
    try {
      // The compiled doc must reflect the very latest notes edit and
      // progress, even if the user hits Compile before the 800ms notes
      // debounce or the periodic progress PATCH would otherwise have fired.
      await get().flushNotes();
      const t = get().currentTime;
      if (t > 0) {
        const watchedUpTo = Math.max(get().currentProject?.watchedUpTo ?? 0, t);
        await get().patchCurrentProject({ lastPosition: t, watchedUpTo });
      }
      const result = await api.compile(project.id);
      set({ compiling: false, compileResult: result });
      get().pushToast("Compiled study document", "success");
    } catch (err) {
      set({ compiling: false });
      get().pushToast(`Could not compile: ${errorMessage(err)}`, "error");
    }
  },
  clearCompileResult: () => set({ compileResult: null }),
  revealExport: async (path) => {
    const project = get().currentProject;
    if (!project) return;
    try {
      const res = await api.reveal(project.id, path);
      if (!res.ok) get().pushToast(res.message ?? "Could not reveal in Finder", "info");
    } catch (err) {
      get().pushToast(`Could not reveal in Finder: ${errorMessage(err)}`, "error");
    }
  },

  // --- toasts -----------------------------------------------------------------------
  toasts: [],
  pushToast: (message, kind = "error") => {
    const id = makeId();
    set((state) => ({ toasts: [...state.toasts, { id, message, kind }] }));
    setTimeout(() => get().dismissToast(id), 6000);
  },
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

if (typeof window !== "undefined") {
  window.addEventListener("hashchange", () => {
    useStudyLoopStore.setState({ route: parseHash(window.location.hash) });
  });
}
