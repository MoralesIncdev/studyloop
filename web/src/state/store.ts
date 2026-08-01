// Single source of truth for the app, per SPEC ("state/store.ts — zustand store,
// incl. currentTime"). Network calls live here too (rather than scattered across
// components) so every error path has exactly one place to funnel into a toast.
import { create } from "zustand";
import { api, ApiError } from "../lib/api";
import { parseHash, routeToHash, type Route } from "../lib/router";
import { activeConcepts, activeSegmentIndex } from "../lib/selectors";
import { nextAbLoopAction } from "../lib/abLoop";
import { formatTimestamp } from "../lib/time";
import { buildMinedText } from "../lib/mining";
import { pickPrompt, promptPoolFor } from "../lib/notationPrompts";
import type {
  Analysis,
  AnalyzeStatus,
  AttestationPatchBody,
  AttestationsFile,
  Bubble,
  ConceptCard,
  ContinuityCandidate,
  HealthResponse,
  HeatmapMark,
  LibraryItem,
  MergeCandidate,
  MergedConceptsResponse,
  MergeResolveAction,
  OverlayMeta,
  Project,
  ReviewCard,
  ReviewGrade,
  ReviewQueueCounts,
  ReviewStreak,
  SearchIntent,
  ShareBundle,
  StudyLoopConfig,
  StudyLoopConfigPatch,
  TranscriptSegment,
} from "../lib/types";
import { llmConfigured } from "../lib/types";
import { hasSeenAttentionLegend, markAttentionLegendSeen } from "../lib/attentionHeatmap";
import { resetAllPaneLayouts as clearStoredPaneLayouts } from "../lib/consoleLayout";
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

// Toast auto-dismiss timers, kept outside the store (not serializable state,
// and re-running them shouldn't trigger a re-render) — see pauseToastTimer.
const toastTimers = new Map<string, ReturnType<typeof setTimeout>>();
const TOAST_LIFETIME_MS = 6000;

/** Console slice D: flashContext's auto-clear timer — same "kept outside the
 *  store" reasoning as toastTimers above. Mock's own ctxFlashTimer (index.html
 *  line 1269) is the same single-slot-not-a-queue design: a new flash simply
 *  restarts the clock rather than queuing. */
let contextFlashTimer: ReturnType<typeof setTimeout> | null = null;
const CONTEXT_FLASH_MS = 2600;

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

// V2-C: Analyze-status poll timer + heatmap-refetch debounce, kept as
// module-level state for the same reason as notesSaveTimer above — a single
// active timer regardless of which component happens to be mounted, cleared
// deterministically on project switch/unmount rather than component teardown.
const ANALYZE_POLL_INTERVAL_MS = 1000;
const HEATMAP_DEBOUNCE_MS = 400;
let analyzePollTimer: ReturnType<typeof setInterval> | null = null;
let heatmapDebounceTimer: ReturnType<typeof setTimeout> | null = null;
function clearAnalyzePoll(): void {
  if (analyzePollTimer) {
    clearInterval(analyzePollTimer);
    analyzePollTimer = null;
  }
}
function clearHeatmapDebounce(): void {
  if (heatmapDebounceTimer) {
    clearTimeout(heatmapDebounceTimer);
    heatmapDebounceTimer = null;
  }
}

// V3-A A1 "State-aware surface purge": playbackFocus flips true after 1.5s of
// *continuous* playback (debounced so scrubbing/quick pause-resume doesn't
// flicker the purge on and off), and flips false the instant playback pauses.
// Kept as a module-level timer for the same reason as the timers above — a
// single owner regardless of which component is mounted, cleared
// deterministically on project switch (see loadProjectSession/clearProjectSession).
const PLAYBACK_FOCUS_DEBOUNCE_MS = 1500;
let playbackFocusTimer: ReturnType<typeof setTimeout> | null = null;
function clearPlaybackFocusTimer(): void {
  if (playbackFocusTimer) {
    clearTimeout(playbackFocusTimer);
    playbackFocusTimer = null;
  }
}

/** RightRail's Transcript/Concepts/Path accordion — only one "large" section open at a time (codex P1-5), remembered per project. V3-B B3 adds "path" (Study Path). */
export type RailSectionId = "transcript" | "concepts" | "path";

/** Console slice C (mock's setMode, index.html lines 1199-1211): Watch/Generate/Review. */
export type Modality = "watch" | "generate" | "review";

/** Console slice C: which edge-handle cabinet is open, if any (exclusive). */
export type CabinetId = "concepts" | "captures" | "session";

const RAIL_SECTION_STORAGE_PREFIX = "studyloop:railSection:";
/**
 * `"none"` (both sections collapsed) is a distinct, valid persisted choice —
 * not the same as "nothing has ever been stored" (`null`). Collapsing those
 * two into a single `null` return here previously made the loader's
 * `?? "transcript"` fallback (see loadProjectSession) treat a genuine
 * persisted "none" as missing and reopen Transcript on every reload
 * (V3-A review finding #6) — callers must branch on the literal `"none"`
 * string themselves rather than relying on `??`.
 */
export function loadStoredRailSection(projectId: string): RailSectionId | "none" | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(RAIL_SECTION_STORAGE_PREFIX + projectId);
    if (raw === "transcript" || raw === "concepts" || raw === "path" || raw === "none") return raw;
    return null;
  } catch {
    return null;
  }
}
function storeRailSection(projectId: string, section: RailSectionId | null): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RAIL_SECTION_STORAGE_PREFIX + projectId, section ?? "none");
  } catch {
    // Storage can throw in private-browsing/quota-exceeded modes — not worth surfacing.
  }
}

/** GET/POST analyze can return either an in-flight AnalyzeStatus or (idempotent-serve, or POST-while-done) the full Analysis. */
function isAnalysis(value: AnalyzeStatus | Analysis): value is Analysis {
  return "pearls" in value;
}

/** F4 Notation modal state — a shot capture is in flight the moment the modal opens. */
export interface NotationModalState {
  t: number;
  /** Prefilled quote of the active transcript segment at t, if any. Removable, not saved if cleared. */
  quote: string | null;
  /** Title of the concept active at t, if any (F7). Removable, like the quote. */
  conceptTitle: string | null;
  /** V3-A A2: one elaboration prompt chosen per modal-open (not cycling while typing) — see lib/notationPrompts.ts. */
  ghostPrompt: string;
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

/** F11 client-owned session queue — separate from server scheduling state (which stays hidden).
 *  "Again" re-queues the card at the back (SPEC: "repeat this session"); "Got it" removes it. */
export interface ReviewSessionState {
  cards: ReviewCard[];
  /** Distinct cards graded "Got it" so far this session — the progress bar's numerator. */
  clearedCount: number;
  /** Fixed at session start — the progress bar's denominator. */
  total: number;
  revealed: boolean;
  /**
   * V3-B B4 "Lapse-to-context": how many times each card has been graded
   * "Again" THIS session (client-owned, like the queue itself — resets every
   * session, unlike the server's hidden lapses counter). Card kind
   * "again"×2 → inline clip; ×3 → "Open in player" — see lib/lapseTier.ts.
   */
  againCounts: Record<string, number>;
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
  /** Dedupes against an already-open project for the same videoId (search results, up-next clicks); else creates one. */
  openOrCreateYoutubeProject: (videoId: string) => Promise<Project>;
  /** Bypasses innertube.ts's cache and re-persists `related` on the current project. */
  refreshRelated: () => Promise<void>;

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
  /**
   * Phase 2 "Terminology layer v1": TranscriptPane's "correct this term…"
   * affordance — PATCHes the one mapping, then refetches the transcript so
   * the corrected reading applies immediately (read-time rewrite; the raw
   * transcript file itself never changes). A toast reports success/failure,
   * and notes when the project's existing analysis was just marked stale.
   */
  correctTranscriptTerm: (garbled: string, correct: string) => Promise<void>;
  /**
   * Returns `true` on success, `false` on failure (a toast is already pushed
   * either way) — never throws. Callers that must not proceed past a failed
   * save (e.g. CompileFlow's synthesis checkpoint, which would otherwise
   * silently discard the learner's writing — V3-A review finding #1) check
   * the return value; fire-and-forget callers (periodic position autosave)
   * can keep ignoring it via `void`.
   */
  patchCurrentProject: (
    patch: Partial<
      Pick<
        Project,
        | "title"
        | "lastPosition"
        | "watchedUpTo"
        | "lessonSummary"
        | "domain"
        | "noviceMode"
        | "durationSeconds"
        | "conceptRationales"
      >
    >
  ) => Promise<boolean>;
  /** V3-C review fix #6: reports a player-learned duration (loadedmetadata / YT API getDuration()) — no-ops below 0 or once the project's stored durationSeconds already matches (within 1s), so repeated calls from a polling sync loop stay cheap. Fire-and-forget (never awaited by callers). */
  reportLearnedDuration: (seconds: number) => void;

  // --- concepts (F7) ---------------------------------------------------------------
  concepts: ConceptCard[];
  conceptsLoading: boolean;
  conceptTickerMuted: boolean;
  setConceptTickerMuted: (muted: boolean) => void;
  /** PATCHes the project's conceptDoc then loads its parsed concepts. */
  attachConceptDoc: (path: string) => Promise<void>;
  /** Clears the project's conceptDoc and its loaded concepts. */
  detachConceptDoc: () => Promise<void>;

