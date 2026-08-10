# Phase 3: Attestation Gate & Compile Honesty - Pattern Map

**Mapped:** 2026-08-10
**Files analyzed:** 3 (1 new test file, 2 documentation edits)
**Analogs found:** 3 / 3

This is a verification-plus-documentation phase (per RESEARCH.md). There is exactly one net-new source file (a route-level test) and two documentation-edit targets. No production code is added.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|---------------|
| `server/test/reviewRoutes.test.ts` (new — or extend `server/test/review.test.ts`) | test (route-level, request-response) | request-response | `server/test/youtube.test.ts` | exact — repo's only existing route-level `app.inject` test |
| `server/test/review.test.ts` (possible edge-case additions, if audit finds a gap) | test (unit) | transform/CRUD | `server/test/review.test.ts` itself, lines 185-225 (existing gate-path `it` blocks) | exact — same file, same convention |
| `SPEC.md` F11 "Cards" (~467-476) + V3-B "B4. Review-loop upgrades" (~659-673) | config/doc | N/A (documentation) | `SPEC.md` F11's own "Implementation notes (deviations from the literal wording above)" block (lines 489-501) | exact — in-file precedent for exactly this edit type |
| `.planning/REQUIREMENTS.md` GATE-01/GATE-02/COMP-01/COMP-02 checkboxes | config/doc | N/A (documentation) | `.planning/REQUIREMENTS.md`'s own PIPE-01 entry (line 12) | exact — in-file precedent for provenance-note format |

## Pattern Assignments

### `server/test/reviewRoutes.test.ts` (new route-level test, request-response)

**Analog:** `server/test/youtube.test.ts` (the repo's only route-level `app.inject` test, written in Phase 1 for the identical reason: route-layer branching that lib-level unit tests can't prove).

**Why this file, not `review.test.ts`'s existing unit tests:** `review.test.ts` calls `deriveLiveCards`/`buildReviveQueue` directly (lib-level, no I/O). The Wave 0 gap is proving the gate holds through the *real* Fastify route (`GET /api/review/queue` in `server/src/routes/review.ts`), which does its own disk I/O (`readProject`, `readBubbles`, `readAttestations`, `readPearlReviewAdds`, `readReviewState`) — none of which the lib-level tests exercise.

**Bootstrap pattern** (verbatim structure from `server/test/youtube.test.ts:13-15, 62-67`):
```typescript
import { afterEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { reviewRoutes } from "../src/routes/review.js";

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(reviewRoutes);
  await app.ready();
  return app;
}

describe("GET /api/review/queue", () => {
  let app: FastifyInstance;
  afterEach(async () => {
    if (app) await app.close();
    // + any config/env teardown (see DI seam below)
  });
  it("...", async () => {
    app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/review/queue" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // assert body.due contains no un-attested pearl card ids
  });
});
```

**Critical DI/isolation seam — dataDir injection (this is the hard part, not present in youtube.test.ts):**

`routes/review.ts` does NOT take a `dataDir` parameter or expose a test seam like `__setInnertubeClientForTests`. It calls `getConfig()` (`server/src/config.ts:261-264`) every request, which lazily loads and **module-level-caches** (`cachedConfig`, line 258) a config from `CONFIG_PATH = path.join(CONFIG_DIR, "config.json")`, where `CONFIG_DIR` is resolved **once at module import time** (`server/src/config.ts:138-140`):
```typescript
// Source: server/src/config.ts:138-141 (read this session)
const CONFIG_DIR = process.env.STUDYLOOP_CONFIG_DIR
  ? path.resolve(process.env.STUDYLOOP_CONFIG_DIR)
  : path.join(os.homedir(), ".studyloop");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");
```
This env var is the **existing, documented seam** — comment at `config.ts:130-137` states it exists precisely so the e2e harness can point the whole config/dataDir tree at a disposable fixture directory instead of the real `~/.studyloop`. No production code change needed; the test just needs to use it correctly:

