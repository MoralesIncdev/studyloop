// In-memory job state for POST /api/projects/:id/analyze, split out of
// routes/analyze.ts so the running/idempotent/no-key guard decisions are
// directly unit-testable without spinning up Fastify (matches this codebase's
// "routes stay thin, lib/ holds the logic + tests" convention — see
// lib/transcriptResolve.ts, lib/reveal.ts).
export type AnalyzeState =
  | { state: "idle" }
  | { state: "running"; pct: number }
  | { state: "done" }
  | { state: "error"; message: string };

/**
 * One job entry per project id, kept only for the life of the server process
 * (SPEC: "in-memory per-project job state"). Once a job finishes, its entry
 * stays as "done"/"error" until the process restarts or another run
 * overwrites it — GET status falls back to checking analysis.json's
 * existence only when there's never been a job this session (see `status()`).
 */
export class AnalysisJobManager {
  private jobs = new Map<string, AnalyzeState>();

  isRunning(projectId: string): boolean {
    return this.jobs.get(projectId)?.state === "running";
  }

  start(projectId: string): void {
    this.jobs.set(projectId, { state: "running", pct: 0 });
  }

  progress(projectId: string, pct: number): void {
    if (this.jobs.get(projectId)?.state === "running") {
      this.jobs.set(projectId, { state: "running", pct: Math.min(100, Math.max(0, pct)) });
    }
  }

  done(projectId: string): void {
    this.jobs.set(projectId, { state: "done" });
  }

  error(projectId: string, message: string): void {
    this.jobs.set(projectId, { state: "error", message });
  }

  /** `analysisFileExists` covers the "no job run this session yet, but analysis.json is already on disk" case. */
  status(projectId: string, analysisFileExists: boolean): AnalyzeState {
    const existing = this.jobs.get(projectId);
    if (existing) return existing;
    return analysisFileExists ? { state: "done" } : { state: "idle" };
  }

  /** Test-only: clears one project's in-memory job entry. */
  resetForTests(projectId: string): void {
    this.jobs.delete(projectId);
  }
}

export type AnalyzeGuardAction = "already_running" | "serve_existing" | "no_api_key" | "run";

export interface AnalyzeGuardInput {
  isRunning: boolean;
  analysisExists: boolean;
  force: boolean;
  fakeMode: boolean;
  hasApiKey: boolean;
}

/**
 * Pure decision function for POST /api/projects/:id/analyze's guard chain
 * (SPEC: "Status ... POST while running → 409", "No API key → 400",
 * "Idempotent: analysis.json exists → POST returns it unless {force:true}").
 * Order matters: a running job always wins (409, regardless of force/key —
 * you can't start a second run while one is in flight); then the idempotent
 * serve-existing check, which deliberately does NOT require an API key
 * (reading back an already-computed result shouldn't be key-gated); only
 * then the no-key gate, which is skipped entirely in fake/demo mode.
 */
export function evaluateAnalyzeGuard(input: AnalyzeGuardInput): AnalyzeGuardAction {
  if (input.isRunning) return "already_running";
  if (input.analysisExists && !input.force) return "serve_existing";
  if (!input.fakeMode && !input.hasApiKey) return "no_api_key";
  return "run";
}
