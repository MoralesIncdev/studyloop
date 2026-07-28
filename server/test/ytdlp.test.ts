import { describe, expect, it } from "vitest";
import { assertValidYoutubeUrl, extractVideoId, InvalidYoutubeUrlError } from "../src/lib/ytdlp.js";

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
});
