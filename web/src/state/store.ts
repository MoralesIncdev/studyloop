// Single source of truth for the app, per SPEC ("state/store.ts — zustand store,
// incl. currentTime"). Network calls live here too (rather than scattered across
// components) so every error path has exactly one place to funnel into a toast.
import { create } from "zustand";
import { api, ApiError } from "../lib/api";
import { parseHash, routeToHash, type Route } from "../lib/router";
import type { LibraryItem, Project, StudyLoopConfig, TranscriptSegment } from "../lib/types";
import type { PlayerHandle } from "../player/types";

export type DockTab = "notes" | "bubbles" | "concepts";

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

const MIN_RATE = 0.5;
const MAX_RATE = 2.5;
export function clampRate(r: number): number {
  return Math.min(MAX_RATE, Math.max(MIN_RATE, Math.round(r * 100) / 100));
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
  saveConfig: (patch: Partial<StudyLoopConfig>) => Promise<StudyLoopConfig>;

  // --- projects ----------------------------------------------------------------
  projects: Project[];
  projectsLoaded: boolean;
  loadProjects: () => Promise<Project[]>;
  openOrCreateLocalProject: (item: LibraryItem) => Promise<Project>;
  createYoutubeProject: (url: string) => Promise<Project>;

  // --- current study session ----------------------------------------------------
  currentProject: Project | null;
  currentProjectLoading: boolean;
  transcriptSegments: TranscriptSegment[];
  transcriptLoading: boolean;
  loadProjectSession: (id: string) => Promise<void>;
  clearProjectSession: () => void;
  patchCurrentProject: (patch: Partial<Pick<Project, "title" | "lastPosition">>) => Promise<void>;

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
      if (resolved.error) get().pushToast(resolved.error, "info");
      const created = await api.createProject({
        title: resolved.title ?? undefined,
        source: { type: "youtube", videoId: resolved.videoId, url },
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
  transcriptSegments: [],
  transcriptLoading: false,
  loadProjectSession: async (id) => {
    set({
      currentProjectLoading: true,
      currentProject: null,
      transcriptSegments: [],
      transcriptLoading: false,
      currentTime: 0,
      duration: 0,
      isPlaying: false,
      loopA: null,
      loopB: null,
      controller: null,
    });
    let project: Project;
    try {
      project = await api.getProject(id);
    } catch (err) {
      set({ currentProjectLoading: false });
      get().pushToast(`Could not load project: ${errorMessage(err)}`, "error");
      return;
    }
    set({ currentProject: project, currentProjectLoading: false });

    if (project.transcript.type === "file") {
      set({ transcriptLoading: true });
      try {
        const res = await api.getTranscript(project.transcript.path);
        set({ transcriptSegments: res.segments, transcriptLoading: false });
      } catch (err) {
        set({ transcriptLoading: false });
        get().pushToast(`Could not load transcript: ${errorMessage(err)}`, "error");
      }
    }
  },
  clearProjectSession: () => {
    set({
      currentProject: null,
      transcriptSegments: [],
      controller: null,
      currentTime: 0,
      duration: 0,
      isPlaying: false,
      loopA: null,
      loopB: null,
    });
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