  // --- V3-B B2: attestation + reveal-gating ---------------------------------------
  attestations: AttestationsFile;
  attestationsLoading: boolean;
  /**
   * V3-B review finding #3: a monotonically increasing counter bumped on
   * every LOCAL attestation mutation (attest/edit/dismiss/clear). The
   * initial GET (loadProjectSession/loadAttestations) captures this value
   * before it fires and discards its own result if the counter has since
   * moved — a delayed GET response can never overwrite a newer learner
   * action that already landed (optimistically or confirmed) while it was
   * in flight.
   */
  attestationMutationSeq: number;
  loadAttestations: () => Promise<void>;
  /** Attest ("I've got this") a unit — sets status: "attested". */
  attestUnit: (unitId: string) => Promise<void>;
  /** Saves the learner's "your take" generation attempt without formally attesting — status stays whatever it already was. */
  saveUnitTake: (unitId: string, userTake: string) => Promise<void>;
  /** Edit action: saves a learner-owned body override, layered over the immutable AI body. */
  saveUnitBody: (unitId: string, userBody: string) => Promise<void>;
  /** Dismiss — hides the unit from proposals/review/compile. */
  dismissUnit: (unitId: string) => Promise<void>;
  /** Undo a dismiss (or reset any other status) back to unreviewed. */
  clearUnitAttestation: (unitId: string) => Promise<void>;

  // --- V3-B review finding #7: pearl "Add to review" (PEDAGOGY §5 path (b)) -------
  /** Pearl anchor timestamps (as strings — see server's pearlReviewKey) the learner explicitly added to review. */
  pearlReviewAdds: Set<string>;
  loadPearlReviewAdds: () => Promise<void>;
  addPearlToReview: (t: number) => Promise<void>;

  // --- V3-A A4: right-rail Transcript/Concepts accordion (moved out of RightRail's
  // local state so CCOverlay can read "is the transcript expanded" too — see the
  // CC/transcript redundancy rule below) + concept-chip-strip highlight ------------
  /** The user's persisted accordion choice — independent of A1's purge, which visually forces Transcript closed on top of this. */
  railOpenSection: RailSectionId | null;
  setRailOpenSection: (section: RailSectionId | null) => void;
  /** Set by a concept chip click (A4) — ConceptsDock scrolls to + highlights this card, then clears itself after a few seconds. */
  highlightedConceptId: string | null;
  /** Opens the Concepts rail section, optionally highlighting one card (A4 "expanded + highlighted"). */
  focusConceptInRail: (conceptId?: string) => void;
  clearHighlightedConcept: () => void;

  // --- player + sync engine -------------------------------------------------------
  controller: PlayerHandle | null;
  setController: (c: PlayerHandle | null) => void;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  playbackRate: number;
  setCurrentTime: (t: number) => void;
  setDuration: (d: number) => void;
  /** V3-A A1: also drives the playbackFocus debounce + focusOverride reset on every pause→play transition. */
  setIsPlaying: (p: boolean) => void;
  setPlaybackRate: (r: number) => void;
  volume: number;
  setVolume: (v: number) => void;
  /** Console slice B (mock's `autoPaused`): true while playback is paused by a
   *  hover-pause source (CCOverlay's caption hover) rather than an explicit
   *  user pause — the status-chips row shows "Paused · reading" instead of
   *  the 600ms-delayed manual-pause context chip while this is true. */
  autoPaused: boolean;
  setAutoPaused: (v: boolean) => void;

  // --- V3-A A1: state-aware surface purge -----------------------------------------
  /** True after 1.5s of continuous playback (debounced); false immediately on pause. */
  playbackFocus: boolean;
  /** Set when the user manually expands a rail section or focuses the dock during playback — suspends the purge until the next pause→play transition ("the user always wins"). */
  focusOverride: boolean;
  setFocusOverride: () => void;

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
  /** Console slice B (mock lines 897-911, "mpv grammar: A → B → clear"): one
   *  button/hotkey (L) cycles the loop through set-A → set-B → clear instead
   *  of separate Set A/Set B/Clear controls — see lib/abLoop.ts for the pure
   *  transition table this wraps. */
  cycleAbLoop: () => void;
  /** Console slice 6: condensed playback — the playhead skips stretches with no
   *  concept coverage (PlayerChrome owns the skip logic; this is just the mode). */
  condensedPlayback: boolean;
  toggleCondensedPlayback: () => void;
  /** Console edit mode (SURVEY.md, WoW/ElvUI lineage): every pane materializes
   *  as a labeled, outlined, draggable box — including ones with nothing to
   *  show right now — with grid snapping and per-pane reset. Entering it
   *  turns consoleMode on; only meaningful while the overlay exists. */
  consoleEditMode: boolean;
  toggleConsoleEditMode: () => void;
  /** Console slice 8 scaffold (design/mockups/video-console/BUILD-BRIEF.md): the
   *  pane-engine overlay — off by default. ConsoleLayer renders while this is
   *  true; the "O" hotkey toggles it (see hotkeys.ts). */
  consoleMode: boolean;
  toggleConsoleMode: () => void;
  /** Bumped by resetAllPaneLayouts() so ConsoleLayer can key its panes off
   *  it, forcing them to remount and re-read (now-cleared) storage — panes
   *  otherwise only load their position once, on mount. */
  paneLayoutVersion: number;
  /** Bento button double-click (slice A, mock lines 426-432): forgets every
   *  pane's stored position for the current project and snaps them back to
   *  their defaults. No-ops with no project loaded. */
  resetAllPaneLayouts: () => void;
  /** Console slice B (mock body.focus, lines 59-62): distraction-free framing
   *  around the stage — dims corner buttons/status chips, doesn't touch panes
   *  or the transport itself. F or the transport's focus button toggles it. */
  focusMode: boolean;
  toggleFocusMode: () => void;
  /** Console slice B (mock #keymap, lines 350-360): the centered shortcuts
   *  overlay. `?` toggles, Esc closes (highest priority in the Escape cascade). */
  keymapOpen: boolean;
  toggleKeymap: () => void;
  closeKeymap: () => void;

  // --- Console slice C (mock lines 200-258, 596-658): edge-handle cabinets ------
  /** Which slide-in glass cabinet is open, if any — exclusive (opening one closes any other). */
  openCabinet: CabinetId | null;
  /** Opening pauses nothing (unlike pane hover-pause) — clicking the same handle again closes it. */
  toggleCabinet: (id: CabinetId) => void;
  closeCabinet: () => void;
  /** Watch/Generate/Review modality (mock's setMode, lines 1199-1211) — a class on
   *  .consoleRoot drives the stage-dim/pane-fade/heatmap-recolor choreography per
   *  mode (see StudyView.module.css and each affected component's own CSS module). */
  modality: Modality;
  setModality: (m: Modality) => void;
  /** Session cabinet scaffold slider (0-100, mock default 100 = no blur) — drives
   *  --scaffold-blur on .consoleRoot, which ConceptPane/DrillPane's `.ai`-classed
   *  body text reads (mock line 127: `.ai{filter:blur(var(--scaffold-blur))}`). */
  scaffold: number;
  setScaffold: (v: number) => void;
  /** Session cabinet pressure slider (0-100, mock default 100) — drives --pressure
   *  on .consoleRoot for future ghost-note opacity (mock line 373); wired now,
   *  nothing reads it yet. */
  pressure: number;
  setPressure: (v: number) => void;

  // --- Console slice D: pane engine parity (design/mockups/video-console/index.html
  // lines 1044-1099, "drag-to-park + waiting ticks + undock") ----------------------
  /** One entry per currently-parked, tick-anchored pane — `t` is the concept
   *  anchor its seek-bar tick should pulse `.waiting` at; `conceptId` lets the
   *  owning pane (ConceptPane) recognize "this is MY parked occurrence" vs a
   *  stale key from a since-changed concept. PlayerChrome reads this to mark
   *  the matching tick and wire its click to undockPane. */
  parkedPanes: Record<string, { conceptId: string; t: number }>;
  parkPane: (paneId: string, conceptId: string, t: number) => void;
  /** Clicking a waiting tick (mock's `undockPane`, index.html lines 1102-1110). */
  undockPane: (paneId: string) => void;
  /** Console slice D item 7 "Echo pane timestamp jump": the router only carries
   *  a projectId (lib/router.ts), so a cross-project seek is staged here and
   *  consumed once on the destination StudyView's load — also suppresses that
   *  session's resume prompt (a queued seek IS the resume decision). */
  pendingSeekT: number | null;
  queuePendingSeek: (t: number) => void;
  /** Reads and clears in one step — a second read (e.g. a re-render) must not replay the seek. */
  consumePendingSeek: () => number | null;
  /** Console slice D item 6: SuggestPane's "Keep as note" flashes the status-chips
   *  context line with a custom message (mock's flashCtx, index.html lines
   *  1270-1275) instead of the row's own computed "at T · concept · n notes"
   *  text — auto-clears itself after the same ~2.6s the mock uses. */
  contextFlash: string | null;
  flashContext: (message: string) => void;
  /** Console slice D item 8 "ghost notes": GhostNote reads this to skip
   *  resurfacing a note's text while NotePane's textarea is actively focused —
   *  set by NotePane's own focus/blur handlers. */
  noteEditing: boolean;
  setNoteEditing: (editing: boolean) => void;

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
  /**
   * Returns `true` on success, `false` on failure (a toast is already pushed
   * either way) — never throws. Mirrors patchCurrentProject's boolean
   * pattern (V3-B review finding #4) so callers that must not proceed past a
   * failed save (CompileFlow's caption pass) can check the return value.
   */
  patchBubble: (bubbleId: string, patch: { t?: number; text?: string; shot?: string | null }) => Promise<boolean>;
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
  /** Console slice 4: one-key mining — frame + transcript slice around the playhead, zero dialog. */
  mineMoment: () => Promise<void>;
  /** Console slice 8: the quick-note pane pins free text at an anchor without the modal. */
  pinQuickNote: (t: number, text: string) => Promise<void>;

