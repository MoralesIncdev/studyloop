// GET /api/health backing logic. isFfmpegAvailable()/isYtdlpAvailable() each
// spawn a subprocess — on some machines (esp. yt-dlp under a slow Python
// interpreter start) that measured 7s per call, and this endpoint is polled
// by the web app on every load. Cache each tool's availability for up to 5
// minutes so a warm request never spawns anything; the first call after the
// cache is empty or stale still does a real (slower) check, same as before.
import { isFfmpegAvailable } from "./frames.js";
import { isYtdlpAvailable } from "./ytdlp.js";

const CACHE_TTL_MS = 5 * 60 * 1000;

class TtlBoolCheck {
  private value: boolean | null = null;
  private checkedAt = 0;
  private inFlight: Promise<boolean> | null = null;

  constructor(
    private readonly ttlMs: number,
    private readonly check: () => Promise<boolean>
  ) {}

  async get(): Promise<boolean> {
    const now = Date.now();
    if (this.value !== null && now - this.checkedAt < this.ttlMs) return this.value;
    if (this.inFlight) return this.inFlight;
    const promise = this.check()
      .then((value) => {
        this.value = value;
        this.checkedAt = Date.now();
        return value;
      })
      .finally(() => {
        if (this.inFlight === promise) this.inFlight = null;
      });
    this.inFlight = promise;
    return promise;
  }

  /** Test-only: forces the next get() to perform a fresh check. */
  resetForTests(): void {
    this.value = null;
    this.checkedAt = 0;
    this.inFlight = null;
  }
}

const ffmpegCheck = new TtlBoolCheck(CACHE_TTL_MS, isFfmpegAvailable);
const ytdlpCheck = new TtlBoolCheck(CACHE_TTL_MS, isYtdlpAvailable);

export interface HealthResult {
  ok: true;
  ffmpeg: boolean;
  ytdlp: boolean;
}

export async function getHealth(): Promise<HealthResult> {
  const [ffmpeg, ytdlp] = await Promise.all([ffmpegCheck.get(), ytdlpCheck.get()]);
  return { ok: true, ffmpeg, ytdlp };
}

/** Test-only: resets both tool-availability caches. */
export function resetHealthCacheForTests(): void {
  ffmpegCheck.resetForTests();
  ytdlpCheck.resetForTests();
}
