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
  setRate(r: number): void;
  /** Subscribe to a player event; returns an unsubscribe function. */
  on<E extends PlayerEvent>(event: E, cb: (payload: PlayerEventPayloads[E]) => void): () => void;
}