  // --- F10 compile ------------------------------------------------------------------
  compiling: boolean;
  /** Set once POST /api/projects/:id/compile succeeds; drives the preview modal. */
  compileResult: { path: string; markdown: string } | null;
  runCompile: () => Promise<void>;
  clearCompileResult: () => void;
  /** `path` defaults to the project's exports/ directory when omitted. */
  revealExport: (path?: string) => Promise<void>;

  // --- V2-C analysis engine (pearls & concept breakdown) --------------------------------
  analysis: Analysis | null;
  analyzeStatus: AnalyzeStatus;
  /** Kicks off (or, in fake/demo mode, always allowed without a key) an analyze run.
   *  No API key configured → toast + navigate to Settings, per SPEC. */
  startAnalyze: (force?: boolean) => Promise<void>;
  /** Player-chrome/channel-row "Re-analyze" affordance: confirm, then startAnalyze(true). */
  confirmReanalyze: () => void;
  /** Internal: begins (or restarts) the 1s poll loop against /analyze/status for `projectId`. */
  pollAnalyzeStatus: (projectId: string) => void;

  // --- V2-C / V3-C C5 "Attention heatmap" ----------------------------------------------------
  /** Own-marks layer, bucket density in [0,1] (independently normalized — see PEDAGOGY §7). */
  heatmapOwn: number[];
  /** Overlays layer (all imported bundles combined), independently normalized. */
  heatmapOverlays: number[];
  /** Raw marks behind both layers, for click-to-inspect (see lib/attentionHeatmap.ts). */
  heatmapMarks: { own: HeatmapMark[]; overlays: HeatmapMark[] };
  heatmapDuration: number;
  heatmapBucketCount: number;
  /** Debounced GET /api/projects/:id/heatmap — call after analyze completes or bubbles change. */
  loadHeatmap: () => void;
  /** SPEC C5 "Legend line one-time": shown once ever (localStorage-backed, not per-project). */
  attentionLegendSeen: boolean;
  dismissAttentionLegend: () => void;

  // --- V2-C share bundles / overlays --------------------------------------------------------
  overlays: OverlayMeta[];
  overlaysLoading: boolean;
  overlaysVisible: boolean;
  toggleOverlaysVisible: () => void;
  loadOverlays: () => Promise<void>;
  /** {path} import (SPEC: "multipart or {path}" — the web app only drives the path form). */
  importOverlayByPath: (path: string) => Promise<void>;
  deleteOverlayFile: (fileName: string) => Promise<void>;
  /** V3-C C4 "Overlay diff-on-import": per-row dismissal, keyed `${fileName}:${kind}:${t}` — session-only, not persisted. */
  dismissedOverlayDiffKeys: Set<string>;
  dismissOverlayDiffRow: (fileName: string, mark: { kind: "bubble" | "pearl"; t: number }) => void;

  exportingAnalysis: boolean;
  /** Set once POST /api/projects/:id/export-analysis succeeds; drives the Share preview/modal. */
  shareResult: { path: string; bundle: ShareBundle } | null;
  /** V3-C C6: optional per-concept "why this grouping" text, entered right before export. */
  runExportAnalysis: (conceptRationales?: Record<string, string>) => Promise<void>;
  clearShareResult: () => void;

  // --- V3-C C1 "Concept Continuity rail" -----------------------------------------------------
  continuityCandidates: ContinuityCandidate[];
  continuityLoading: boolean;
  loadContinuity: () => Promise<void>;

  // --- V3-C C2 "Search intent toggles" -------------------------------------------------------
  /** Sticky per session (in-memory only — not persisted across reloads). */
  searchIntent: SearchIntent | null;
  setSearchIntent: (intent: SearchIntent | null) => void;

  // --- F11 review mode --------------------------------------------------------------------
  /** Refreshed on app mount (TopBar badge / home banner) and after every grade — never scheduling internals, just the hidden-mechanics-safe summary. */
  reviewCounts: ReviewQueueCounts | null;
  reviewStreak: ReviewStreak | null;
  /** V3-B B4 "Mastery over streaks": cards locked in (interval ≥30d), across every project — the summary screen's headline number. */
  masteryCount: number | null;
  reviewSession: ReviewSessionState | null;
  reviewSessionLoading: boolean;
  reviewGrading: boolean;
  /** Lightweight refresh of reviewCounts/reviewStreak only (TopBar badge, home banner) — called on app mount. */
  loadReviewCounts: () => Promise<void>;
  /** Full GET /api/review/queue + seeds a client-owned session queue (#/review view). */
  startReviewSession: () => Promise<void>;
  revealCurrentReviewCard: () => void;
  gradeCurrentReviewCard: (grade: ReviewGrade) => Promise<void>;
  /** Clears session state on leaving the Review view — the next visit starts a fresh session. */
  exitReviewSession: () => void;
  /** "Open at timestamp" (SPEC): nudges the project to resume at the card's t, then navigates into the watch view. Best-effort — still navigates even if the PATCH fails. */
  openReviewCardInStudy: (card: ReviewCard) => Promise<void>;
  /** V3-D D4 "improve this card": forces a fresh LLM transform for the current card's back, overwriting its cache entry — requires an API key (same gate as startAnalyze). */
  reviewImproving: boolean;
  improveCurrentReviewCard: () => Promise<void>;

  // --- V3-D D3 "Concept merge queue" ------------------------------------------------------
  /** Loaded app-wide on mount (alongside reviewCounts) so the Concepts rail badge has a count regardless of which project is open. */
  mergeCandidates: MergeCandidate[];
  mergeCandidatesLoading: boolean;
  /** Side-by-side resolve panel open/closed (rail badge toggles this). */
  mergeQueueOpen: boolean;
  setMergeQueueOpen: (open: boolean) => void;
  loadMergeCandidates: () => Promise<void>;
  resolveMergeCandidateAction: (candidateId: string, action: MergeResolveAction) => Promise<void>;
  /** "also in ⟨project⟩" chip source — per-project, loaded alongside attestations in loadProjectSession. */
  mergedConcepts: MergedConceptsResponse;
  loadMergedConcepts: () => Promise<void>;

