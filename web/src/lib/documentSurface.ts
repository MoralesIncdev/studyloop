// Phase 8 "Document mode" (design/EXECUTION-PLAN-post-review-v1.md): which
// full-page surface the study page renders — the pane-engine console (the
// existing default, unchanged) or the transcript-ordered document surface
// (read-and-claim: units listed as unfinished prenotes the learner attests,
// never a finished study guide to passively read — see study/DocumentView.tsx).
//
// Persisted per project in localStorage, following lib/consoleLayout.ts's
// one-key-per-project pattern: an explicit user toggle always wins over the
// domain default on every future load of that project (SPEC item 4: "User's
// explicit toggle choice overrides and persists").
import type { Domain } from "./types";

export type StudySurface = "console" | "document";

const STORAGE_PREFIX = "studyloop:study-surface:";

function storageKey(projectId: string): string {
  return `${STORAGE_PREFIX}${projectId}`;
}

/**
 * Domain-driven default (SPEC item 4): dense declarative domains — clinical
 * nursing content is the first and, for now, only one — default to the
 * document surface. Every other domain, INCLUDING an unrecognized or
 * Phase-9-generated one, defaults to console: "keep it a simple lookup that
 * Phase 9's generated lenses fall into the console default" (SPEC item 4) —
 * a lookup table, not an inference over lens metadata, so a future lens that
 * genuinely warrants the document default is an explicit addition here, not
 * a side effect of some other heuristic.
 */
export function defaultSurfaceForDomain(domain: Domain | undefined): StudySurface {
  return domain === "clinical" ? "document" : "console";
}

/** Returns null on a missing key, corrupt value, or an unrecognized shape —
 *  callers fall back to defaultSurfaceForDomain(project.domain). */
export function loadSurfacePreference(projectId: string): StudySurface | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(projectId));
    return raw === "console" || raw === "document" ? raw : null;
  } catch {
    return null;
  }
}

export function saveSurfacePreference(projectId: string, surface: StudySurface): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(projectId), surface);
  } catch {
    // Storage can throw (private browsing, quota) — same tolerance as
    // consoleLayout.ts's writeRaw; not worth a toast over a UI preference.
  }
}
