import { spawn } from "node:child_process";

export class FfmpegNotFoundError extends Error {
  constructor() {
    super("ffmpeg not found on PATH");
    this.name = "FfmpegNotFoundError";
  }
}

// A stream-based capture (esp. resolving + reading a YouTube stream URL) can
// hang indefinitely on a stalled network read — bound it so a single bad
// capture can't tie up a server process/worker forever. Mirrors ytdlp.ts's
// own spawn timeout.
const SPAWN_TIMEOUT_MS = 60_000;
// Bound memory regardless of how much stderr a wedged/looping ffmpeg process
// produces; only the tail is ever used for the error message anyway.
const MAX_STDERR_CHARS = 8 * 1024;

function run(cmd: string, args: string[]): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    let settled = false;

    const finishReject = (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill("SIGKILL");
      reject(err);
    };

    const timer = setTimeout(() => {
      finishReject(new Error(`ffmpeg timed out after ${SPAWN_TIMEOUT_MS}ms`));
    }, SPAWN_TIMEOUT_MS);

    child.stderr.on("data", (chunk: Buffer) => {
      if (settled) return;
      stderr += chunk.toString();
      if (stderr.length > MAX_STDERR_CHARS) stderr = stderr.slice(-MAX_STDERR_CHARS);
    });
    child.on("error", (err: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err.code === "ENOENT") reject(new FfmpegNotFoundError());
      else reject(err);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stderr });
    });
  });
}

/**
 * Grabs a single frame at `t` seconds from `source` (local file path or a
 * direct stream URL) and writes a JPEG to `outPath`.
 * Mirrors: `ffmpeg -ss t -i file -frames:v 1 -q:v 3`.
 */
export async function extractFrame(source: string, t: number, outPath: string): Promise<void> {
  const ffmpegBin = process.env.STUDYLOOP_FFMPEG_BIN || "ffmpeg";
  const { code, stderr } = await run(ffmpegBin, [
    "-y",
    "-ss",
    String(t),
    "-i",
    source,
    "-frames:v",
    "1",
    "-q:v",
    "3",
    outPath,
  ]);
  if (code !== 0) {
    throw new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`);
  }
}

export async function isFfmpegAvailable(): Promise<boolean> {
  try {
    const ffmpegBin = process.env.STUDYLOOP_FFMPEG_BIN || "ffmpeg";
    const { code } = await run(ffmpegBin, ["-version"]);
    return code === 0;
  } catch {
    return false;
  }
}
