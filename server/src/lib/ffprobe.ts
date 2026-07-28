// Best-effort local-video duration lookup via ffprobe (ships alongside ffmpeg).
// Used by lib/shareBundle.ts (source-ref duration for the share bundle / import
// mismatch check) and routes/heatmap.ts (bucketing range for local sources,
// since project.json doesn't otherwise carry a duration field). Never throws —
// callers treat a null result as "duration unknown" and fall back accordingly.
import { spawn } from "node:child_process";

const SPAWN_TIMEOUT_MS = 15_000;

function run(args: string[]): Promise<{ code: number | null; stdout: string }> {
  return new Promise((resolve) => {
    const ffprobeBin = process.env.STUDYLOOP_FFPROBE_BIN || "ffprobe";
    const child = spawn(ffprobeBin, args, { stdio: ["ignore", "pipe", "ignore"] });
    let stdout = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      resolve({ code: null, stdout: "" });
    }, SPAWN_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.on("error", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: null, stdout: "" });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout });
    });
  });
}

/** Returns a local video file's duration in seconds, or null if ffprobe is missing/fails/times out. */
export async function getFfprobeDurationSeconds(filePath: string): Promise<number | null> {
  const { code, stdout } = await run(["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", filePath]);
  if (code !== 0) return null;
  const value = Number(stdout.trim());
  return Number.isFinite(value) && value > 0 ? value : null;
}
