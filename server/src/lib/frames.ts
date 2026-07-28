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

// Bounds memory for a single thumbnail's stdout capture — 480px-wide JPEGs are
// tiny (tens of KB), so this is a generous ceiling against a misbehaving input.
const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024;

/**
 * Scales an existing image (a captured shot JPEG) to at most `maxWidth` pixels
 * wide via ffmpeg, piping the result to stdout rather than a file, and returns
 * it base64-encoded. Used by lib/shareBundle.ts to embed shot thumbnails in an
 * exported `.studyloop.json` bundle (SPEC: "shots embedded as base64
 * thumbnails ≤ 480px wide"). Never throws — resolves `null` on any failure
 * (missing ffmpeg, bad input, timeout, oversized output) so a single bad shot
 * can't abort an entire export; the bundle just omits that thumbnail.
 */
export function scaleImageToBase64(inputPath: string, maxWidth = 480): Promise<string | null> {
  const ffmpegBin = process.env.STUDYLOOP_FFMPEG_BIN || "ffmpeg";
  const args = ["-y", "-i", inputPath, "-vf", `scale='min(${maxWidth},iw)':-2`, "-q:v", "5", "-f", "mjpeg", "pipe:1"];
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(ffmpegBin, args, { stdio: ["ignore", "pipe", "pipe"] });
    } catch {
      resolve(null);
      return;
    }
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    const finish = (result: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(null);
    }, SPAWN_TIMEOUT_MS);

    child.stdout?.on("data", (chunk: Buffer) => {
      if (settled) return;
      total += chunk.length;
      if (total > MAX_THUMBNAIL_BYTES) {
        child.kill("SIGKILL");
        finish(null);
        return;
      }
      chunks.push(chunk);
    });
    child.on("error", () => finish(null));
    child.on("close", (code) => {
      if (code !== 0 || chunks.length === 0) {
        finish(null);
        return;
      }
      finish(Buffer.concat(chunks).toString("base64"));
    });
  });
}