  // --- toasts -----------------------------------------------------------------------
  toasts: Toast[];
  pushToast: (message: string, kind?: Toast["kind"]) => void;
  dismissToast: (id: string) => void;
  /** Suspends a toast's auto-dismiss timer (ToastHost calls this on
   *  hover/focus) — codex §5 "Pause auto-dismiss while hovered or
   *  keyboard-focused". */
  pauseToastTimer: (id: string) => void;
  resumeToastTimer: (id: string) => void;
}

/**
 * V3-B review finding #3: merges (or deletes, when `entry` is `undefined`) a
 * single unit's entry into an attestations map — never replaces the whole
 * map. This is what lets patchAttestationHelper/clearAttestationHelper apply
 * a server response without clobbering a different unit's concurrently
 * in-flight or already-confirmed change.
 */
function withAttestationEntry(
  map: AttestationsFile,
  unitId: string,
  entry: AttestationsFile[string] | undefined
): AttestationsFile {
  if (entry === undefined) {
    if (!(unitId in map)) return map;
    const next = { ...map };
    delete next[unitId];
    return next;
  }
  return { ...map, [unitId]: entry };
}

/**
 * V3-B review finding #3: concurrent attestation mutations (attest/edit/
 * dismiss fired in quick succession, or a debounced "your take" save landing
 * while a click handler's attest PATCH is still in flight) must reach the
 * server — and apply their response to local state — in the order the
 * learner triggered them, not in whatever order the network happens to
 * settle them. Chained per project id (reset whenever the project changes)
 * so mutations against a different project never queue behind a straggler
 * from the previous one. `fn` is expected to catch its own errors (both
 * patchAttestationHelper and clearAttestationHelper do), so the chain link
 * never has to guard against a broken promise chain.
 */
let attestationChainProjectId: string | null = null;
let attestationChain: Promise<void> = Promise.resolve();
function enqueueAttestationMutation(projectId: string, fn: () => Promise<void>): Promise<void> {
  if (attestationChainProjectId !== projectId) {
    attestationChainProjectId = projectId;
    attestationChain = Promise.resolve();
  }
  const run = attestationChain.then(fn, fn);
  attestationChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/**
 * V3-B B2: shared optimistic-PATCH helper behind attestUnit/saveUnitTake/
 * saveUnitBody/dismissUnit — all four are the same partial-merge shape
 * against one unit's attestations.json entry, differing only in which
 * field(s) they set. Defined at module scope (not inside the `create()`
 * callback) purely to avoid four near-identical inline try/catch blocks;
 * references `useStudyLoopStore` itself for `.setState`, which is safe here
 * because this is only ever invoked from inside a store action (i.e. well
 * after the module has finished initializing `useStudyLoopStore`).
 *
 * V3-B review finding #3 fixes applied here: the optimistic update and the
 * confirmed-response update both merge into just `unitId`'s entry (never
 * replace the whole map — see withAttestationEntry), and every local
 * mutation bumps `attestationMutationSeq` so a stale initial GET elsewhere
 * knows to discard itself instead of overwriting this.
 */
async function patchAttestationHelper(get: () => StudyLoopStore, unitId: string, patch: AttestationPatchBody): Promise<void> {
  const project = get().currentProject;
  if (!project) return;
  const prevEntry = get().attestations[unitId];
  const optimistic = { ...(prevEntry ?? {}), ...patch, at: new Date().toISOString() };
  useStudyLoopStore.setState((state) => ({
    attestations: withAttestationEntry(state.attestations, unitId, optimistic),
    attestationMutationSeq: state.attestationMutationSeq + 1,
  }));
  try {
    const res = await api.patchAttestation(project.id, unitId, patch);
    if (get().currentProject?.id === project.id) {
      useStudyLoopStore.setState((state) => ({
        attestations: withAttestationEntry(state.attestations, unitId, res[unitId]),
      }));
    }
  } catch (err) {
    if (get().currentProject?.id === project.id) {
      useStudyLoopStore.setState((state) => ({
        attestations: withAttestationEntry(state.attestations, unitId, prevEntry),
      }));
    }
    get().pushToast(`Could not update attestation: ${errorMessage(err)}`, "error");
  }
}

/** clearUnitAttestation's own optimistic-DELETE helper — same per-unit-merge + mutation-seq + queueing discipline as patchAttestationHelper above. */
async function clearAttestationHelper(get: () => StudyLoopStore, projectId: string, unitId: string): Promise<void> {
  if (get().currentProject?.id !== projectId) return;
  const prevEntry = get().attestations[unitId];
  useStudyLoopStore.setState((state) => ({
    attestations: withAttestationEntry(state.attestations, unitId, undefined),
    attestationMutationSeq: state.attestationMutationSeq + 1,
  }));
  try {
    const res = await api.clearAttestation(projectId, unitId);
    if (get().currentProject?.id === projectId) {
      useStudyLoopStore.setState((state) => ({
        attestations: withAttestationEntry(state.attestations, unitId, res[unitId]),
      }));
    }
  } catch (err) {
    if (get().currentProject?.id === projectId) {
      useStudyLoopStore.setState((state) => ({
        attestations: withAttestationEntry(state.attestations, unitId, prevEntry),
      }));
    }
    get().pushToast(`Could not update attestation: ${errorMessage(err)}`, "error");
  }
}

export const useStudyLoopStore = create<StudyLoopStore>((set, get) => ({
  // --- routing -------------------------------------------------------------
  route: typeof window !== "undefined" ? parseHash(window.location.hash) : { view: "library" },
  navigate: (route) => {
    if (typeof window === "undefined") {
      // Non-browser environment (unit tests) — no hash to sync, just update the route directly.
      set({ route });
      return;
    }
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
        // V2-B: author drives the channel-row name, related seeds the
        // Up-next cabinet — both resolved by Innertube in the same call
        // above (or [] / undefined via the yt-dlp fallback path).
        author: resolved.author,
        related: resolved.related,
      });
      set((state) => ({ projects: [...state.projects, created] }));
      return created;
    } catch (err) {
      if (!(err instanceof ApiError)) get().pushToast(`Could not add YouTube video: ${errorMessage(err)}`, "error");
      throw err;
    }
  },
  openOrCreateYoutubeProject: async (videoId) => {
    const list = get().projectsLoaded ? get().projects : await get().loadProjects();
    const existing = list.find((p) => p.source.type === "youtube" && p.source.videoId === videoId);
    if (existing) return existing;
    return get().createYoutubeProject(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`);
  },
  refreshRelated: async () => {
    const project = get().currentProject;
    if (!project || project.source.type !== "youtube") return;
    try {
      const updated = await api.refreshRelated(project.id, project.source.videoId);
      set((state) => ({
        currentProject: state.currentProject?.id === updated.id ? updated : state.currentProject,
        projects: state.projects.map((p) => (p.id === updated.id ? updated : p)),
      }));
    } catch (err) {
      get().pushToast(`Could not refresh related videos: ${errorMessage(err)}`, "error");
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
    clearAnalyzePoll();
    clearHeatmapDebounce();
    clearPlaybackFocusTimer();

    set({
      sessionRequestId: requestId,
      currentProjectLoading: true,
      currentProject: null,
      transcriptSegments: [],
      transcriptLoading: false,
      currentTime: 0,
      duration: 0,
      isPlaying: false,
      playbackFocus: false,
      focusOverride: false,
      autoPaused: false,
      // "none" is a genuine persisted choice (both sections collapsed) and
      // must restore to `null` (the runtime "nothing open" state — see
      // setRailOpenSection), not fall through to the "transcript" default
      // that only applies when nothing was ever stored.
      railOpenSection: (() => {
        const stored = loadStoredRailSection(id);
        return stored === "none" ? null : stored ?? "transcript";
      })(),
      highlightedConceptId: null,
      volume: get().volume,
      ccEnabled: false,
      loopA: null,
      loopB: null,
      condensedPlayback: false,
      consoleMode: true, // slice A: every project session starts in the console shell
      consoleEditMode: false,
      focusMode: false,
      keymapOpen: false,
      openCabinet: null,
      modality: "watch",
      scaffold: 100,
      pressure: 100,
      // Console slice D: a stale parked-pane/flash/editing flag from the
      // PREVIOUS project must not bleed into this one. `pendingSeekT`
      // deliberately isn't listed here — a cross-project echo jump sets it
      // right before calling navigate(), and this bulk reset (part of
      // loadProjectSession, which the resulting StudyView mount triggers)
      // must not clobber it before StudyView's own effect gets to
      // consumePendingSeek() it.
      parkedPanes: {},
      contextFlash: null,
      noteEditing: false,
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
      analysis: null,
      analyzeStatus: { state: "idle" },
      heatmapOwn: [],
      heatmapOverlays: [],
      heatmapMarks: { own: [], overlays: [] },
      heatmapDuration: 0,
      heatmapBucketCount: 0,
      overlays: [],
      overlaysLoading: false,
      overlaysVisible: false,
      dismissedOverlayDiffKeys: new Set(),
      exportingAnalysis: false,
      shareResult: null,
      attestations: {},
      attestationsLoading: false,
      attestationMutationSeq: 0,
      pearlReviewAdds: new Set(),
      continuityCandidates: [],
      continuityLoading: false,
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

    // V2-C: an already-analyzed project loads its analysis.json (and, if a
    // run happens to still be in flight from a prior session — e.g. the tab
    // was reloaded mid-run — the status endpoint picks that up too) without
    // requiring the user to click Analyze again. 404 (no analysis yet) is
    // the expected common case, not an error.
    const analysisPromise = (async () => {
      try {
        const status = await api.getAnalyzeStatus(id);
        if (!isCurrent()) return;
        set({ analyzeStatus: status });
        if (status.state === "done") {
          const analysis = await api.getAnalysis(id);
          if (!isCurrent()) return;
          set({ analysis });
        } else if (status.state === "running") {
          get().pollAnalyzeStatus(id);
        }
      } catch (err) {
        if (!isCurrent()) return;
        if (!(err instanceof ApiError) || err.status !== 404) {
          get().pushToast(`Could not load analysis status: ${errorMessage(err)}`, "error");
        }
      }
    })();

    const overlaysPromise = (async () => {
      set({ overlaysLoading: true });
      try {
        const res = await api.listOverlays(id);
        if (!isCurrent()) return;
        set({ overlays: res.overlays, overlaysLoading: false });
      } catch (err) {
        if (!isCurrent()) return;
        set({ overlaysLoading: false });
        get().pushToast(`Could not load overlays: ${errorMessage(err)}`, "error");
      }
    })();

    // V3-B B2: attestations for every unit's reveal-gating/attest state —
    // 404/empty is the common case (no analysis, or v2 analysis) and isn't
    // an error, mirroring analysisPromise's own 404 handling above.
    //
    // V3-B review finding #3: captures the mutation-seq counter before
    // firing the GET; if a local attestation mutation (attest/edit/dismiss)
    // landed while this request was in flight, the response is now stale
    // relative to that action and must be discarded rather than regressing
    // reveal/progress state back to whatever the server had before the
    // mutation's own PATCH (or its optimistic update) took effect.
    const attestationsPromise = (async () => {
      set({ attestationsLoading: true });
      const mutationSeqAtStart = get().attestationMutationSeq;
      try {
        const res = await api.getAttestations(id);
        if (!isCurrent()) return;
        if (get().attestationMutationSeq !== mutationSeqAtStart) {
          set({ attestationsLoading: false });
          return;
        }
        set({ attestations: res, attestationsLoading: false });
      } catch (err) {
        if (!isCurrent()) return;
        set({ attestationsLoading: false });
        get().pushToast(`Could not load attestations: ${errorMessage(err)}`, "error");
      }
    })();

    // V3-B review finding #7: which pearls the learner explicitly added to
    // review (PEDAGOGY §5 path (b)) — loaded alongside attestations since
    // the rail's pearl rows need both to decide whether to show "Add to
    // review". Fails quiet, same reasoning as continuityPromise below (a
    // presentational gating hint, not something worth toasting on failure).
    const pearlReviewAddsPromise = (async () => {
      try {
        const res = await api.getPearlReviewAdds(id);
        if (!isCurrent()) return;
        set({ pearlReviewAdds: new Set(res.added) });
      } catch {
        // leave pearlReviewAdds at its reset-time empty Set()
      }
    })();

    // V3-C C1: fetched eagerly alongside the rest of the session (not lazily
    // on rail mount) so the Continuity cabinet has data the moment the Study
    // view renders, same as Up-next's `project.related` used to before this
    // rail replaced it. Fails quiet — see loadContinuity's own catch.
    const continuityPromise = (async () => {
      set({ continuityLoading: true });
      try {
        const res = await api.getContinuity(id);
        if (!isCurrent()) return;
        set({ continuityCandidates: res.candidates, continuityLoading: false });
      } catch {
        if (!isCurrent()) return;
        set({ continuityLoading: false });
      }
    })();

    // V3-D D3: "also in ⟨project⟩" chip source — presentational, fails quiet.
    const mergedConceptsPromise = (async () => {
      try {
        const res = await api.getMergedConcepts(id);
        if (!isCurrent()) return;
        set({ mergedConcepts: res });
      } catch {
        // ignore — chip just won't show for this session
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

    await Promise.all([
      bubblesPromise,
      notesPromise,
      conceptsPromise,
      analysisPromise,
      overlaysPromise,
      attestationsPromise,
      pearlReviewAddsPromise,
      continuityPromise,
      mergedConceptsPromise,
    ]);
  },
  clearProjectSession: () => {
    clearPendingNotesSave();
    clearAnalyzePoll();
    clearHeatmapDebounce();
    clearPlaybackFocusTimer();
    set((state) => ({
      sessionRequestId: state.sessionRequestId + 1,
      currentProject: null,
      transcriptSegments: [],
      controller: null,
      currentTime: 0,
      duration: 0,
      isPlaying: false,
      playbackFocus: false,
      focusOverride: false,
      autoPaused: false,
      railOpenSection: null,
      highlightedConceptId: null,
      ccEnabled: false,
      loopA: null,
      loopB: null,
      condensedPlayback: false,
      consoleMode: true, // slice A: leaves session state ready for the next project load
      consoleEditMode: false,
      focusMode: false,
      keymapOpen: false,
      openCabinet: null,
      modality: "watch",
      scaffold: 100,
      pressure: 100,
      // Console slice D: same exclusion as loadProjectSession's own reset —
      // see its comment. `pendingSeekT` stays out on purpose.
      parkedPanes: {},
      contextFlash: null,
      noteEditing: false,
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
      analysis: null,
      analyzeStatus: { state: "idle" },
      heatmapOwn: [],
      heatmapOverlays: [],
      heatmapMarks: { own: [], overlays: [] },
      heatmapDuration: 0,
      heatmapBucketCount: 0,
      overlays: [],
      overlaysLoading: false,
      overlaysVisible: false,
      dismissedOverlayDiffKeys: new Set(),
      exportingAnalysis: false,
      shareResult: null,
      attestations: {},
      attestationsLoading: false,
      attestationMutationSeq: 0,
      pearlReviewAdds: new Set(),
      continuityCandidates: [],
      continuityLoading: false,
    }));
  },
  correctTranscriptTerm: async (garbled, correct) => {
    const project = get().currentProject;
    if (!project || project.transcript.type !== "file") return;
    try {
      const res = await api.patchTerms(project.id, { upsert: { [garbled]: correct } });
      // Refetch (not a local rewrite) — the server is the source of truth
      // for how corrections apply (case/word-boundary/longest-match, plus
      // any glossary defaults merged in), same as every other "save then
      // reload" flow in this store.
      if (project.transcript.type === "file") {
        const transcript = await api.getTranscript(project.transcript.path, project.id);
        if (get().currentProject?.id === project.id) {
          set({ transcriptSegments: transcript.segments });
        }
      }
      get().pushToast(
        res.analysisMarkedStale
          ? `Corrected "${garbled}" → "${correct}" — existing analysis is now stale.`
          : `Corrected "${garbled}" → "${correct}".`
      );
    } catch (err) {
      get().pushToast(`Could not save term correction: ${errorMessage(err)}`, "error");
    }
  },
  patchCurrentProject: async (patch) => {
    const project = get().currentProject;
    if (!project) return false;
    try {
      const updated = await api.patchProject(project.id, patch);
      set((state) => ({
        currentProject: state.currentProject?.id === updated.id ? updated : state.currentProject,
        projects: state.projects.map((p) => (p.id === updated.id ? updated : p)),
      }));
      return true;
    } catch (err) {
      get().pushToast(`Could not save progress: ${errorMessage(err)}`, "error");
      return false;
    }
  },
  reportLearnedDuration: (seconds) => {
    const project = get().currentProject;
    if (!project || !Number.isFinite(seconds) || seconds <= 0) return;
    const rounded = Math.round(seconds);
    // Already stored (within a second — floating-point/rounding noise
    // shouldn't fire a PATCH every tick of a sync loop that keeps re-reading
    // the same known duration).
    if (project.durationSeconds != null && Math.abs(project.durationSeconds - rounded) < 1) return;
    void get().patchCurrentProject({ durationSeconds: rounded });
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

  // --- V3-B B2: attestation + reveal-gating ---------------------------------------
  attestations: {},
  attestationsLoading: false,
  attestationMutationSeq: 0,
  loadAttestations: async () => {
    const project = get().currentProject;
    if (!project) return;
    const projectId = project.id;
    set({ attestationsLoading: true });
    // V3-B review finding #3: same stale-GET discard as loadProjectSession's
    // attestationsPromise — see withAttestationEntry/enqueueAttestationMutation's
    // doc comments above for the full race this guards against.
    const mutationSeqAtStart = get().attestationMutationSeq;
    try {
      const res = await api.getAttestations(projectId);
      if (get().currentProject?.id !== projectId) return;
      if (get().attestationMutationSeq !== mutationSeqAtStart) {
        set({ attestationsLoading: false });
        return;
      }
      set({ attestations: res, attestationsLoading: false });
    } catch (err) {
      if (get().currentProject?.id !== projectId) return;
      set({ attestationsLoading: false });
      get().pushToast(`Could not load attestations: ${errorMessage(err)}`, "error");
    }
  },
  attestUnit: async (unitId) => {
    const project = get().currentProject;
    if (!project) return;
    await enqueueAttestationMutation(project.id, () => patchAttestationHelper(get, unitId, { status: "attested" }));
  },
  saveUnitTake: async (unitId, userTake) => {
    const project = get().currentProject;
    if (!project) return;
    await enqueueAttestationMutation(project.id, () => patchAttestationHelper(get, unitId, { userTake }));
  },
  saveUnitBody: async (unitId, userBody) => {
    const project = get().currentProject;
    if (!project) return;
    await enqueueAttestationMutation(project.id, () => patchAttestationHelper(get, unitId, { userBody }));
  },
  dismissUnit: async (unitId) => {
    const project = get().currentProject;
    if (!project) return;
    await enqueueAttestationMutation(project.id, () => patchAttestationHelper(get, unitId, { status: "dismissed" }));
  },
  clearUnitAttestation: async (unitId) => {
    const project = get().currentProject;
    if (!project) return;
    await enqueueAttestationMutation(project.id, () => clearAttestationHelper(get, project.id, unitId));
  },

  // --- V3-B review finding #7: pearl "Add to review" -------------------------------
  pearlReviewAdds: new Set(),
  loadPearlReviewAdds: async () => {
    const project = get().currentProject;
    if (!project) return;
    const projectId = project.id;
    try {
      const res = await api.getPearlReviewAdds(projectId);
      if (get().currentProject?.id !== projectId) return;
      set({ pearlReviewAdds: new Set(res.added) });
    } catch {
      // presentational gating hint — fail quiet, matches loadContinuity's own reasoning
    }
  },
  addPearlToReview: async (t) => {
    const project = get().currentProject;
    if (!project) return;
    const projectId = project.id;
    const key = String(t);
    const prev = get().pearlReviewAdds;
    if (prev.has(key)) return; // already added — the rail hides the button once added, but guard anyway
    set({ pearlReviewAdds: new Set(prev).add(key) });
    try {
      const res = await api.addPearlToReview(projectId, t);
      if (get().currentProject?.id === projectId) set({ pearlReviewAdds: new Set(res.added) });
    } catch (err) {
      if (get().currentProject?.id === projectId) set({ pearlReviewAdds: prev });
      get().pushToast(`Could not add to review: ${errorMessage(err)}`, "error");
    }
  },

  // --- V3-A A4: rail accordion + concept-chip-strip highlight ---------------------
  railOpenSection: null,
  setRailOpenSection: (section) => {
    const projectId = get().currentProject?.id;
    if (projectId) storeRailSection(projectId, section);
    set({ railOpenSection: section });
  },
  highlightedConceptId: null,
  focusConceptInRail: (conceptId) => {
    const projectId = get().currentProject?.id;
    if (projectId) storeRailSection(projectId, "concepts");
    set({ railOpenSection: "concepts", highlightedConceptId: conceptId ?? null });
  },
  clearHighlightedConcept: () => set({ highlightedConceptId: null }),

  // --- player + sync engine -------------------------------------------------------
  controller: null,
  setController: (c) => set({ controller: c }),
  currentTime: 0,
  duration: 0,
  isPlaying: false,
  playbackRate: 1,
  setCurrentTime: (t) => set({ currentTime: t }),
  setDuration: (d) => set({ duration: d }),
  setIsPlaying: (p) => {
    const wasPlaying = get().isPlaying;
    set({ isPlaying: p });
    if (p) {
      if (!wasPlaying) {
        // A fresh pause→play transition — "the user always wins" only for the
        // stretch of playback that earned it; the next one starts clean and
        // gets its own 1.5s grace before the purge (re-)engages.
        clearPlaybackFocusTimer();
        set({ focusOverride: false });
        playbackFocusTimer = setTimeout(() => {
          playbackFocusTimer = null;
          if (get().isPlaying) set({ playbackFocus: true });
        }, PLAYBACK_FOCUS_DEBOUNCE_MS);
      }
      // else: already playing (e.g. a redundant setIsPlaying(true)) — leave
      // any in-flight debounce/override alone rather than restarting it, so
      // brief scrubbing-adjacent play events don't flicker the purge.
    } else {
      clearPlaybackFocusTimer();
      set({ playbackFocus: false });
    }
  },
  setPlaybackRate: (r) => set({ playbackRate: clampRate(r) }),
  volume: 1,
  setVolume: (v) => set({ volume: clampVolume(v) }),
  autoPaused: false,
  setAutoPaused: (v) => set({ autoPaused: v }),

  // --- V3-A A1: state-aware surface purge ------------------------------------------
  playbackFocus: false,
  focusOverride: false,
  setFocusOverride: () => set({ focusOverride: true }),

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
  cycleAbLoop: () => {
    const state = get();
    if (!state.controller) return;
    const t = state.controller.getCurrentTime();
    switch (nextAbLoopAction(state.loopA, state.loopB)) {
      case "setA":
        state.setLoopA(t);
        break;
      case "setB":
        state.setLoopB(t);
        break;
      case "clear":
        state.clearLoop();
        break;
    }
  },
  condensedPlayback: false,
  toggleCondensedPlayback: () => {
    const next = !get().condensedPlayback;
    set({ condensedPlayback: next });
    get().pushToast(
      next ? "Condensed playback — skipping stretches with no concepts" : "Condensed playback off",
      "info"
    );
  },
  // Slice A: the console is the study page's shell now, not an opt-in
  // overlay — every project session starts with it on (see the two session
  // reset blocks above/below, which also default it to true).
  consoleMode: true,
  toggleConsoleMode: () => {
    const next = !get().consoleMode;
    // Leaving console mode always leaves edit mode with it.
    set({ consoleMode: next, consoleEditMode: next ? get().consoleEditMode : false });
    get().pushToast(
      next ? "Console overlay on — drag the pane; O toggles" : "Console overlay off",
      "info"
    );
  },
  consoleEditMode: false,
  toggleConsoleEditMode: () => {
    const next = !get().consoleEditMode;
    // Entering edit mode deliberately implies the overlay itself (WoW's Edit
    // Mode is entered from a menu, not stumbled into — E is our menu).
    set({ consoleEditMode: next, consoleMode: next ? true : get().consoleMode });
    get().pushToast(
      next ? "Edit layout — drag panes, positions snap to the grid; E or Esc exits" : "Edit layout off",
      "info"
    );
  },
  paneLayoutVersion: 0,
  resetAllPaneLayouts: () => {
    const projectId = get().currentProject?.id;
    if (!projectId) return;
    clearStoredPaneLayouts(projectId);
    set((state) => ({ paneLayoutVersion: state.paneLayoutVersion + 1 }));
    get().pushToast("Pane layout reset", "info");
  },
  focusMode: false,
  toggleFocusMode: () => set((state) => ({ focusMode: !state.focusMode })),
  keymapOpen: false,
  toggleKeymap: () => set((state) => ({ keymapOpen: !state.keymapOpen })),
  closeKeymap: () => set({ keymapOpen: false }),

  // --- Console slice C: edge-handle cabinets ---------------------------------------
  openCabinet: null,
  toggleCabinet: (id) => set((state) => ({ openCabinet: state.openCabinet === id ? null : id })),
  closeCabinet: () => set({ openCabinet: null }),
  modality: "watch",
  setModality: (m) => {
    if (get().modality === m) return;
    set({ modality: m });
    // Mock line 1204: entering Generate pauses playback (the console dims to
    // spotlight the self-test surface — a later slice's #p-test) — the video
    // doesn't keep playing under a dimmed, un-attended stage.
    if (m === "generate" && get().isPlaying) get().controller?.pause();
  },
  scaffold: 100,
  setScaffold: (v) => set({ scaffold: Math.min(100, Math.max(0, v)) }),
  pressure: 100,
  setPressure: (v) => set({ pressure: Math.min(100, Math.max(0, v)) }),

  // --- Console slice D: pane engine parity -----------------------------------------
  parkedPanes: {},
  parkPane: (paneId, conceptId, t) => set((state) => ({ parkedPanes: { ...state.parkedPanes, [paneId]: { conceptId, t } } })),
  undockPane: (paneId) =>
    set((state) => {
      const next = { ...state.parkedPanes };
      delete next[paneId];
      return { parkedPanes: next };
    }),
  pendingSeekT: null,
  queuePendingSeek: (t) => set({ pendingSeekT: t }),
  consumePendingSeek: () => {
    const t = get().pendingSeekT;
    if (t != null) set({ pendingSeekT: null });
    return t;
  },
  contextFlash: null,
  flashContext: (message) => {
    if (contextFlashTimer) clearTimeout(contextFlashTimer);
    set({ contextFlash: message });
    contextFlashTimer = setTimeout(() => {
      contextFlashTimer = null;
      set({ contextFlash: null });
    }, CONTEXT_FLASH_MS);
  },
  noteEditing: false,
  setNoteEditing: (editing) => set({ noteEditing: editing }),

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
    if (!project) return false;
    // V3-B review finding #4: snapshot only THIS bubble's prior state, not
    // the whole array — a whole-array snapshot rollback races a concurrent
    // patchBubble call against a DIFFERENT bubble: if that other call's
    // optimistic update (or confirmed response) landed on `bubbles` between
    // this snapshot and this call's own failure, restoring the whole
    // snapshot on failure would silently erase the other bubble's
    // already-succeeded change. Per-bubble rollback below can't do that.
    const prevBubble = get().bubbles.find((b) => b.id === bubbleId);
    if (!prevBubble) return false;
    set((state) => ({ bubbles: sortBubbles(state.bubbles.map((b) => (b.id === bubbleId ? { ...b, ...patch } : b))) }));
    try {
      const updated = await api.patchBubble(project.id, bubbleId, patch);
      set((state) => ({ bubbles: sortBubbles(state.bubbles.map((b) => (b.id === bubbleId ? updated : b))) }));
      return true;
    } catch (err) {
      set((state) => ({ bubbles: sortBubbles(state.bubbles.map((b) => (b.id === bubbleId ? prevBubble : b))) }));
      get().pushToast(`Could not update capture: ${errorMessage(err)}`, "error");
      return false;
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
    // V3-A A2: one elaboration prompt per modal-open — chosen here, not
    // re-rolled on every render, so it doesn't cycle while the learner types.
    // V3-D D1: domain-routed pool (history/music/physical_skill/biology) when
    // the project has an editable domain tag; generic pool otherwise.
    const ghostPrompt = pickPrompt(promptPoolFor(project.domain));

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
          ghostPrompt,
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
        ghostPrompt,
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
    const anchorT = get().notationModal?.t ?? null;
    set((state) => ({ notationGeneration: state.notationGeneration + 1, notationModal: null }));
    // Console slice 3 "note-rewind" (SURVEY.md, Frame.io choreography): resume
    // 3s before the note's anchor so the moment that prompted it replays.
    const controller = get().controller;
    if (controller) {
      if (anchorT != null) controller.seek(Math.max(0, anchorT - 3));
      controller.play();
    }
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
      // Console slice 3 "note-rewind": resume 3s before the anchor (see cancelNotation).
      const controller = get().controller;
      if (controller) {
        controller.seek(Math.max(0, modal.t - 3));
        controller.play();
      }
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

  // --- Console slice 4: one-key mining (SURVEY.md, asbplayer's dialogless capture) ------
  mineMoment: async () => {
    const controller = get().controller;
    const project = get().currentProject;
    if (!controller || !project) return;
    const t = controller.getCurrentTime();
    const text = buildMinedText(get().transcriptSegments, t, get().duration);
    // Playback never stops and no dialog opens — the whole point. The frame
    // grab respects the ffmpeg health gate; without it the capture still
    // lands, just without an image (degrade visibly, never silently skip).
    try {
      let shot: string | null = null;
      if (get().health?.ffmpeg !== false) {
        const res = await api.captureShot(project.id, t);
        shot = res.shot ?? null;
      }
      const bubble = await api.createBubble(project.id, { t, text, shot });
      set((state) => ({ bubbles: sortBubbles([...state.bubbles, bubble]) }));
      get().pushToast(`Mined ${formatTimestamp(t)} — frame + transcript slice`, "success");
    } catch (err) {
      get().pushToast(`Could not mine: ${errorMessage(err)}`, "error");
    }
  },

  // --- Console slice 8: quick-note pane (design/mockups/video-console/BUILD-BRIEF.md) --
  pinQuickNote: async (t, text) => {
    const project = get().currentProject;
    if (!project) return;
    try {
      const bubble = await api.createBubble(project.id, { t, text, shot: null });
      set((state) => ({ bubbles: sortBubbles([...state.bubbles, bubble]) }));
      get().pushToast(`Note pinned at ${formatTimestamp(t)}`, "success");
    } catch (err) {
      get().pushToast(`Could not pin note: ${errorMessage(err)}`, "error");
      throw err;
    }
  },

  // --- F10 compile --------------------------------------------------------------------
  compiling: false,
  compileResult: null,
  runCompile: async () => {
    const project = get().currentProject;
    // V3-A review finding #5: a duplicate invocation (e.g. Escape re-firing
    // a modal's onClose during CompileFlow's synthesis→caption→compile
    // handoff) must no-op rather than issuing a second POST /compile.
    if (!project || get().compiling) return;
    // V3-B review finding #5: tag this call with the session it started in —
    // if the learner navigates to a different project (or back to the
    // library and into a third one) before POST /compile resolves, the
    // sessionRequestId counter (bumped by loadProjectSession/
    // clearProjectSession on every navigation) will have moved on, and this
    // stale result must never surface project A's compiled doc inside
    // project B's Study view.
    const requestId = get().sessionRequestId;
    const isCurrent = () => get().sessionRequestId === requestId;
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
      // `compiling` is reset unconditionally (it's a global in-flight flag,
      // not scoped per session — leaving it stuck at `true` would permanently
      // block the NEW session's own Compile button behind the top-of-function
      // guard above); only the result/toast are skipped when stale.
      set({ compiling: false });
      if (!isCurrent()) return;
      set({ compileResult: result });
      get().pushToast("Compiled study document", "success");
    } catch (err) {
      set({ compiling: false });
      if (!isCurrent()) return;
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

  // --- V2-C analysis engine ---------------------------------------------------------------
  analysis: null,
  analyzeStatus: { state: "idle" },
  startAnalyze: async (force) => {
    const project = get().currentProject;
    if (!project) return;
    // No key configured → toast + open Settings (SPEC), unless the config
    // hasn't loaded yet — in that case load it first rather than guessing.
    const config = get().config ?? (await get().loadConfig());
    if (!config) return; // loadConfig already toasted its own failure
    if (!llmConfigured(config)) {
      get().pushToast("Add an API key for your AI provider in Settings to use Analyze", "info");
      get().navigate({ view: "settings" });
      return;
    }
    const projectId = project.id;
    set({ analyzeStatus: { state: "running", pct: 0 } });
    try {
      const result = await api.analyze(projectId, force);
      if (get().currentProject?.id !== projectId) return; // navigated away mid-request
      if (isAnalysis(result)) {
        // Idempotent path: analysis.json already existed and force wasn't set.
        set({ analysis: result, analyzeStatus: { state: "done" } });
        get().loadHeatmap();
        return;
      }
      set({ analyzeStatus: result });
      if (result.state === "running") get().pollAnalyzeStatus(projectId);
    } catch (err) {
      if (get().currentProject?.id !== projectId) return;
      if (err instanceof ApiError && err.status === 409) {
        // Another POST already started a run (e.g. a second tab) — just
        // start polling instead of surfacing this as a failure.
        set({ analyzeStatus: { state: "running", pct: 0 } });
        get().pollAnalyzeStatus(projectId);
        return;
      }
      set({ analyzeStatus: { state: "error", message: errorMessage(err) } });
      get().pushToast(`Could not start analysis: ${errorMessage(err)}`, "error");
    }
  },
  confirmReanalyze: () => {
    if (typeof window !== "undefined" && !window.confirm("Re-analyze this video? This replaces the existing analysis.")) {
      return;
    }
    void get().startAnalyze(true);
  },
  pollAnalyzeStatus: (projectId) => {
    clearAnalyzePoll();
    analyzePollTimer = setInterval(() => {
      if (get().currentProject?.id !== projectId) {
        clearAnalyzePoll();
        return;
      }
      void (async () => {
        try {
          const status = await api.getAnalyzeStatus(projectId);
          if (get().currentProject?.id !== projectId) {
            clearAnalyzePoll();
            return;
          }
          set({ analyzeStatus: status });
          if (status.state === "done") {
            clearAnalyzePoll();
            try {
              const analysis = await api.getAnalysis(projectId);
              if (get().currentProject?.id !== projectId) return;
              set({ analysis });
              get().pushToast("Analysis complete", "success");
              get().loadHeatmap();
            } catch (err) {
              get().pushToast(`Analysis finished but could not be loaded: ${errorMessage(err)}`, "error");
            }
          } else if (status.state === "error") {
            clearAnalyzePoll();
            get().pushToast(`Analysis failed: ${status.message}`, "error");
          }
        } catch {
          // Transient poll failure (e.g. a dropped request) — retry on the next tick.
        }
      })();
    }, ANALYZE_POLL_INTERVAL_MS);
  },

  // --- V2-C / V3-C C5 "Attention heatmap" ----------------------------------------------------
  heatmapOwn: [],
  heatmapOverlays: [],
  heatmapMarks: { own: [], overlays: [] },
  heatmapDuration: 0,
  heatmapBucketCount: 0,
  loadHeatmap: () => {
    const project = get().currentProject;
    if (!project) return;
    const projectId = project.id;
    clearHeatmapDebounce();
    heatmapDebounceTimer = setTimeout(() => {
      heatmapDebounceTimer = null;
      void api
        .getHeatmap(projectId)
        .then((res) => {
          if (get().currentProject?.id !== projectId) return;
          set({
            heatmapOwn: res.own,
            heatmapOverlays: res.overlays,
            heatmapMarks: res.marks,
            heatmapDuration: res.duration,
            heatmapBucketCount: res.bucketCount,
          });
        })
        .catch(() => {
          // Heatmap is presentational only — fail quiet rather than toast on every change.
        });
    }, HEATMAP_DEBOUNCE_MS);
  },
  attentionLegendSeen: hasSeenAttentionLegend(),
  dismissAttentionLegend: () => {
    markAttentionLegendSeen();
    set({ attentionLegendSeen: true });
  },

  // --- V2-C share bundles / overlays --------------------------------------------------------
  overlays: [],
  overlaysLoading: false,
  overlaysVisible: false,
  toggleOverlaysVisible: () => set((state) => ({ overlaysVisible: !state.overlaysVisible })),
  dismissedOverlayDiffKeys: new Set(),
  dismissOverlayDiffRow: (fileName, mark) =>
    set((state) => {
      const next = new Set(state.dismissedOverlayDiffKeys);
      next.add(`${fileName}:${mark.kind}:${mark.t}`);
      return { dismissedOverlayDiffKeys: next };
    }),
  loadOverlays: async () => {
    const project = get().currentProject;
    if (!project) return;
    const projectId = project.id;
    set({ overlaysLoading: true });
    try {
      const res = await api.listOverlays(projectId);
      if (get().currentProject?.id !== projectId) return;
      set({ overlays: res.overlays, overlaysLoading: false });
    } catch (err) {
      if (get().currentProject?.id !== projectId) return;
      set({ overlaysLoading: false });
      get().pushToast(`Could not load overlays: ${errorMessage(err)}`, "error");
    }
  },
  importOverlayByPath: async (path) => {
    const project = get().currentProject;
    if (!project) return;
    try {
      const res = await api.importAnalysisByPath(project.id, path);
      await get().loadOverlays();
      get().loadHeatmap();
      set({ overlaysVisible: true });
      if (res.sourceMismatch) {
        get().pushToast(`Imported — but ${res.sourceMismatch}`, "info");
      } else {
        get().pushToast(`Imported ${res.bundle.shareHandle}'s analysis`, "success");
      }
    } catch (err) {
      get().pushToast(`Could not import analysis: ${errorMessage(err)}`, "error");
      throw err;
    }
  },
  deleteOverlayFile: async (fileName) => {
    const project = get().currentProject;
    if (!project) return;
    const prev = get().overlays;
    set({ overlays: prev.filter((o) => o.fileName !== fileName) });
    try {
      await api.deleteOverlay(project.id, fileName);
      get().loadHeatmap();
    } catch (err) {
      set({ overlays: prev });
      get().pushToast(`Could not remove overlay: ${errorMessage(err)}`, "error");
    }
  },

