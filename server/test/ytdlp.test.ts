import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertValidYoutubeUrl, extractVideoId, InvalidYoutubeUrlError, resolveYoutube } from "../src/lib/ytdlp.js";

describe("assertValidYoutubeUrl", () => {
  const allowed = [
    "https://youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ",
    "https://music.youtube.com/watch?v=dQw4w9WgXcQ",
  ];

  it.each(allowed)("accepts %s", (url) => {
    expect(() => assertValidYoutubeUrl(url)).not.toThrow();
  });

  it("rejects http (non-https) even for an allowlisted host", () => {
    expect(() => assertValidYoutubeUrl("http://youtube.com/watch?v=dQw4w9WgXcQ")).toThrow(InvalidYoutubeUrlError);
  });

  it("rejects a non-YouTube host", () => {
    expect(() => assertValidYoutubeUrl("https://evil.example.com/watch?v=dQw4w9WgXcQ")).toThrow(
      InvalidYoutubeUrlError
    );
  });

  it("rejects a lookalike host that merely contains youtube.com", () => {
    expect(() => assertValidYoutubeUrl("https://youtube.com.evil.example.com/watch?v=x")).toThrow(
      InvalidYoutubeUrlError
    );
  });

  it("rejects a youtube.com subdomain not on the allowlist", () => {
    expect(() => assertValidYoutubeUrl("https://gaming.youtube.com/watch?v=x")).toThrow(InvalidYoutubeUrlError);
  });

  it("rejects a completely malformed URL", () => {
    expect(() => assertValidYoutubeUrl("not a url")).toThrow(InvalidYoutubeUrlError);
  });

  it("rejects other schemes (file, javascript, data)", () => {
    expect(() => assertValidYoutubeUrl("file:///etc/passwd")).toThrow(InvalidYoutubeUrlError);
    expect(() => assertValidYoutubeUrl("javascript:alert(1)")).toThrow(InvalidYoutubeUrlError);
  });
});

describe("extractVideoId", () => {
  it("extracts from a standard watch URL", () => {
    expect(extractVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("extracts from a youtu.be short link", () => {
    expect(extractVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("extracts from a /shorts/ URL", () => {
    expect(extractVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("returns null when there's no discernible id", () => {
    expect(extractVideoId("https://www.youtube.com/")).toBeNull();
  });

  it("extracts from a /live/ URL", () => {
    expect(extractVideoId("https://www.youtube.com/live/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("extracts from an /embed/ URL", () => {
    expect(extractVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("extracts from a /live/ URL with extra path/query after the id", () => {
    expect(extractVideoId("https://www.youtube.com/live/dQw4w9WgXcQ?feature=share")).toBe("dQw4w9WgXcQ");
  });

  it("returns null for a URL form it doesn't recognize (e.g. a playlist link)", () => {
    expect(extractVideoId("https://www.youtube.com/playlist?list=PLxyz")).toBeNull();
  });
});

describe("resolveYoutube — unrecognized URL form with yt-dlp unavailable", () => {
  const originalBin = process.env.STUDYLOOP_YTDLP_BIN;

  beforeEach(() => {
    // Point at a binary that's guaranteed not to exist so every yt-dlp spawn
    // in this block deterministically fails with ENOENT (YtDlpNotFoundError),
    // without depending on whether yt-dlp happens to be installed on the
    // machine running the tests.
    process.env.STUDYLOOP_YTDLP_BIN = "studyloop-definitely-not-a-real-binary";
  });

  afterEach(() => {
    if (originalBin === undefined) delete process.env.STUDYLOOP_YTDLP_BIN;
    else process.env.STUDYLOOP_YTDLP_BIN = originalBin;
  });

  it("rejects with a clear error instead of treating the whole URL as a videoId", async () => {
    await expect(resolveYoutube("https://www.youtube.com/playlist?list=PLxyz")).rejects.toThrow(/video ID/i);
  });

  it("still succeeds (ytdlpMissing) for a recognizable URL form", async () => {
    const result = await resolveYoutube("https://youtu.be/dQw4w9WgXcQ");
    expect(result.ytdlpMissing).toBe(true);
    expect(result.videoId).toBe("dQw4w9WgXcQ");
  });

  it("still succeeds (ytdlpMissing) for a /live/ URL", async () => {
    const result = await resolveYoutube("https://www.youtube.com/live/dQw4w9WgXcQ");
    expect(result.ytdlpMissing).toBe(true);
    expect(result.videoId).toBe("dQw4w9WgXcQ");
  });
});
