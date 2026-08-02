// Phase 11 "Bring-your-own local ASR adapters" (design/EXECUTION-PLAN-post-review-v1.md):
// in-memory job state for POST/GET/DELETE /api/projects/:id/transcribe,
// split out of routes/transcribe.ts the same way lib/analysisJobs.ts splits
// out of routes/analyze.ts — the guard/status/queue logic is directly
// unit-testable without spinning up Fastify or touching a real ASR adapter.
//
// Unlike analyze (one independent job per project — every project can run
// concurrently), SPEC calls for "one global runner, FIFO queue": local ASR
// (a whisper.cpp process, or a self-hosted endpoint on the same machine) is
// usually CPU/GPU-bound on the same hardware StudyLoop itself runs on, so
// letting N transcriptions race for it would just make all of them slower.
// Only one project's job is ever actually running at a time; a POST for a
// *different* project while one is in flight is queued (202, state
// "queued"), not rejected — only a second POST for a project that's
// ALREADY queued/running for ITSELF is a 409 (SPEC: "409 if one is already
// running for the project").
import type { TranscriptSegment } from "./transcripts.js";

export type AsrJobStateName = "idle" | "queued" | "running" | "done" | "failed";

/** The wire shape GET (and POST's 202 body) returns — SPEC: "queued/running/done/failed + started/elapsed". */
export interface AsrJobStatusView {
  state: AsrJobStateName;
  startedAt?: string;
  finishedAt?: string;
  elapsedMs?: number;
  message?: string;
}

type InternalJobState =
  | { state: "queued" }
  | { state: "running"; startedAtMs: number }
  | { state: "done"; startedAtMs: number; finishedAtMs: number }
  | { state: "failed"; message: string; startedAtMs?: number; finishedAtMs: number };

function toView(job: InternalJobState | undefined, now: number): AsrJobStatusView {
  if (!job) return { state: "idle" };
  switch (job.state) {
    case "queued":
      return { state: "queued" };
    case "running":
      return { state: "running", startedAt: new Date(job.startedAtMs).toISOString(), elapsedMs: now - job.startedAtMs };
    case "done":
      return {
        state: "done",
        startedAt: new Date(job.startedAtMs).toISOString(),
        finishedAt: new Date(job.finishedAtMs).toISOString(),
        elapsedMs: job.finishedAtMs - job.startedAtMs,
      };
    case "failed":
      return {
        state: "failed",
        message: job.message,
        ...(job.startedAtMs !== undefined
          ? { startedAt: new Date(job.startedAtMs).toISOString(), elapsedMs: job.finishedAtMs - job.startedAtMs }
          : {}),
        finishedAt: new Date(job.finishedAtMs).toISOString(),
      };
  }
}

export type AsrGuardAction = "already_running" | "start" | "enqueue";

export interface AsrGuardInput {
  isQueuedOrRunningForThisProject: boolean;
  anotherJobActive: boolean;
}

/**
 * Pure decision function (mirrors lib/analysisJobs.ts's evaluateAnalyzeGuard)
 * — order matters: a project already queued/running for ITSELF always 409s,
 * regardless of whether anything else happens to be running globally.
 */
export function evaluateAsrGuard(input: AsrGuardInput): AsrGuardAction {
  if (input.isQueuedOrRunningForThisProject) return "already_running";
  if (input.anotherJobActive) return "enqueue";
  return "start";
}

type AsrRunFn = (signal: AbortSignal) => Promise<TranscriptSegment[] | void>;

interface QueueEntry {
  projectId: string;
  run: AsrRunFn;
}

/**
 * One job map + FIFO queue + "currently running" pointer for the life of the
 * server process (module-level singleton in routes/transcribe.ts, same
 * lifetime convention as routes/analyze.ts's `analysisJobs`).
 */
export class AsrJobManager {
  private jobs = new Map<string, InternalJobState>();
  private queue: QueueEntry[] = [];
  private runningProjectId: string | null = null;
  private cancelHandles = new Map<string, () => void>();

  status(projectId: string): AsrJobStatusView {
    return toView(this.jobs.get(projectId), Date.now());
  }

  isQueuedOrRunning(projectId: string): boolean {
    const s = this.jobs.get(projectId)?.state;
    return s === "queued" || s === "running";
  }

  /**
   * Submits `run` for `projectId`: starts it immediately if nothing else is
   * running, otherwise enqueues it (FIFO) to start once every job ahead of
   * it finishes. Returns the guard action actually taken —
   * "already_running" means nothing was submitted (the route should 409).
   */
  submit(projectId: string, run: AsrRunFn): AsrGuardAction {
    const action = evaluateAsrGuard({
      isQueuedOrRunningForThisProject: this.isQueuedOrRunning(projectId),
      anotherJobActive: this.runningProjectId !== null,
    });
    if (action === "already_running") return action;
    if (action === "enqueue") {
      this.jobs.set(projectId, { state: "queued" });
      this.queue.push({ projectId, run });
      return action;
    }
    this.startNow(projectId, run);
    return action;
  }

  private startNow(projectId: string, run: AsrRunFn): void {
    this.runningProjectId = projectId;
    const startedAtMs = Date.now();
    this.jobs.set(projectId, { state: "running", startedAtMs });
    const controller = new AbortController();
    this.cancelHandles.set(projectId, () => controller.abort());
    void (async () => {
      try {
        await run(controller.signal);
        this.jobs.set(projectId, { state: "done", startedAtMs, finishedAtMs: Date.now() });
      } catch (err) {
        // An aborted run (DELETE cancel) always reports "Cancelled" even if
        // the underlying adapter's own rejection message differs (execFile's
        // SIGTERM error, fetch's AbortError, ...) — the signal is the source
        // of truth for *why* it stopped, not whatever error text bubbled up.
        const message = controller.signal.aborted ? "Cancelled" : err instanceof Error ? err.message : String(err);
        this.jobs.set(projectId, { state: "failed", message, startedAtMs, finishedAtMs: Date.now() });
      } finally {
        this.cancelHandles.delete(projectId);
        if (this.runningProjectId === projectId) this.runningProjectId = null;
        this.startNext();
      }
    })();
  }

  private startNext(): void {
    if (this.runningProjectId !== null) return;
    const next = this.queue.shift();
    if (!next) return;
    this.startNow(next.projectId, next.run);
  }

  /**
   * Cancels a running job (its AbortSignal kills the child process /
   * aborts the fetch — see lib/asr.ts) or removes a still-queued one before
   * it ever started. Returns `false` (no-op) for an idle/done/failed/unknown
   * project id.
   */
  cancel(projectId: string): boolean {
    if (this.runningProjectId === projectId) {
      this.cancelHandles.get(projectId)?.();
      return true;
    }
    const idx = this.queue.findIndex((q) => q.projectId === projectId);
    if (idx !== -1) {
      this.queue.splice(idx, 1);
      this.jobs.set(projectId, { state: "failed", message: "Cancelled", finishedAtMs: Date.now() });
      return true;
    }
    return false;
  }

  /** Test-only: how many jobs (this one included, if queued) are waiting behind the current run. */
  __queueLengthForTests(): number {
    return this.queue.length;
  }

  /** Test-only: clears all in-memory state (jobs, queue, running pointer, cancel handles). */
  resetForTests(): void {
    this.jobs.clear();
    this.queue = [];
    this.runningProjectId = null;
    this.cancelHandles.clear();
  }
}