  exportingAnalysis: false,
  shareResult: null,
  runExportAnalysis: async (conceptRationales) => {
    const project = get().currentProject;
    if (!project) return;
    // V3-B review finding #5: same stale-session guard as runCompile — a
    // Share started in project A must never surface its result modal after
    // the learner has navigated into project B.
    const requestId = get().sessionRequestId;
    const isCurrent = () => get().sessionRequestId === requestId;
    set({ exportingAnalysis: true });
    try {
      const result = await api.exportAnalysis(project.id, conceptRationales);
      set({ exportingAnalysis: false });
      if (!isCurrent()) return;
      set({ shareResult: result });
      get().pushToast("Exported analysis bundle", "success");
    } catch (err) {
      set({ exportingAnalysis: false });
      if (!isCurrent()) return;
      get().pushToast(`Could not export analysis: ${errorMessage(err)}`, "error");
    }
  },
  clearShareResult: () => set({ shareResult: null }),

  // --- F11 review mode --------------------------------------------------------------------
  reviewCounts: null,
  reviewStreak: null,
  masteryCount: null,
  reviewSession: null,
  reviewSessionLoading: false,
  reviewGrading: false,
  loadReviewCounts: async () => {
    try {
      const res = await api.getReviewQueue();
      set({ reviewCounts: res.counts, reviewStreak: res.streak, masteryCount: res.masteryCount });
    } catch {
      // Non-critical: the badge/banner just won't show a count. No toast —
      // this can run on every app mount and shouldn't greet the user with
      // an error (mirrors loadHealth's reasoning).
    }
  },
  startReviewSession: async () => {
    set({ reviewSessionLoading: true, reviewSession: null });
    try {
      const res = await api.getReviewQueue();
      set({
        reviewSessionLoading: false,
        reviewCounts: res.counts,
        reviewStreak: res.streak,
        masteryCount: res.masteryCount,
        reviewSession: { cards: res.due, clearedCount: 0, total: res.due.length, revealed: false, againCounts: {} },
      });
    } catch (err) {
      set({ reviewSessionLoading: false });
      get().pushToast(`Could not load review queue: ${errorMessage(err)}`, "error");
    }
  },
  revealCurrentReviewCard: () =>
    set((state) => (state.reviewSession ? { reviewSession: { ...state.reviewSession, revealed: true } } : {})),
  gradeCurrentReviewCard: async (grade) => {
    const session = get().reviewSession;
    if (!session || session.cards.length === 0 || get().reviewGrading) return;
    const current = session.cards[0];
    set({ reviewGrading: true });
    try {
      const res = await api.gradeReviewCard(current.id, grade);
      set((state) => {
        if (!state.reviewSession) {
          return { reviewGrading: false, reviewCounts: res.counts, reviewStreak: res.streak, masteryCount: res.masteryCount };
        }
        const [, ...rest] = state.reviewSession.cards;
        // "Again" resurfaces the card later this same session (hidden
        // mechanics: interval resets to 0 server-side, but the *ordering*
        // within a session is a client-side concern); "Got it" clears it.
        const nextCards = grade === "again" ? [...rest, current] : rest;
        const clearedCount =
          grade === "good" ? state.reviewSession.clearedCount + 1 : state.reviewSession.clearedCount;
        // V3-B B4 "Lapse-to-context": bump this card's in-session Again
        // count — read by ReviewView via lib/lapseTier.ts to escalate the
        // media action on its next appearance (clip at ×2, player at ×3).
        const againCounts =
          grade === "again"
            ? { ...state.reviewSession.againCounts, [current.id]: (state.reviewSession.againCounts[current.id] ?? 0) + 1 }
            : state.reviewSession.againCounts;
        return {
          reviewGrading: false,
          reviewCounts: res.counts,
          reviewStreak: res.streak,
          masteryCount: res.masteryCount,
          reviewSession: { ...state.reviewSession, cards: nextCards, clearedCount, revealed: false, againCounts },
        };
      });
    } catch (err) {
      set({ reviewGrading: false });
      get().pushToast(`Could not save review grade: ${errorMessage(err)}`, "error");
    }
  },
  exitReviewSession: () => set({ reviewSession: null, reviewSessionLoading: false }),
  openReviewCardInStudy: async (card) => {
    try {
      await api.patchProject(card.projectId, { lastPosition: card.t });
    } catch {
      // Best-effort nudge — still navigate to the project even if this fails
      // (the user can scrub to the timestamp manually).
    }
    get().navigate({ view: "study", projectId: card.projectId });
  },

