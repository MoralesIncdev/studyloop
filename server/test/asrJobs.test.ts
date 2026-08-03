// Phase 11 "Bring-your-own local ASR adapters" (design/EXECUTION-PLAN-post-review-v1.md):
// evaluateAsrGuard's pure decision logic, then AsrJobManager's stateful
// queue/run/cancel behavior — every `run` function here is an in-memory
// fake (a resolved/rejected/never-settling promise), never a real ASR
// adapter, so this file never touches a binary or the network.
import { describe, expect, it, vi } from "vitest";
import { AsrJobManager, evaluateAsrGuard } from "../src/lib/asrJobs.js";

function deferred<T = void>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("evaluateAsrGuard", () => {
  it("'already_running' takes priority regardless of global state", () => {
    expect(evaluateAsrGuard({ isQueuedOrRunningForThisProject: true, anotherJobActive: false })).toBe("already_running");
    expect(evaluateAsrGuard({ isQueuedOrRunningForThisProject: true, anotherJobActive: true })).toBe("already_running");
  });

  it("'enqueue' when another project's job is active and this one isn't already in the queue", () => {
    expect(evaluateAsrGuard({ isQueuedOrRunningForThisProject: false, anotherJobActive: true })).toBe("enqueue");
  });

  it("'start' when nothing else is active and this project isn't already queued/running", () => {
    expect(evaluateAsrGuard({ isQueuedOrRunningForThisProject: false, anotherJobActive: false })).toBe("start");
  });
});

