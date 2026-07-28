// The single interface both LocalVideoPlayer (<video>) and the future YouTubePlayer
// (IFrame API) implement, per SPEC "Player interface". Hotkeys and UI controls talk
// to this, never to the underlying element directly, so swapping source types is a
// non-event for the rest of the app.

export interface PlayerEventPayloads {
  play: undefined;
  pause: undefined;
  timeupdate: { currentTime: number };
  durationchange: { duration: number };
  ended: undefined;
  error: { message: string };
}

export type PlayerEvent = keyof PlayerEventPayloads;

export interface PlayerHandle {
  play(): void;
  pause(): void;
  seek(t: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  /**
   * Applies a new playback rate and syncs the store with whatever rate was
   * *actually* applied (implementations call `setPlaybackRate` on the store
   * themselves) — for YouTube, the player can snap the requested rate to its
   * own nearest supported value, so the caller's requested `r` isn't
   * necessarily what ends up in effect.
   */
  setRate(r: number): void;
  /**
   * The discrete playback rates this player actually supports, if it's
   * constrained to a fixed set (YouTube's IFrame API is; a plain <video>
   * element isn't). Omitted entirely when the player accepts any rate — the
   * UI falls back to its own full default option list in that case.
   */
  getAvailableRates?(): number[];
  /** Subscribe to a player event; returns an unsubscribe function. */
  on<E extends PlayerEvent>(event: E, cb: (payload: PlayerEventPayloads[E]) => void): () => void;
}
