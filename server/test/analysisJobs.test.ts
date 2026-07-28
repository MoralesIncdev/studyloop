import { describe, expect, it } from "vitest";
import { AnalysisJobManager, evaluateAnalyzeGuard } from "../src/lib/analysisJobs.js";

describe("evaluateAnalyzeGuard", () => {
  it("returns 'no_api_key' when no key, no force, no existing analysis, not fake mode", () => {
    expect(
      evaluateAnalyzeGuard({ isRunning: false, analysisExists: false, force: false, fakeMode: false, hasApiKey: false })
    ).toBe("no_api_key");
  });

  it("returns 'run' when a key is present and nothing else blocks it", () => {
    expect(
      evaluateAnalyzeGuard({ isRunning: false, analysisExists: false, force: false, fakeMode: false, hasApiKey: true })
    ).toBe("run");
  });

  it("returns 'run' in fake mode even with no API key", () => {
    expect(
      evaluateAnalyzeGuard({ isRunning: false, analysisExists: false, force: false, fakeMode: true, hasApiKey: false })
    ).toBe("run");
  });

  it("returns 'already_running' whenever a job is running — takes priority over everything else", () => {
    expect(
      evaluateAnalyzeGuard({ isRunning: true, analysisExists: false, force: false, fakeMode: false, hasApiKey: false })
    ).toBe("already_running");
    expect(
      evaluateAnalyzeGuard({ isRunning: true, analysisExists: true, force: true, fakeMode: true, hasApiKey: true })
    ).toBe("already_running");
  });

  it("returns 'serve_existing' when analysis.json exists and force is not set", () => {
    expect(
      evaluateAnalyzeGuard({ isRunning: false, analysisExists: true, force: false, fakeMode: false, hasApiKey: false })
    ).toBe("serve_existing");
  });

  it("'serve_existing' does not require an API key (idempotent GET-like read, not a new run)", () => {
    expect(
      evaluateAnalyzeGuard({ isRunning: false, analysisExists: true, force: false, fakeMode: false, hasApiKey: false })
    ).toBe("serve_existing");
  });

  it("force:true bypasses 'serve_existing' and falls through to the no-key/run decision", () => {
    expect(
      evaluateAnalyzeGuard({ isRunning: false, analysisExists: true, force: true, fakeMode: false, hasApiKey: false })
    ).toBe("no_api_key");
    expect(
      evaluateAnalyzeGuard({ isRunning: false, analysisExists: true, force: true, fakeMode: false, hasApiKey: true })
    ).toBe("run");
  });
});

describe("AnalysisJobManager", () => {
  it("reports idle for a project with no job history and no analysis.json", () => {
    const jobs = new AnalysisJobManager();
    expect(jobs.status("proj-1", false)).toEqual({ state: "idle" });
  });

  it("reports done for a project with no job history but an existing analysis.json (server restarted mid-session)", () => {
    const jobs = new AnalysisJobManager();
    expect(jobs.status("proj-1", true)).toEqual({ state: "done" });
  });

  it("reports running with progress once started", () => {
    const jobs = new AnalysisJobManager();
    jobs.start("proj-1");
    expect(jobs.isRunning("proj-1")).toBe(true);
    expect(jobs.status("proj-1", false)).toEqual({ state: "running", pct: 0 });
    jobs.progress("proj-1", 42);
    expect(jobs.status("proj-1", false)).toEqual({ state: "running", pct: 42 });
  });

  it("clamps progress to [0, 100]", () => {
    const jobs = new AnalysisJobManager();
    jobs.start("proj-1");
    jobs.progress("proj-1", 250);
    expect(jobs.status("proj-1", false)).toEqual({ state: "running", pct: 100 });
    jobs.progress("proj-1", -10);
    expect(jobs.status("proj-1", false)).toEqual({ state: "running", pct: 0 });
  });

  it("ignores a stale progress() call after the job has already finished", () => {
    const jobs = new AnalysisJobManager();
    jobs.start("proj-1");
    jobs.done("proj-1");
    jobs.progress("proj-1", 50); // should be a no-op — job isn't "running" anymore
    expect(jobs.status("proj-1", false)).toEqual({ state: "done" });
  });

  it("transitions to done", () => {
    const jobs = new AnalysisJobManager();
    jobs.start("proj-1");
    jobs.done("proj-1");
    expect(jobs.isRunning("proj-1")).toBe(false);
    expect(jobs.status("proj-1", false)).toEqual({ state: "done" });
  });

  it("transitions to error with a message", () => {
    const jobs = new AnalysisJobManager();
    jobs.start("proj-1");
    jobs.error("proj-1", "boom");
    expect(jobs.isRunning("proj-1")).toBe(false);
    expect(jobs.status("proj-1", false)).toEqual({ state: "error", message: "boom" });
  });

  it("tracks separate projects independently", () => {
    const jobs = new AnalysisJobManager();
    jobs.start("proj-a");
    expect(jobs.isRunning("proj-a")).toBe(true);
    expect(jobs.isRunning("proj-b")).toBe(false);
  });

  it("a fresh start() after done()/error() re-enters the running state (re-analyze)", () => {
    const jobs = new AnalysisJobManager();
    jobs.start("proj-1");
    jobs.done("proj-1");
    jobs.start("proj-1");
    expect(jobs.isRunning("proj-1")).toBe(true);
  });
});
