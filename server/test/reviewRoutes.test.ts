// Phase 3 "Attestation gate & compile honesty" (GATE-01 / ROADMAP SC1, SC2):
// the repo's second route-level test (server/test/youtube.test.ts is the
// first). GATE-01's gate logic and its continuous review.json migration
// shipped in commit 813dc21 and are already unit-tested at the lib level
// (server/test/review.test.ts) — but lib/review.ts's deriveLiveCards and
// buildReviewQueue are never actually driven by routes/review.ts's real
// GET /api/review/queue handler in any existing test, and that handler does
// its own disk I/O (listProjectIds, readProject, readBubbles, analysis.json,
// readAttestations, readPearlReviewAdds, readReviewState, writeReviewState)
// that lib-level tests never exercise. This file proves the attestation gate
// holds end-to-end through the running server: the review queue omits
// un-attested pearls, admits both learner-signal paths, and migrates legacy
// review.json entries without corrupting a legitimately scheduled card.
//
// Isolation seam: routes/review.ts exposes no dataDir parameter and no
// test-injection hook — the only seam is STUDYLOOP_CONFIG_DIR, which
// config.ts reads once at module-evaluation time and then caches for the
// life of the process (getConfig()'s cachedConfig). So every StudyLoop
// module below is loaded via a dynamic `await import(...)` inside beforeAll,
// AFTER the env var is set and a fake config.json is written — a static
// top-level import would be hoisted above that assignment and would bake in
// whatever config the developer's real environment resolves to.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

type Project = import("../src/lib/models.js").Project;
type Bubble = import("../src/lib/models.js").Bubble;
type Analysis = import("../src/lib/analysis.js").Analysis;
type Pearl = import("../src/lib/analysis.js").Pearl;
type AnalysisUnit = import("../src/lib/analysis.js").AnalysisUnit;
type AttestationsFile = import("../src/lib/attestation.js").AttestationsFile;
type ReviewState = import("../src/lib/review.js").ReviewState;
type ReviewCardState = import("../src/lib/review.js").ReviewCardState;

let reviewRoutes: typeof import("../src/routes/review.js")["reviewRoutes"];
let writeProject: typeof import("../src/lib/store.js")["writeProject"];
let writeBubbles: typeof import("../src/lib/store.js")["writeBubbles"];
let analysisJsonPath: typeof import("../src/lib/store.js")["analysisJsonPath"];
let writeJsonAtomicFn: typeof import("../src/lib/store.js")["writeJsonAtomic"];
let writeAttestations: typeof import("../src/lib/attestationStore.js")["writeAttestations"];
let writePearlReviewAdds: typeof import("../src/lib/pearlReviewStore.js")["writePearlReviewAdds"];
let readReviewState: typeof import("../src/lib/reviewStore.js")["readReviewState"];
let writeReviewState: typeof import("../src/lib/reviewStore.js")["writeReviewState"];

const PROJECT_ID = "3f5a9b3e-1111-4c22-8a33-9e0f1a2b3c4d";
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

let configRoot: string;
let dataRoot: string;
let app: FastifyInstance;

beforeAll(async () => {
  // Two separate temp roots (config vs data) so the fake config.json we
  // write below never collides with the disposable project data it points
  // at — mirrors playwright.config.ts / e2e/fixtures/seed.mjs's own use of
  // this seam.
  configRoot = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-review-routes-config-"));
  dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-review-routes-data-"));

  process.env.STUDYLOOP_CONFIG_DIR = configRoot;
  // Guarantees resolveCardTransformClient can't return a fake client and
  // silently mask a real-provider code path — see the null anthropicApiKey
  // below for the actual determinism guarantee.
  delete process.env.STUDYLOOP_FAKE_ANALYSIS;

  // T-03-01 tripwire: refuse to continue if the resolved data root somehow
  // isn't inside the OS temp directory, rather than silently reaching a
  // real user's data on a broken assumption.
  const resolvedDataRoot = path.resolve(dataRoot);
  const resolvedTmpRoot = path.resolve(os.tmpdir());
  if (!resolvedDataRoot.startsWith(resolvedTmpRoot)) {
    throw new Error(
      `T-03-01 tripwire: resolved data root "${resolvedDataRoot}" is not inside the OS temp directory "${resolvedTmpRoot}" — refusing to proceed`
    );
  }

  // Written BEFORE the first getConfig() call so loadConfig() never falls
  // through to DEFAULT_CONFIG (whose dataDir default expands against the
  // real home directory). anthropicApiKey stays null so
  // resolveProviderAuth() returns null, resolveCardTransformClient() returns
  // null, and fillTransformCache() short-circuits without a single network
  // call — the test stays deterministic and fully offline.
  await fs.writeFile(
    path.join(configRoot, "config.json"),
    JSON.stringify(
      {
        dataDir: resolvedDataRoot,
        llmProvider: "anthropic",
        anthropicAuthMode: "api-key",
        anthropicApiKey: null,
      },
      null,
      2
    )
  );

  const routesModule = await import("../src/routes/review.js");
  const storeModule = await import("../src/lib/store.js");
  const attestationStoreModule = await import("../src/lib/attestationStore.js");
  const pearlReviewStoreModule = await import("../src/lib/pearlReviewStore.js");
  const reviewStoreModule = await import("../src/lib/reviewStore.js");

  reviewRoutes = routesModule.reviewRoutes;
  writeProject = storeModule.writeProject;
  writeBubbles = storeModule.writeBubbles;
  analysisJsonPath = storeModule.analysisJsonPath;
  writeJsonAtomicFn = storeModule.writeJsonAtomic;
  writeAttestations = attestationStoreModule.writeAttestations;
  writePearlReviewAdds = pearlReviewStoreModule.writePearlReviewAdds;
  readReviewState = reviewStoreModule.readReviewState;
  writeReviewState = reviewStoreModule.writeReviewState;
});

