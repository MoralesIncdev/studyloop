import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { writeCaptions } from "../src/lib/store.js";
import { loadTranscriptFromText } from "../src/lib/transcripts.js";

describe("YouTube captions persistence (writeCaptions + the generic transcript loader)", () => {
  let dataDir: string;
  const projectId = "yt-project-1";

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-captions-"));
  });

  afterEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  function captionsPath(): string {
    return path.join(dataDir, "projects", projectId, "captions.json");
  }

  it("writes segments to <project>/captions.json", async () => {
    await writeCaptions(dataDir, projectId, [
      { start: 0, end: 2.5, text: "Welcome back" },
      { start: 2.5, end: 5, text: "to the video" },
    ]);
    const raw = await fs.readFile(captionsPath(), "utf8");
    const parsed = JSON.parse(raw);
    expect(parsed).toEqual({
      segments: [
        { start: 0, end: 2.5, text: "Welcome back" },
        { start: 2.5, end: 5, text: "to the video" },
      ],
    });
  });

  it("round-trips through loadTranscriptFromText (no new parser needed — reuses the generic whisper-style loader)", async () => {
    await writeCaptions(dataDir, projectId, [{ start: 10, end: 12, text: "roll safe" }]);
    const raw = await fs.readFile(captionsPath(), "utf8");
    const transcript = loadTranscriptFromText(captionsPath(), raw);
    expect(transcript.segments).toEqual([{ start: 10, end: 12, text: "roll safe" }]);
  });

  it("writes an empty segments array cleanly when there are no captions", async () => {
    await writeCaptions(dataDir, projectId, []);
    const raw = await fs.readFile(captionsPath(), "utf8");
    expect(JSON.parse(raw)).toEqual({ segments: [] });
  });

  it("creates the project directory if it doesn't exist yet (writeFileAtomic's mkdir)", async () => {
    // No prior writeProject() call for this id — captions.json can still land.
    await writeCaptions(dataDir, "brand-new-project", [{ start: 0, end: 1, text: "hi" }]);
    const raw = await fs.readFile(path.join(dataDir, "projects", "brand-new-project", "captions.json"), "utf8");
    expect(JSON.parse(raw).segments).toHaveLength(1);
  });
});
