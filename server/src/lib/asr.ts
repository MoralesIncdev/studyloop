// Phase 11 "Bring-your-own local ASR adapters" (design/EXECUTION-PLAN-post-review-v1.md):
// two adapter styles mirroring lib/providers.ts's registry philosophy —
// "command" (a local binary via a `{input}`/`{output}` template: whisper.cpp,
// faster-whisper, mlx-whisper, ...) and "endpoint" (an OpenAI-compatible
// `/v1/audio/transcriptions` server: speaches, LocalAI, a hosted Whisper).
// Both normalize to the same canonical `TranscriptSegment[]` shape every
// other transcript source in this codebase already speaks, and both write
// their result to the exact `<dataDir>/transcripts/<hash>.json` cache
// location lib/transcriptChain.ts's step 4 reads from — "never re-run when
// cached" (SPEC) is enforced by routes/transcribe.ts checking `hasAsrCache`
// before ever submitting a job, not by anything in here.
//
// `resolveAsrRunner()`/`__setAsrRunnerForTests` follow the same "injectable
// adapter interface + real impl + fake/test impl" pattern as
// lib/slides.ts's SlideExtractor and lib/analysis.ts's AnalysisLLMClient —
// routes/transcribe.ts's job-lifecycle tests inject a fake runner so no test
// ever spawns a real binary or makes a real network request (SPEC).
import { execFile, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import type { AsrConfig } from "../config.js";
import { parseSrtCaptions, parseVttCaptions } from "./captionParse.js";
import { isFfmpegAvailable } from "./frames.js";
import { pathExists, readJsonIfExists, writeJsonAtomic } from "./store.js";
import { parseTranscriptJson, type TranscriptSegment } from "./transcripts.js";
import { substituteAsrCommandTokens, validateAsrCommandTemplate } from "./asrCommand.js";

// --- Command adapter ---------------------------------------------------------

// Configurable via env (mirrors STUDYLOOP_FFMPEG_BIN/STUDYLOOP_FFPROBE_BIN's
// override convention) rather than a config.json field — the phase spec's
// `asr` shape is exactly `{mode, command, endpoint, apiKey, model,
// language}|`, and a lecture-length transcription needs a generous default
// regardless (6 hours), so this is an escape hatch for the rare case that's
// still not enough, not a setting most installs will ever touch.
const DEFAULT_ASR_COMMAND_TIMEOUT_MS = Number(process.env.STUDYLOOP_ASR_TIMEOUT_MS) || 6 * 60 * 60 * 1000;

/**
 * A command adapter's output location is a *prefix*, not a guaranteed exact
 * filename — many real tools (whisper.cpp's `-of <prefix>` with `-osrt`/
 * `-ovtt`/`-oj`) append their own extension rather than writing exactly to
 * the path they were given. Checked in this order; first hit wins.
 */
const OUTPUT_CANDIDATE_SUFFIXES = ["", ".json", ".srt", ".vtt", ".txt"];

async function findAsrCommandOutput(outputBase: string): Promise<string | null> {
  for (const suffix of OUTPUT_CANDIDATE_SUFFIXES) {
    const candidate = `${outputBase}${suffix}`;
    if (await pathExists(candidate)) return candidate;
  }
  return null;
}

/**
 * Sniffs and parses a command adapter's output file: canonical/whisper-style
 * JSON, SRT, or VTT (SPEC: "Accept whatever lands at {output}: .json
 * (canonical or whisper-style segments), .srt, .vtt — sniff and parse via
 * captionParse"). When the found file has no recognized extension (the raw
 * `{output}` path, unsuffixed), the *content* is sniffed instead: JSON if it
 * parses as an object/array, VTT if it starts with the `WEBVTT` header, SRT
 * if it contains a `-->` timing arrow, else the whole file becomes one
 * degenerate segment rather than a hard failure.
 */
export function sniffAndParseAsrOutput(filePath: string, raw: string): TranscriptSegment[] {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".json") return parseTranscriptJson(raw).segments;
  if (ext === ".srt") return parseSrtCaptions(raw).segments;
  if (ext === ".vtt") return parseVttCaptions(raw).segments;

  const trimmed = raw.trim();
  if (!trimmed) throw new Error(`ASR command produced an empty output file: ${filePath}`);
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return parseTranscriptJson(raw).segments;
  if (/^WEBVTT/i.test(trimmed)) return parseVttCaptions(raw).segments;
  if (raw.includes("-->")) return parseSrtCaptions(raw).segments;
  return [{ start: 0, end: 0, text: trimmed }];
}

/**
 * Runs a validated command template against `inputPath`, writing to
 * `outputBase` (a path prefix — see `findAsrCommandOutput`), and returns the
 * parsed segments. Runs via `execFile` — NEVER a shell (SPEC) — so the
 * template's own tokens are re-validated here as defense in depth (config.ts
 * already validates at save time, but a hand-edited config.json shouldn't be
 * trusted blindly). `opts.signal` (an AbortSignal) lets the caller kill the
 * child process for cancellation — `execFile` sends SIGTERM to the whole
 * process on abort.
 */