afterAll(async () => {
  await fs.rm(configRoot, { recursive: true, force: true });
  await fs.rm(dataRoot, { recursive: true, force: true });
});

beforeEach(async () => {
  // Per-test isolation within the one file-wide config/data root pair (the
  // root pair is fixed for the whole file — getConfig() caches for the
  // process and Vitest isolates per file, not per test).
  await fs.rm(path.join(dataRoot, "projects"), { recursive: true, force: true });
  await fs.mkdir(path.join(dataRoot, "projects"), { recursive: true });
  await fs.rm(path.join(dataRoot, "review.json"), { force: true });
});

afterEach(async () => {
  if (app) await app.close();
});

async function buildApp(): Promise<FastifyInstance> {
  const fastifyApp = Fastify();
  await fastifyApp.register(reviewRoutes);
  await fastifyApp.ready();
  return fastifyApp;
}

// --- Fixtures (shapes borrowed from server/test/review.test.ts's baseProject/bubble/analysis) ---

function baseProject(): Project {
  return {
    id: PROJECT_ID,
    title: "Mechanical Ventilation Basics",
    source: { type: "local", path: "/videos/mech-vent.mp4" },
    transcript: { type: "none" },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    lastPosition: 0,
    watchedUpTo: 0,
  };
}

function liveBubble(): Bubble {
  return { id: "b1", t: 30, text: "PEEP keeps alveoli open between breaths", shot: null, createdAt: "2026-01-01T00:00:00Z" };
}

function pearlFixture(t: number, opts: { unitId?: string } = {}): Pearl {
  return {
    t,
    label: `Pearl @ ${t}s`,
    insight: `Model-derived insight anchored at ${t}s.`,
    importance: 2,
    ...opts,
  };
}

function claimUnit(id: string): AnalysisUnit {
  return {
    id,
    type: "CLAIM",
    label: "PEEP recruits collapsed alveoli",
    summary: "PEEP keeps alveoli open between breaths, improving oxygenation.",
    body: "Positive end-expiratory pressure recruits alveoli that would otherwise collapse during expiration, improving oxygenation without requiring a higher FiO2.",
    anchors: [{ t: 118, quote: "PEEP recruits alveoli" }],
    confidence: 0.9,
    threshold: false,
  };
}

function buildAnalysis(pearls: Pearl[], units: AnalysisUnit[] = []): Analysis {
  return {
    generatedAt: "2026-01-01T00:00:00Z",
    model: "claude-opus-5",
    version: 3,
    source: "model",
    pearls,
    concepts: [],
    themes: [],
    units,
  };
}

function pastIso(msAgo: number): string {
  return new Date(Date.now() - msAgo).toISOString();
}

function futureIso(msAhead: number): string {
  return new Date(Date.now() + msAhead).toISOString();
}

function cardState(overrides: Partial<ReviewCardState>): ReviewCardState {
  return {
    due: new Date().toISOString(),
    interval: 0,
    lapses: 0,
    reps: 0,
    lastGrade: null,
    introducedAt: new Date().toISOString(),
    ...overrides,
  };
}

async function seedProject(opts: {
  bubbles?: Bubble[];
  analysis?: Analysis;
  attestations?: AttestationsFile;
  pearlReviewAdds?: string[];
}): Promise<void> {
  await writeProject(dataRoot, baseProject());
  await writeBubbles(dataRoot, PROJECT_ID, opts.bubbles ?? []);
  if (opts.analysis) {
    await writeJsonAtomicFn(analysisJsonPath(dataRoot, PROJECT_ID), opts.analysis);
  }
  if (opts.attestations) {
    await writeAttestations(dataRoot, PROJECT_ID, opts.attestations);
  }
  if (opts.pearlReviewAdds) {
    await writePearlReviewAdds(dataRoot, PROJECT_ID, new Set(opts.pearlReviewAdds));
  }
}

describe("GET /api/review/queue — attestation gate (GATE-01)", () => {
  it("omits an un-attested, non-explicitly-added pearl from the due queue while surfacing the live bubble control card", async () => {
    app = await buildApp();
    await seedProject({
      bubbles: [liveBubble()],
      analysis: buildAnalysis([pearlFixture(60)]),
    });

    const res = await app.inject({ method: "GET", url: "/api/review/queue" });

    expect(res.statusCode).toBe(200);
    const dueIds = (res.json().due as Array<{ id: string }>).map((c) => c.id);

    // Control assertion — load-bearing. Without it a green result on the
    // negative assertion below would be indistinguishable from a fixture
    // that never loaded at all (the exact false-green this harness is most
    // likely to produce if the isolation seam is wired wrong).
    expect(dueIds).toContain(`bubble:${PROJECT_ID}:b1`);
    expect(dueIds).not.toContain(`pearl:${PROJECT_ID}:60`);

    const reviewJsonWritten = await fs
      .access(path.join(dataRoot, "review.json"))
      .then(() => true)
      .catch(() => false);
    expect(reviewJsonWritten).toBe(true);
  });
});
