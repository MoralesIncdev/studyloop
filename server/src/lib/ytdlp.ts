import { spawn } from "node:child_process";
import { parseVtt, type NormalizedTranscript } from "./transcripts.js";

export class YtDlpNotFoundError extends Error {
  constructor() {
    super("yt-dlp not found on PATH");
    this.name = "YtDlpNotFoundError";
  }
}

export class InvalidYoutubeUrlError extends Error {
  constructor(message = "URL must be an https:// link to a youtube.com or youtu.be video") {
    super(message);
    this.name = "InvalidYoutubeUrlError";
  }
}

const ALLOWED_YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "music.youtube.com",
]);

/** Validates a URL is https and points at an allowlisted YouTube host. Throws otherwise. */
export function assertValidYoutubeUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new InvalidYoutubeUrlError();
  }
  if (parsed.protocol !== "https:") throw new InvalidYoutubeUrlError();
  if (!ALLOWED_YOUTUBE_HOSTS.has(parsed.hostname.toLowerCase())) throw new InvalidYoutubeUrlError();
  return parsed;
}

function ytdlpBin(): string {
  return process.env.STUDYLOOP_YTDLP_BIN || "yt-dlp";
}

const SPAWN_TIMEOUT_MS = 30_000;
const MAX_STDOUT_BYTES = 10 * 1024 * 1024;

function run(args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(ytdlpBin(), args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let settled = false;

    const finishReject = (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill("SIGKILL");
      reject(err);
    };

    const timer = setTimeout(() => {
      finishReject(new Error(`yt-dlp timed out after ${SPAWN_TIMEOUT_MS}ms`));
    }, SPAWN_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => {
      if (settled) return;
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_STDOUT_BYTES) {
        finishReject(new Error("yt-dlp stdout exceeded the 10MB cap"));
        return;
      }
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (err: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err.code === "ENOENT") reject(new YtDlpNotFoundError());
      else reject(err);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

/** True if the yt-dlp binary is reachable on PATH (or STUDYLOOP_YTDLP_BIN). Used by GET /api/health. */
export async function isYtdlpAvailable(): Promise<boolean> {
  try {
    const { code } = await run(["--version"]);
    return code === 0;
  } catch {
    return false;
  }
}

export function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1) || null;
    if (u.searchParams.has("v")) return u.searchParams.get("v");
    const shorts = /\/shorts\/([^/?]+)/.exec(u.pathname);
    if (shorts) return shorts[1];
    return null;
  } catch {
    return null;
  }
}

/** Resolves a direct playable stream URL for a YouTube video (`yt-dlp -g`). */
export async function resolveStreamUrl(url: string): Promise<string> {
  assertValidYoutubeUrl(url);
  const { code, stdout, stderr } = await run(["-g", "-f", "best[height<=720]", url]);
  if (code !== 0 || !stdout.trim()) {
    throw new Error(`yt-dlp could not resolve a stream URL: ${stderr.slice(-500)}`);
  }
  return stdout.trim().split("\n")[0];
}

export interface YoutubeMetadata {
  videoId: string;
  title: string | null;
  captions?: NormalizedTranscript["segments"] | null;
  /** True if yt-dlp isn't installed — playback/project-creation still proceed without it. */
  ytdlpMissing?: boolean;
}

/**
 * Resolves title + auto-captions for a YouTube URL via yt-dlp, without
 * downloading video. If yt-dlp isn't installed, this does NOT throw/block —
 * it falls back to a locally-extracted videoId with `ytdlpMissing: true` so
 * project creation can proceed without captions/title.
 */
export async function resolveYoutube(url: string): Promise<YoutubeMetadata> {
  assertValidYoutubeUrl(url);
  const videoId = extractVideoId(url) ?? url;
  const os = await import("node:os");
  const path = await import("node:path");
  const fs = await import("node:fs/promises");
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-yt-"));
  const outTemplate = path.join(tmpDir, "%(id)s.%(ext)s");

  let subsCode: number | null = null;
  let subsStderr = "";
  try {
    const subsResult = await run([
      "--skip-download",
      "--write-auto-sub",
      "--sub-lang",
      "en",
      "--sub-format",
      "vtt",
      "-o",
      outTemplate,
      url,
    ]);
    subsCode = subsResult.code;
    subsStderr = subsResult.stderr;
  } catch (err) {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    if (err instanceof YtDlpNotFoundError) {
      return { videoId, title: null, captions: null, ytdlpMissing: true };
    }
    throw err;
  }

  let title: string | null = videoId;
  try {
    const meta = await run(["--print", "%(title)s", "--skip-download", url]);
    if (meta.code === 0 && meta.stdout.trim()) {
      title = meta.stdout.trim().split("\n")[0];
    }
  } catch (err) {
    if (!(err instanceof YtDlpNotFoundError)) throw err;
    // yt-dlp vanished between the two calls (unlikely) — keep the placeholder title.
  }

  let captions: NormalizedTranscript["segments"] | undefined;
  try {
    const files = await fs.readdir(tmpDir);
    const vttFile = files.find((f) => f.endsWith(".vtt"));
    if (vttFile) {
      const raw = await fs.readFile(path.join(tmpDir, vttFile), "utf8");
      captions = parseVtt(raw).segments;
    }
  } catch {
    // no captions available; playback still works without them.
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }

  if (subsCode !== 0 && !captions && title === videoId) {
    // Not fatal on its own, but if we also failed to get a title, surface the error.
    throw new Error(`yt-dlp failed: ${subsStderr.slice(-500)}`);
  }

  return { videoId, title, captions };
}
