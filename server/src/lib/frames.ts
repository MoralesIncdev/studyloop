import { spawn } from "node:child_process";

export class FfmpegNotFoundError extends Error {
  constructor() {
    super("ffmpeg not found on PATH");
    this.name = "FfmpegNotFoundError";
  }
}

function run(cmd: string, args: string[]): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") reject(new FfmpegNotFoundError());
      else reject(err);
    });
    child.on("close", (code) => resolve({ code, stderr }));
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
    await run(ffmpegBin, ["-version"]);
    return true;
  } catch {
    return false;
  }
}