  // --- V3-D D4 "improve this card" -------------------------------------------------------
  reviewImproving: false,
  improveCurrentReviewCard: async () => {
    const session = get().reviewSession;
    if (!session || session.cards.length === 0 || get().reviewImproving) return;
    // Same gate as startAnalyze: no key configured -> toast + open Settings.
    const config = get().config ?? (await get().loadConfig());
    if (!config) return;
    if (!llmConfigured(config)) {
      get().pushToast("Add an API key for your AI provider in Settings to improve cards", "info");
      get().navigate({ view: "settings" });
      return;
    }
    const current = session.cards[0];
    set({ reviewImproving: true });
    try {
      const res = await api.improveReviewCard(current.id);
      set({ reviewImproving: false });
      if (!res.transformed) {
        get().pushToast("Could not improve this card", "error");
        return;
      }
      const transformed = res.transformed;
      set((state) =>
        state.reviewSession
          ? { reviewSession: { ...state.reviewSession, cards: state.reviewSession.cards.map((c) => (c.id === current.id ? { ...c, transformed } : c)) } }
          : {}
      );
      get().pushToast("Card improved", "success");
    } catch (err) {
      set({ reviewImproving: false });
      get().pushToast(`Could not improve card: ${errorMessage(err)}`, "error");
    }
  },