1. Before importing `routes/review.ts` (or any module that transitively imports `config.js`) in the test file, set `process.env.STUDYLOOP_CONFIG_DIR` to a fresh `fs.mkdtemp(...)` directory.
2. **Pre-write** a `config.json` into that directory with an explicit `dataDir` pointing at a *second* temp directory — do NOT rely on `loadConfig()`'s default (`"~/StudyLoopData"`, which expands against the real `os.homedir()`, not the fake `CONFIG_DIR` — see `config.ts:154-155,191-193`). Writing the file first avoids ever touching real user data.
3. Because `getConfig()` caches in-memory per process (`config.ts:258`), and Vitest gives each test file its own module registry, this must be done once at the top of the test file (or in a `beforeAll`), not per-`it`. There is no `__resetConfigForTests` — if per-test isolation of *different* dataDirs within the same file is needed, structure as `describe.sequential` with one dataDir for the whole file (matches `reviewStore.test.ts`'s per-`beforeEach` mkdtemp pattern for the underlying data, just not for config).

**Fixture-writing pattern for the on-disk project/review state** (verbatim signatures, from `server/src/lib/store.ts`):
```typescript
// writeProject(dataDir, project): Promise<void>       — store.ts:280
// writeBubbles(dataDir, id, bubbles): Promise<void>    — store.ts:301
// analysisJsonPath(dataDir, id): string                — store.ts:158  (write analysis.json directly with writeJsonAtomic)
```
Use `baseProject()`/`analysis()`/`bubble()` builder-function conventions from `server/test/review.test.ts:28-52` (copy these builders rather than re-inventing project/analysis fixtures) to construct the on-disk fixtures this route test writes into the temp dataDir. For attestations/pearlReviewAdds, write `<projectDir>/attestations.json` / `<projectDir>/pearlReviewAdds.json` directly as JSON matching `AttestationsFileSchema`/`PearlReviewAddsSchema` (both Zod-validated on read per Pattern 2 below — malformed input is safely ignored, not a test-breaking risk, but should still match shape).

**Temp-dataDir teardown pattern** (verbatim, from `server/test/reviewStore.test.ts:1-17`):
```typescript
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let dataDir: string;
beforeEach(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "studyloop-review-routes-"));
});
afterEach(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});
```

**Assertions to write (per Wave 0 gap + RESEARCH.md Open Question 1):**
- Un-attested pearl (no unitId link, not in `pearlReviewAdds`) is absent from `body.due`.
- Attested-unit-linked pearl IS present.
- Explicitly-added pearl (in `pearlReviewAdds` set) IS present even with no unit link.
- A legacy pre-gating `pearl:` card in `review.json` with `reps > 0` survives in `nextState.cards` (verify via a second `readReviewState(dataDir)` call after the request, NOT via the response body) but is absent from `body.due`.
- A legacy pre-gating `pearl:` card with `reps === 0` is fully dropped from `review.json`'s `cards` after the request.

**NEVER point `dataDir`/`STUDYLOOP_CONFIG_DIR` at the real `~/.studyloop` or `~/StudyLoopData`** — RESEARCH.md's Runtime State Inventory flags Ryan's real `review.json` has 12+ real due cards; this is a hard constraint carried into VALIDATION.md's Sampling Rate section too.

---

### `SPEC.md` F11 + V3-B B4 edits (documentation)

**Analog:** SPEC.md's own precedent, F11 "Implementation notes (deviations from the literal wording above)" (lines 489-501, read this session — reproduced in full above under Sources context).

**Pattern to copy:** A bulleted sub-section titled exactly `**Implementation notes (deviations from the literal wording above):**` immediately following the section it corrects, each bullet stating (a) what the shipped code actually does, (b) why, (c) optionally the field/response-shape delta. Do not rewrite the original prose above it — SPEC.md's own convention is additive/annotative, not a silent rewrite, so the original "Only from `source: 'model'` analyses" line in F11's Cards section stays, with a new bullet appended describing the attestation/explicit-add gate that's ALSO required.

**Concrete gate language to add** (grounded in `server/src/lib/review.ts:298-303`, quoted in RESEARCH.md's Pattern 1, and Common Pitfall #2's guidance to describe both paths distinctly):
- Path (a): pearl's linked unit (`pearl.unitId`) is feedable per `isUnitFeedable()` — i.e., attested, or has a non-empty `userTake` (bare-take counts even without formal "attested" status).
- Path (b): pearl was explicitly added via "Add to review" (`POST /api/projects/:id/pearls/:t/review-add`, persisted in `pearlReviewAdds.json`) — a distinct learner action, not an attestation, and should be named as such per Pitfall #2.

For V3-B B4, add one bullet noting "Attested units become reviewable as generation cards" (already-written line, unchanged) is joined with the pearl gate above — both are gated by the same `isUnitFeedable`/explicit-add logic in `deriveLiveCards`.

**Provenance to cite in the edit:** commit `813dc21` (2026-07-29) for the gate itself.

---

### `.planning/REQUIREMENTS.md` provenance notes

**Analog:** the file's own PIPE-01 entry (line 12, quoted in full above under grep output) — the established in-repo format for "already shipped before this requirements doc was authored" provenance.

**Pattern to copy verbatim structure:**
```
- [x] **GATE-01**: <one-line restatement of the requirement>. (Provenance: the gate landed on `main` in commit `813dc21` (2026-07-29, "fix: codex V3 wave review (scores, caches, races, pedagogy gating)"), before this requirements file was authored on 2026-08-09; Phase 3's actual delta against GATE-01 is regression coverage — a new route-level test in `server/test/reviewRoutes.test.ts` — not a behavior change.)
```
Apply the same shape to COMP-01/COMP-02, citing commit `468e0b8` (2026-08-08) instead. GATE-02 is the one entry that gets a *different* provenance note, since it names a genuine SPEC.md doc-only delta rather than "already shipped, needs no code" — cite the SPEC.md edit itself, not a commit hash (the commit hash belongs to the code that made SPEC.md stale, not to the fix).

## Shared Patterns

### Gate-then-schedule separation (do not re-derive)
**Source:** `server/src/lib/review.ts:298-303` (quoted in RESEARCH.md Pattern 1)
**Apply to:** Any new test or doc text describing "is this reviewable" — always reference `isUnitFeedable()` / `deriveLiveCards()`, never write a parallel description or check.
```typescript
const linkedUnitFeedable = p.unitId !== undefined && isUnitFeedable(attestations[p.unitId]);
const explicitlyAdded = pearlReviewAdds.has(pearlReviewKey(p.t));
if (!linkedUnitFeedable && !explicitlyAdded) continue;
```

### "Corruption never throws, rebuild empty" (file-store convention)
**Source:** `server/src/lib/reviewStore.ts:21-31` (quoted in full in RESEARCH.md Pattern 2)
**Apply to:** Any route-test fixture writing raw JSON directly to `attestations.json`/`pearlReviewAdds.json`/`review.json` — malformed shapes are safe to write (they'll silently rebuild empty), so a test asserting corruption-resilience end-to-end (optional stretch coverage) can lean on this without a try/catch.

### Temp-dataDir isolation, never real user data
**Source:** `server/test/reviewStore.test.ts:11-17` (mkdtemp/rm pattern) + `server/src/config.ts:130-141` (`STUDYLOOP_CONFIG_DIR` env seam)
**Apply to:** The new route-level test file exclusively. This is the single most important shared constraint in this phase — RESEARCH.md, VALIDATION.md, and STATE.md all independently flag Ryan's real `~/.studyloop`/`~/StudyLoopData` data as untouchable.

## No Analog Found

None. All three touch points (route test, SPEC.md edit, REQUIREMENTS.md edit) have exact in-repo precedent.

## Metadata

**Analog search scope:** `server/test/`, `server/src/routes/`, `server/src/lib/`, `server/src/config.ts`, `SPEC.md`, `.planning/REQUIREMENTS.md`
**Files scanned:** `server/test/youtube.test.ts`, `server/test/reviewStore.test.ts`, `server/test/review.test.ts`, `server/src/routes/review.ts`, `server/src/config.ts`, `server/src/lib/store.ts`, `SPEC.md` (lines 462-536, 655-675), `.planning/REQUIREMENTS.md` (lines 12-14, 55-119)
**Pattern extraction date:** 2026-08-10
