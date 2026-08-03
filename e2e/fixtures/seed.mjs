#!/usr/bin/env node
// Seeds a disposable StudyLoop "install" for the Playwright smoke harness:
// a fixture config dir (config.json pointing libraryRoots/dataDir at the
// fixture tree below, never the real ~/.studyloop), a fixture dataDir with
// one fully-formed local project (project.json + captions.json +
// analysis.json — a v3 typed-spine analysis with 3 physical_skill units, so
// the pane engine has something real to key off of), and a tiny generated
// mp4 living inside the fixture libraryRoot (so both the Library scan and
// GET /api/video/stream's libraryRoots allowlist accept it).
//
// Run before the dev servers start (see playwright.config.ts's webServer
// command) — everything here is synchronous-in-effect (awaited) so the
// fixture is fully on disk before `npm run dev` reads config.json.
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = path.join(__dirname, "..", ".tmp");
const CONFIG_DIR = path.join(FIXTURE_ROOT, "config");
const DATA_DIR = path.join(FIXTURE_ROOT, "data");
const LIBRARY_DIR = path.join(FIXTURE_ROOT, "library");

// Fixed (not regenerated per run) so repeated local `npm run e2e` runs keep
// stable localStorage pane-layout keys (studyloop:console-layout:<id>:<pane>)
// across reloads within a single run, and stay boring/diffable across runs.
const PROJECT_ID = "c9b3be38-c152-4eb9-a397-476b3616022a";
const VIDEO_FILENAME = "StudyLoopSmokeFixture.mp4";
const VIDEO_DURATION_S = 14;

async function rmrf(p) {
  await fs.rm(p, { recursive: true, force: true });
}

function ffmpegBin() {
  return process.env.STUDYLOOP_FFMPEG_BIN || "ffmpeg";
}

async function generateFixtureVideo(outPath) {
  const bin = ffmpegBin();
  try {
    execFileSync(
      bin,
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        `testsrc=duration=${VIDEO_DURATION_S}:size=320x240:rate=15`,
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        outPath,
      ],
      { stdio: "ignore" }
    );
  } catch (err) {
    if (err && err.code === "ENOENT") {
      throw new Error(
        `e2e fixture setup: "${bin}" not found on PATH. Install ffmpeg (e.g. \`brew install ffmpeg\`) or set STUDYLOOP_FFMPEG_BIN, or drop a pre-made short mp4 at ${outPath} yourself.`
      );
    }
    throw err;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

async function main() {
  await rmrf(FIXTURE_ROOT);
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.mkdir(LIBRARY_DIR, { recursive: true });
  await fs.mkdir(path.join(DATA_DIR, "projects", PROJECT_ID), { recursive: true });

  const videoPath = path.join(LIBRARY_DIR, VIDEO_FILENAME);
  await generateFixtureVideo(videoPath);

  const now = new Date().toISOString();

  // --- project.json (server/src/lib/models.ts ProjectSchema) ---------------
  await writeJson(path.join(DATA_DIR, "projects", PROJECT_ID, "project.json"), {
    id: PROJECT_ID,
    title: "Study Loop Smoke Fixture",
    source: { type: "local", path: videoPath },
    transcript: { type: "file", path: "captions.json" },
    domain: "physical_skill",
    createdAt: now,
    updatedAt: now,
    lastPosition: 0,
    watchedUpTo: 0,
  });

  // --- captions.json (server/src/lib/store.ts writeCaptions shape) ---------
  await writeJson(path.join(DATA_DIR, "projects", PROJECT_ID, "captions.json"), {
    segments: [
      { start: 0, end: 2, text: "Alright, first thing on this pass." },
      { start: 2, end: 4, text: "Get the underhook before anything else." },
      { start: 4, end: 6, text: "That underhook is what controls the far hip." },
      { start: 6, end: 8, text: "Now drive the frame into the far hip." },
      { start: 8, end: 10, text: "That frame is what stops the escape." },
      { start: 10, end: 12, text: "Now step your leg through to mount." },
      { start: 12, end: 14, text: "And that completes the transition." },
    ],
  });

  // --- analysis.json (server/src/lib/analysis.ts AnalysisSchema, v3) -------
  // Realistic shapes lifted from server/test/review.test.ts's `unit()` /
  // `analysis()` fixture builders and server/test/analysisV3.test.ts's
  // literal AnalysisUnit objects, not invented from scratch.
  const units = [
    {
      id: "u-underhook",
      type: "CLAIM",
      label: "Underhook controls the far hip",
      summary: "Getting the underhook early denies the sweep.",
      body: "Whoever owns the underhook owns the far hip — it's the first control point in this whole sequence, and everything downstream (the frame, the step-through) assumes it's already there.",
      anchors: [{ t: 2, quote: "get the underhook before anything else" }],
      confidence: 0.92,
      threshold: false,
    },
    {
      id: "u-frame",
      type: "MECHANISM",
      label: "Frame prevents hip escape",
      summary: "A strong forearm frame stops the far-side hip from escaping.",
      body: "The frame is a mechanical block, not a push — the forearm angle has to stay perpendicular to the hip line or it collapses the moment the opponent bridges into it.",
      anchors: [{ t: 6, quote: "drive the frame into the far hip" }],
      confidence: 0.88,
      threshold: true,
      overlay: {
        triggers: ["opponent starts to bridge"],
        failureModes: ["frame collapses inward"],
        drillPairing: "10 reps of frame-and-drive, both sides",
      },
    },
    {
      id: "u-mount-step",
      type: "PROCEDURE",
      label: "Step through to mount",
      summary: "Once the hip is pinned, step the far leg through to mount.",
      body: "With the hip pinned by the frame, the far leg steps through in one motion — hesitating here is what lets the escape back out.",
      anchors: [{ t: 10, quote: "now step your leg through" }],
      confidence: 0.81,
      threshold: false,
    },
  ];

  await writeJson(path.join(DATA_DIR, "projects", PROJECT_ID, "analysis.json"), {
    generatedAt: now,
    model: "e2e-fixture",
    version: 3,
    source: "model",
    domain: "physical_skill",
    pearls: [{ t: 2, label: "Underhook first", insight: "Get the underhook before anything else.", importance: 2, unitId: "u-underhook" }],
    // unitsToConceptsMirror keeps `concepts` 1:1 with `units` by id (server/src/lib/analysis.ts) —
    // hand-mirrored here since this fixture bypasses the analyze pipeline entirely.
    concepts: units.map((u) => ({ id: u.id, title: u.label, summary: u.summary, body: u.body, anchors: u.anchors.map((a) => ({ t: a.t })) })),
    themes: [],
    units,
    edges: [],
  });

  // --- config.json (server/src/config.ts ConfigSchema) ----------------------
  // Minimal — every other field has a zod .default() and backfills on read.
  await writeJson(path.join(CONFIG_DIR, "config.json"), {
    dataDir: DATA_DIR,
    libraryRoots: [LIBRARY_DIR],
    transcriptRoots: [],
    conceptDocs: [],
  });

  // eslint-disable-next-line no-console
  console.log(`[e2e seed] fixture project ${PROJECT_ID} ready at ${DATA_DIR}`);
}

await main();