describe("AsrJobManager", () => {
  it("reports idle for a project with no job history", () => {
    const jobs = new AsrJobManager();
    expect(jobs.status("proj-1")).toEqual({ state: "idle" });
  });

  it("starts immediately when nothing else is running, and reports running with startedAt/elapsedMs", () => {
    const jobs = new AsrJobManager();
    const { promise } = deferred();
    const action = jobs.submit("proj-1", async () => {
      await promise;
    });
    expect(action).toBe("start");
    const status = jobs.status("proj-1");
    expect(status.state).toBe("running");
    expect(status.startedAt).toBeTruthy();
    expect(typeof status.elapsedMs).toBe("number");
  });

  it("transitions to done on success, with startedAt/finishedAt/elapsedMs", async () => {
    const jobs = new AsrJobManager();
    jobs.submit("proj-1", async () => {
      /* resolves immediately */
    });
    // Let the fire-and-forget async IIFE settle.
    await new Promise((r) => setTimeout(r, 0));
    const status = jobs.status("proj-1");
    expect(status.state).toBe("done");
    expect(status.startedAt).toBeTruthy();
    expect(status.finishedAt).toBeTruthy();
    expect(typeof status.elapsedMs).toBe("number");
  });

  it("transitions to failed with the thrown error's message", async () => {
    const jobs = new AsrJobManager();
    jobs.submit("proj-1", async () => {
      throw new Error("adapter blew up");
    });
    await new Promise((r) => setTimeout(r, 0));
    const status = jobs.status("proj-1");
    expect(status.state).toBe("failed");
    expect(status.message).toBe("adapter blew up");
  });

  it("stringifies a non-Error throw", async () => {
    const jobs = new AsrJobManager();
    jobs.submit("proj-1", async () => {
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw "just a string";
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(jobs.status("proj-1")).toMatchObject({ state: "failed", message: "just a string" });
  });

  it("409-equivalent: submit() for a project already running returns 'already_running' and doesn't disturb the in-flight job", () => {
    const jobs = new AsrJobManager();
    const { promise } = deferred();
    jobs.submit("proj-1", async () => {
      await promise;
    });
    const second = jobs.submit("proj-1", async () => {
      throw new Error("must never run — proj-1 is already running");
    });
    expect(second).toBe("already_running");
    expect(jobs.status("proj-1").state).toBe("running");
  });

  it("409-equivalent: submit() for a project already QUEUED (not yet running) also returns 'already_running'", () => {
    const jobs = new AsrJobManager();
    const { promise: firstPromise } = deferred();
    jobs.submit("proj-a", async () => {
      await firstPromise;
    });
    const queued = jobs.submit("proj-b", async () => {
      /* never actually invoked in this assertion */
    });
    expect(queued).toBe("enqueue");
    expect(jobs.status("proj-b").state).toBe("queued");

    const secondForB = jobs.submit("proj-b", async () => {
      throw new Error("must never run");
    });
    expect(secondForB).toBe("already_running");
  });

  it("global runner: a second project's submit while one is running is queued, not started, and starts automatically once the first finishes", async () => {
    const jobs = new AsrJobManager();
    const first = deferred();
    const bStarted = vi.fn();
    jobs.submit("proj-a", async () => {
      await first.promise;
    });
    const action = jobs.submit("proj-b", async () => {
      bStarted();
    });
    expect(action).toBe("enqueue");
    expect(jobs.status("proj-b").state).toBe("queued");
    expect(bStarted).not.toHaveBeenCalled();

    first.resolve(undefined);
    // Let proj-a's completion handler run, dequeue, and start proj-b.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(jobs.status("proj-a").state).toBe("done");
    expect(bStarted).toHaveBeenCalledTimes(1);
    expect(jobs.status("proj-b").state).toBe("done");
  });

  it("FIFO: multiple queued projects start in submission order", async () => {
    const jobs = new AsrJobManager();
    const order: string[] = [];
    const first = deferred();
    jobs.submit("proj-a", async () => {
      await first.promise;
    });
    jobs.submit("proj-b", async () => {
      order.push("b");
    });
    jobs.submit("proj-c", async () => {
      order.push("c");
    });
    expect(jobs.__queueLengthForTests()).toBe(2);

    first.resolve(undefined);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(order).toEqual(["b", "c"]);
  });

  it("cancel(): a running job's signal is aborted and it settles as failed with message 'Cancelled'", async () => {
    const jobs = new AsrJobManager();
    let sawAbort = false;
    const { promise, reject } = deferred();
    jobs.submit("proj-1", async (signal) => {
      signal.addEventListener("abort", () => {
        sawAbort = true;
        reject(new Error("aborted (simulated adapter honoring the signal)"));
      });
      await promise;
    });
    expect(jobs.status("proj-1").state).toBe("running");
    const cancelled = jobs.cancel("proj-1");
    expect(cancelled).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(sawAbort).toBe(true);
    expect(jobs.status("proj-1")).toMatchObject({ state: "failed", message: "Cancelled" });
  });

  it("cancel(): a still-queued job is removed before it ever starts, and never invokes its run function", async () => {
    const jobs = new AsrJobManager();
    const first = deferred();
    const neverRuns = vi.fn();
    jobs.submit("proj-a", async () => {
      await first.promise;
    });
    jobs.submit("proj-b", async () => {
      neverRuns();
    });
    expect(jobs.status("proj-b").state).toBe("queued");

    const cancelled = jobs.cancel("proj-b");
    expect(cancelled).toBe(true);
    expect(jobs.status("proj-b")).toMatchObject({ state: "failed", message: "Cancelled" });

    first.resolve(undefined);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(neverRuns).not.toHaveBeenCalled();
    // proj-a still ran fine — cancelling a queued sibling doesn't disturb the runner.
    expect(jobs.status("proj-a").state).toBe("done");
  });

  it("cancel(): no-ops (returns false) for an idle/unknown project", () => {
    const jobs = new AsrJobManager();
    expect(jobs.cancel("never-submitted")).toBe(false);
  });

  it("cancel(): no-ops (returns false) for an already-finished job", async () => {
    const jobs = new AsrJobManager();
    jobs.submit("proj-1", async () => {
      /* resolves immediately */
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(jobs.status("proj-1").state).toBe("done");
    expect(jobs.cancel("proj-1")).toBe(false);
  });

  it("resetForTests() clears all in-memory state", async () => {
    const jobs = new AsrJobManager();
    jobs.submit("proj-1", async () => {
      /* resolves immediately */
    });
    await new Promise((r) => setTimeout(r, 0));
    jobs.resetForTests();
    expect(jobs.status("proj-1")).toEqual({ state: "idle" });
    expect(jobs.__queueLengthForTests()).toBe(0);
  });

  it("a fresh submit() after done()/failed() re-enters the running state (re-transcribe)", async () => {
    const jobs = new AsrJobManager();
    jobs.submit("proj-1", async () => {
      /* resolves immediately */
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(jobs.status("proj-1").state).toBe("done");

    const { promise } = deferred();
    const action = jobs.submit("proj-1", async () => {
      await promise;
    });
    expect(action).toBe("start");
    expect(jobs.status("proj-1").state).toBe("running");
  });
});