export async function runAsrCommand(
  template: string,
  inputPath: string,
  outputBase: string,
  opts: { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<TranscriptSegment[]> {
  const validated = validateAsrCommandTemplate(template);
  if (!validated.ok) throw new Error(validated.error ?? "Invalid ASR command template");
  const argv = substituteAsrCommandTokens(validated.tokens, inputPath, outputBase);
  const [bin, ...args] = argv;

  await new Promise<void>((resolve, reject) => {
    execFile(
      bin,
      args,
      { timeout: opts.timeoutMs ?? DEFAULT_ASR_COMMAND_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024, signal: opts.signal },
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });

  const outputFile = await findAsrCommandOutput(outputBase);
  if (!outputFile) {
    throw new Error(`ASR command completed but produced no recognizable output at ${outputBase} (.json/.srt/.vtt/.txt)`);
  }
  const raw = await fs.readFile(outputFile, "utf8");
  return sniffAndParseAsrOutput(outputFile, raw);
}

/** Removes every candidate output file for `outputBase` — best-effort tmp cleanup, never throws. */
async function cleanupAsrCommandOutputs(outputBase: string): Promise<void> {
  for (const suffix of OUTPUT_CANDIDATE_SUFFIXES) {
    await fs.unlink(`${outputBase}${suffix}`).catch(() => {});
  }
}

// --- Endpoint adapter ---------------------------------------------------------

const AUDIO_EXTRACT_TIMEOUT_MS = 10 * 60 * 1000;

/** ffmpeg audio-only extraction (mono, 16kHz WAV) — smaller upload, and what most ASR servers expect. Mirrors lib/frames.ts's spawn+timeout shape. */
function extractAudioForAsr(videoPath: string, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpegBin = process.env.STUDYLOOP_FFMPEG_BIN || "ffmpeg";
    const child = spawn(ffmpegBin, ["-y", "-i", videoPath, "-vn", "-ac", "1", "-ar", "16000", outPath], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`ffmpeg audio extraction timed out after ${AUDIO_EXTRACT_TIMEOUT_MS}ms`));
    }, AUDIO_EXTRACT_TIMEOUT_MS);
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 8192) stderr = stderr.slice(-8192);
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`));
    });
  });
}

const VerboseJsonSegmentSchema = z.object({ start: z.number(), end: z.number(), text: z.string() });
/** OpenAI's `verbose_json` response shape for `/v1/audio/transcriptions` — speaches/LocalAI/faster-whisper-server all mirror it. */
const VerboseJsonResponseSchema = z.object({
  segments: z.array(VerboseJsonSegmentSchema).optional(),
  text: z.string().optional(),
});

/** A response with no usable `segments` array degrades to one whole-file segment from its `text` field (or the raw body, for a server that ignored `response_format` entirely and returned plain text) — SPEC: "fall back to plain text parse". */
export function parseAsrPlainText(text: string): TranscriptSegment[] {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("ASR endpoint returned no transcript text");
  return [{ start: 0, end: 0, text: trimmed }];
}

/** Parses a `/v1/audio/transcriptions` JSON response — `verbose_json` segments preferred, `text`-only falls back to `parseAsrPlainText`. */
export function parseAsrEndpointJson(body: unknown): TranscriptSegment[] {
  const parsed = VerboseJsonResponseSchema.safeParse(body);
  if (parsed.success && parsed.data.segments && parsed.data.segments.length > 0) {
    return parsed.data.segments
      .map((s) => ({ start: s.start, end: s.end, text: s.text.trim() }))
      .filter((s) => s.text.length > 0)
      .sort((a, b) => a.start - b.start);
  }
  const text = parsed.success ? parsed.data.text : undefined;
  return parseAsrPlainText(text ?? "");
}

export interface AsrEndpointConfig {
  endpoint: string;
  apiKey: string | null;
  model: string | null;
  language: string | null;
}

/**
 * POSTs `videoPath` (or, when ffmpeg is available, its extracted audio —
 * SPEC: "check for ffmpeg like existing thumbnail/frames code does; fall
 * back to sending the video file directly") to
 * `${endpoint}/v1/audio/transcriptions` multipart, with `model`/`language`
 * forwarded when set and `Authorization: Bearer <apiKey>` when set.
 * `opts.signal` aborts the in-flight fetch for cancellation.
 */
export async function runAsrEndpoint(
  cfg: AsrEndpointConfig,
  videoPath: string,
  opts: { signal?: AbortSignal } = {}
): Promise<TranscriptSegment[]> {
  const base = cfg.endpoint.replace(/\/+$/, "");
  const url = `${base}/v1/audio/transcriptions`;

  let mediaPath = videoPath;
  let extractedPath: string | null = null;
  if (await isFfmpegAvailable()) {
    const candidate = path.join(os.tmpdir(), `studyloop-asr-${crypto.randomUUID()}.wav`);
    try {
      await extractAudioForAsr(videoPath, candidate);
      mediaPath = candidate;
      extractedPath = candidate;
    } catch {
      // Extraction failed (corrupt stream, unsupported codec, ...) — fall
      // back to sending the original video file directly, per SPEC.
      mediaPath = videoPath;
      extractedPath = null;
    }
  }

  try {
    const buffer = await fs.readFile(mediaPath);
    const form = new FormData();
    form.append("file", new Blob([buffer]), path.basename(mediaPath));
    if (cfg.model) form.append("model", cfg.model);
    if (cfg.language) form.append("language", cfg.language);
    // Preferred (SPEC): richer than plain text, carries per-segment timing.
    form.append("response_format", "verbose_json");

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : undefined,
        body: form,
        signal: opts.signal,
      });
    } catch (err) {
      throw new Error(`ASR endpoint request failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`ASR endpoint returned HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const json = (await res.json()) as unknown;
      return parseAsrEndpointJson(json);
    }
    // Not JSON at all — a server that ignored `response_format` and replied
    // with plain text (SPEC: "fall back to plain text parse").
    const text = await res.text();
    return parseAsrPlainText(text);
  } finally {
    if (extractedPath) await fs.unlink(extractedPath).catch(() => {});
  }
}

// --- Injectable runner (real dispatch + test double) --------------------------

export interface AsrRunInput {
  config: AsrConfig;
  /** Absolute path to the local video file — ASR only ever applies to a `source.type === "local"` project (see routes/transcribe.ts's "not_local" guard). */
  videoPath: string;
  /** Used for the command adapter's scratch output directory (`<dataDir>/tmp/asr/`). */
  dataDir: string;
  signal: AbortSignal;
}

export interface AsrRunner {
  run(input: AsrRunInput): Promise<TranscriptSegment[]>;
}

async function asrTmpDir(dataDir: string): Promise<string> {
  const dir = path.join(dataDir, "tmp", "asr");
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

class RealAsrRunner implements AsrRunner {
  async run(input: AsrRunInput): Promise<TranscriptSegment[]> {
    const { config, videoPath, dataDir, signal } = input;
    if (config.mode === "command") {
      if (!config.command) throw new Error("No ASR command configured");
      const tmpDir = await asrTmpDir(dataDir);
      const outputBase = path.join(tmpDir, crypto.randomUUID());
      try {
        return await runAsrCommand(config.command, videoPath, outputBase, { signal });
      } finally {
        await cleanupAsrCommandOutputs(outputBase);
      }
    }
    if (config.mode === "endpoint") {
      if (!config.endpoint) throw new Error("No ASR endpoint configured");
      return await runAsrEndpoint(
        { endpoint: config.endpoint, apiKey: config.apiKey, model: config.model, language: config.language },
        videoPath,
        { signal }
      );
    }
    throw new Error('ASR is not enabled (mode is "off")');
  }
}

let injectedAsrRunnerForTests: AsrRunner | null = null;

/** Test-only: forces `resolveAsrRunner` to return a fake/spy implementation — mirrors lib/slides.ts's `__setSlideExtractorForTests`. Every job-lifecycle test uses this; none invoke a real binary or make a real network request. */
export function __setAsrRunnerForTests(runner: AsrRunner | null): void {
  injectedAsrRunnerForTests = runner;
}

export function resolveAsrRunner(): AsrRunner {
  return injectedAsrRunnerForTests ?? new RealAsrRunner();
}

// --- Cache: <dataDir>/transcripts/<hash-of-video-path>.json ------------------
// Same directory lib/transcriptChain.ts's step 3 (lazy YouTube pull) already
// caches into, keyed by videoId there — this is keyed by a stable hash of the
// LOCAL video's own resolved path instead (there is no video id for a local
// file), so lib/transcriptChain.ts's step 4 can look it up without needing
// the project id (mirrors the youtube cache's own "keyed by video identity,
// not project id" reasoning — multiple projects could in principle point at
// the same file).

export function asrCacheKey(videoPath: string): string {
  return crypto.createHash("sha256").update(path.resolve(videoPath)).digest("hex");
}

export function asrCachePath(dataDir: string, videoPath: string): string {
  return path.join(dataDir, "transcripts", `${asrCacheKey(videoPath)}.json`);
}

interface AsrCacheFile {
  videoPath: string;
  cachedAt: string;
  adapterMode: "command" | "endpoint";
  segments: TranscriptSegment[];
}

export async function readAsrCache(dataDir: string, videoPath: string): Promise<TranscriptSegment[] | null> {
  const raw = await readJsonIfExists<AsrCacheFile>(asrCachePath(dataDir, videoPath));
  if (!raw || !Array.isArray(raw.segments)) return null;
  return raw.segments;
}

export async function writeAsrCache(
  dataDir: string,
  videoPath: string,
  segments: TranscriptSegment[],
  adapterMode: "command" | "endpoint"
): Promise<void> {
  const file: AsrCacheFile = { videoPath, cachedAt: new Date().toISOString(), adapterMode, segments };
  await writeJsonAtomic(asrCachePath(dataDir, videoPath), file);
}

/** SPEC: "never re-run when cached" — routes/transcribe.ts checks this before ever submitting a job. */
export async function hasAsrCache(dataDir: string, videoPath: string): Promise<boolean> {
  return pathExists(asrCachePath(dataDir, videoPath));
}
