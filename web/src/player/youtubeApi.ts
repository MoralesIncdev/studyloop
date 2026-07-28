// Minimal ambient types for the YouTube IFrame Player API, plus a
// promise-gated loader for its `<script src=".../iframe_api">` tag (SPEC F2
// "YouTubePlayer.tsx ... using the official IFrame API"). The API is loaded
// at most once per page load — every YouTubePlayer mount (across project
// switches) shares the same promise, resolved via the API's own
// `onYouTubeIframeAPIReady` global callback.

export interface YTPlayerVars {
  autoplay?: 0 | 1;
  playsinline?: 0 | 1;
  modestbranding?: 0 | 1;
  rel?: 0 | 1;
  controls?: 0 | 1;
}

export interface YTPlayerEvent {
  target: YTPlayer;
  data?: number;
}

export interface YTPlayerOptions {
  videoId: string;
  playerVars?: YTPlayerVars;
  events?: {
    onReady?: (e: YTPlayerEvent) => void;
    onStateChange?: (e: YTPlayerEvent) => void;
    onError?: (e: YTPlayerEvent) => void;
  };
}

export interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  setPlaybackRate(rate: number): void;
  getPlaybackRate(): number;
  getAvailablePlaybackRates(): number[];
  getPlayerState(): number;
  getVolume(): number;
  setVolume(volume: number): void;
  isMuted(): boolean;
  mute(): void;
  unMute(): void;
  destroy(): void;
}

export interface YTNamespace {
  Player: new (element: HTMLElement | string, options: YTPlayerOptions) => YTPlayer;
  PlayerState: {
    UNSTARTED: number;
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
    BUFFERING: number;
    CUED: number;
  };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const IFRAME_API_SRC = "https://www.youtube.com/iframe_api";
// Bounds how long we wait for the script to either fire
// `onYouTubeIframeAPIReady` or error out — a stalled network request would
// otherwise leave every YouTubePlayer mount stuck showing nothing forever.
const IFRAME_API_LOAD_TIMEOUT_MS = 15_000;

let iframeApiPromise: Promise<YTNamespace> | null = null;

/**
 * Loads the YouTube IFrame Player API script exactly once, however many
 * YouTubePlayer instances mount over the app's lifetime — every caller
 * shares the same promise. Safe to call repeatedly; resolves immediately if
 * the API is already available.
 *
 * On failure (script `onerror`, or a 15s load timeout) the shared promise
 * rejects *and* resets itself to `null` — so a subsequent call (e.g. the
 * user hitting a "Retry" button) gets a fresh load attempt instead of being
 * stuck reusing a promise that can never resolve, or a `<script>` tag the
 * browser already gave up on.
 */
export function loadYouTubeIframeApi(): Promise<YTNamespace> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("YouTube IFrame API requires a browser environment"));
  }
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (iframeApiPromise) return iframeApiPromise;

  iframeApiPromise = new Promise<YTNamespace>((resolve, reject) => {
    let settled = false;
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${IFRAME_API_SRC}"]`);
    const script = existing ?? document.createElement("script");

    const timer = setTimeout(() => {
      finishReject(new Error("Timed out loading the YouTube player (15s) — check your network connection."));
    }, IFRAME_API_LOAD_TIMEOUT_MS);

    function onError(): void {
      finishReject(new Error("Failed to load the YouTube player script."));
    }

    function finishReject(err: Error): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      script.removeEventListener("error", onError);
      // Drop the failed tag so a retry gets a real fresh load attempt rather
      // than silently reusing a <script> the browser already gave up on.
      script.remove();
      iframeApiPromise = null;
      reject(err);
    }

    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      script.removeEventListener("error", onError);
      resolve(window.YT as YTNamespace);
    };

    script.addEventListener("error", onError);
    if (!existing) {
      script.src = IFRAME_API_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
  });
  return iframeApiPromise;
}