  // --- V3-D D3 "Concept merge queue" -----------------------------------------------------
  mergeCandidates: [],
  mergeCandidatesLoading: false,
  mergeQueueOpen: false,
  setMergeQueueOpen: (open) => set({ mergeQueueOpen: open }),
  loadMergeCandidates: async () => {
    set({ mergeCandidatesLoading: true });
    try {
      const res = await api.getMergeCandidates();
      set({ mergeCandidates: res.candidates, mergeCandidatesLoading: false });
    } catch {
      // Badge/panel data — fail quiet (same reasoning as loadReviewCounts): a
      // failed background poll shouldn't greet the user with an error toast.
      set({ mergeCandidatesLoading: false });
    }
  },
  resolveMergeCandidateAction: async (candidateId, action) => {
    // Optimistic removal — the panel shouldn't wait on a round trip to stop
    // showing a decision the learner just made.
    const prev = get().mergeCandidates;
    set({ mergeCandidates: prev.filter((c) => c.id !== candidateId) });
    try {
      await api.resolveMergeCandidate(candidateId, action);
      // Refresh merged-concepts chips for the current project (no-op if none
      // is open) — a "merge"/"link" resolve may have just made one of its
      // units span another project for the first time.
      void get().loadMergedConcepts();
    } catch (err) {
      set({ mergeCandidates: prev });
      get().pushToast(`Could not resolve this merge: ${errorMessage(err)}`, "error");
    }
  },
  mergedConcepts: {},
  loadMergedConcepts: async () => {
    const project = get().currentProject;
    if (!project) return;
    const projectId = project.id;
    try {
      const res = await api.getMergedConcepts(projectId);
      if (get().currentProject?.id !== projectId) return; // navigated away mid-request
      set({ mergedConcepts: res });
    } catch {
      // presentational chip data — fail quiet, same as loadContinuity
    }
  },

