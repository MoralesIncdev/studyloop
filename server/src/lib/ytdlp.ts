import { spawn } from "node:child_process";
import { parseVtt, type NormalizedTranscript } from "./transcripts.js";

export class YtDlpNotFoundError extends Error {
  constructor() {
    super("yt-dlp not found on PATH");
    this.name = "YtDlpNotFoundError";
  }
}

function ytdlpBin(): string {
  return process.env.STUDYLOOP_YTDLP_BIN || "yt-dlp";
}

function run(args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(ytdlpBin(), args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") reject(new YtDlpNotFoundError());
      else reject(err);
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
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
  const { code, stdout, stderr } = await run(["-g", "-f", "best[height<=720]", url]);
  if (code !== 0 || !stdout.trim()) {
    throw new Error(`yt-dlp could not resolve a stream URL: ${stderr.slice(-500)}`);
  }
  return stdout.trim().split("\n")[0];
}

export interface YoutubeMetadata {
  videoId: string;
  title: string;
  captions?: NormalizedTranscript["segments"];
}

/** Resolves title + auto-captions for a YouTube URL via yt-dlp, without downloading video. */
export async function resolveYoutube(url: string): Promise<YoutubeMetadata> {
  const videoId = extractVideoId(url) ?? url;
  const os = await import("node:os");
  const path = await import("node:path");
  const fs = await import("node:fs/promises");
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-yt-"));
  const outTemplate = path.join(tmpDir, "%(id)s.%(ext)s");

  const { code: subsCode, stderr: subsStderr } = await run([
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

  let title = videoId;
  const meta = await run(["--print", "%(title)s", "--skip-download", url]);
  if (meta.code === 0 && meta.stdout.trim()) {
    title = meta.stdout.trim().split("\n")[0];
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

  return { videoId: videoId ?? url, title, captions };
}
