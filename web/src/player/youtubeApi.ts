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
  getPlayerState(): number;
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

let iframeApiPromise: Promise<YTNamespace> | null = null;

/**
 * Loads the YouTube IFrame Player API script exactly once, however many
 * YouTubePlayer instances mount over the app's lifetime — every caller
 * shares the same promise. Safe to call repeatedly; resolves immediately if
 * the API is already available.
 */
export function loadYouTubeIframeApi(): Promise<YTNamespace> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("YouTube IFrame API requires a browser environment"));
  }
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (iframeApiPromise) return iframeApiPromise;

  iframeApiPromise = new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT as YTNamespace);
    };
    if (!document.querySelector(`script[src="${IFRAME_API_SRC}"]`)) {
      const script = document.createElement("script");
      script.src = IFRAME_API_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
  });
  return iframeApiPromise;
}