  // --- V3-C C1 "Concept Continuity rail" -----------------------------------------------------
  continuityCandidates: [],
  continuityLoading: false,
  loadContinuity: async () => {
    const project = get().currentProject;
    if (!project) return;
    const projectId = project.id;
    set({ continuityLoading: true });
    try {
      const res = await api.getContinuity(projectId);
      if (get().currentProject?.id !== projectId) return; // navigated away mid-request
      set({ continuityCandidates: res.candidates, continuityLoading: false });
    } catch {
      // Presentational rail data — fail quiet (matches loadHeatmap/loadOverlays'
      // reasoning) rather than toast on every Study-view load.
      if (get().currentProject?.id !== projectId) return;
      set({ continuityLoading: false });
    }
  },

  // --- V3-C C2 "Search intent toggles" -------------------------------------------------------
  searchIntent: null,
  setSearchIntent: (intent) => set({ searchIntent: intent }),

  // --- toasts -----------------------------------------------------------------------
  toasts: [],
  pushToast: (message, kind = "error") => {
    const id = makeId();
    set((state) => ({ toasts: [...state.toasts, { id, message, kind }] }));
    toastTimers.set(id, setTimeout(() => get().dismissToast(id), TOAST_LIFETIME_MS));
  },
  dismissToast: (id) => {
    const timer = toastTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      toastTimers.delete(id);
    }
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
  pauseToastTimer: (id) => {
    const timer = toastTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      toastTimers.delete(id);
    }
  },
  resumeToastTimer: (id) => {
    if (toastTimers.has(id)) return; // already running
    if (!get().toasts.some((t) => t.id === id)) return; // already dismissed
    toastTimers.set(id, setTimeout(() => get().dismissToast(id), TOAST_LIFETIME_MS));
  },
}));

if (typeof window !== "undefined") {
  window.addEventListener("hashchange", () => {
    useStudyLoopStore.setState({ route: parseHash(window.location.hash) });
  });
}
