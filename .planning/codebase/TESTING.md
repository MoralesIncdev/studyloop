# Testing Patterns

**Analysis Date:** 2026-08-09

## Test Framework

**Runner:**
- Server: Vitest 1.6.0 (`server/package.json`)
- Web: Vitest (installed as devDependency in root)
- E2E: Playwright 1.62.1 (`server/package.json`)
- Config: `server/vitest.config.ts`, `web/vitest.config.ts`, `playwright.config.ts`

**Assertion Library:**
- Vitest built-in `expect()` (compatible with Jest)
- Playwright's `expect()` for E2E assertions

**Run Commands:**
```bash
npm test                    # Run all tests (server + web)
npm run test -w server      # Server tests only
npm run test -w web         # Web tests only
npm run e2e                 # E2E tests via Playwright
```

## Test File Organization

**Location:**
- Server: co-located in `server/test/[module].test.ts`
- Web: co-located in `web/src/lib/[module].test.ts` or `web/src/state/[module].test.ts`
- E2E: `e2e/[feature].spec.ts`

**Naming:**
- Unit tests: `[module].test.ts` (Vitest pattern)
- Integration/E2E: `[feature].spec.ts` (Playwright pattern)

**Vitest Configuration:**
- Server: `{ environment: "node", include: ["test/**/*.test.ts"] }`
- Web: `{ environment: "node", include: ["src/**/*.test.ts"] }`
  - Note: Web tests run in Node environment (no DOM by default; can use jsdom if needed)

## Test Structure

**Suite Organization:**
```typescript
// server/test/conceptRegistry.test.ts
import { describe, expect, it } from "vitest";
import {
  emptyConceptRegistry,
  evaluateNewUnit,
  // ... imports
} from "../src/lib/conceptRegistry.js";

describe("firstSentence", () => {
  it("takes everything up to and including the first terminator", () => {
    expect(firstSentence("First bit. Second bit.")).toBe("First bit.");
  });
});

describe("evaluateNewUnit — exact fingerprint match", () => {
  it("auto-merges a non-BOUNDARY, non-threshold unit...", () => {
    // test logic
  });
});
```

**Patterns:**
- Top-level `describe()` blocks group related tests by function or feature
- Test names are descriptive sentences: "auto-merges a non-BOUNDARY, non-threshold unit..."
- One assertion per test (or tightly related assertions testing the same behavior)
- Setup/teardown handled via `beforeEach()` / `afterEach()` hooks where needed

## Mocking

**Framework:** Vitest built-in module mocking (import substitution)

**Patterns:**

### Dependency Injection Pattern
Most complex modules (analysis, card transforms, lens generation) use dependency injection instead of traditional mocks:

```typescript
// In lib/analysis.ts
let injectedClientForTestsV3: AnalysisLLMClientV3 | null = null;

export function __setAnalysisClientForTests(client: AnalysisLLMClientV3): void {
  injectedClientForTestsV3 = client;
}

// In test/analysis.test.ts
const client = new FakeAnalysisClient();
const result = await client.runChunk(chunk, "claude-opus-5");
```

**Fake Implementations:**
- Classes implementing the same interface as real clients
- Example: `FakeAnalysisClient implements AnalysisLLMClient, AnalysisLLMClientV3`
- Deterministic output for reproducible tests
- Located in same file as real implementation (e.g., `analysis.ts` exports both)

**What to Mock:**
- LLM API clients (use Fake implementations)
- Filesystem operations (read actual test data files instead)
- Network requests in route handlers (use `.safeParse()` validation instead of mocking HTTP)
- Timers (use `vi.useFakeTimers()` if needed, but not commonly seen in codebase)

**What NOT to Mock:**
- Pure utility functions (test them directly)
- Data validation via Zod (test with real schemas)
- Filesystem reads for test fixtures (commit test data files)
- Core business logic (always test real implementations)

## Fixtures and Factories

**Test Data:**

### Factory Functions at Top of Test Files
```typescript
// server/test/conceptRegistry.test.ts
function unit(overrides: Partial<AnalysisUnit> = {}): AnalysisUnit {
  return {
    id: "u1",
    type: "MECHANISM",
    label: "Posture Control",
    summary: "Controlling posture stabilizes the position.",
    body: "b",
    anchors: [],
    confidence: 0.8,
    threshold: false,
    ...overrides,
  };
}

let idCounter = 0;
function newId(): string {
  idCounter += 1;
  return `id-${idCounter}`;
}
```

### Test Segment/Chunk Factories
```typescript
// server/test/analysis.test.ts
function segment(start: number, end: number, text = "word"): TranscriptSegment {
  return { start, end, text };
}
```

**Location:**
- Fixtures defined at top of test file (inline helpers)
- Shared fixtures could live in `test/fixtures/` (not observed in codebase, but pattern available)
- E2E test data: `e2e/fixtures/seed.mjs` generates a complete disposable test environment

## Coverage

**Requirements:** Not enforced (no coverage threshold found in vitest/playwright config)

**View Coverage:** 
```bash
npm run test -- --coverage  # If configured (not found in current setup)
```

## Test Types

**Unit Tests:**
- Scope: Single pure functions, small modules with no external dependencies
- Approach: Direct imports, helper functions for test data creation
- Example: `chunkTranscript()` logic tests in `server/test/analysis.test.ts`
- Deterministic: All inputs and outputs are known, no network/file I/O

**Integration Tests:**
- Scope: Multiple modules interacting, real Zod validation, dependency injection
- Approach: Real implementations of collaborating modules, fake external clients
- Example: `evaluateNewUnit()` tests that use real `ConceptRegistry` logic with various unit types
- Deterministic: Controlled via fake implementations of external dependencies

**E2E Tests:**
- Scope: Full system from browser through server to fixture data
- Framework: Playwright (browser automation)
- Approach: Real servers (seeded with `e2e/fixtures/seed.mjs`), real web UI
- Example: `console-smoke.spec.ts` tests pane drag-and-drop, button clicks, navigation
- Deterministic: Seeded with fixed fixture data; fixture must be built before server starts

### E2E Test Infrastructure

**Fixture Setup:** `e2e/fixtures/seed.mjs`
- Creates a temporary config directory
- Builds disposable project data
- Runs on separate port pair (4610/4611) to never collide with `npm run dev`
- Generated once before both server and web dev processes start

**Playwright Configuration:**
```typescript
// playwright.config.ts
webServer: [
  {
    command: `node e2e/fixtures/seed.mjs && npm run dev -w server`,
    url: `http://127.0.0.1:${SERVER_PORT}/api/health`,
    timeout: WEB_SERVER_BOOT_TIMEOUT_MS,
  },
  // web server separately configured
]
```

## Common Patterns

**Async Testing:**
```typescript
// server/test/analysis.test.ts
it("is deterministic — the same chunk input produces byte-identical output", async () => {
  const client = new FakeAnalysisClient();
  const chunk: TranscriptChunk = { index: 0, startSec: 0, endSec: 480, text: "..." };
  const first = await client.runChunk(chunk, "claude-opus-5");
  const second = await client.runChunk(chunk, "claude-opus-5");
  expect(first).toEqual(second);
});
```

**Error Testing:**
```typescript
// server/test/analysis.test.ts
it("throws for a non-positive window", () => {
  expect(() => chunkTranscript([segment(0, 10)], 0, 0)).toThrow();
});

it("throws when overlap is >= window", () => {
  expect(() => chunkTranscript([segment(0, 10)], 480, 480)).toThrow();
});
```

**Assertion Types:**
- Equality: `expect(value).toBe(expected)`, `expect(array).toEqual([...])`
- Ranges: `expect(value).toBeGreaterThanOrEqual(5)`, `expect(value).toBeLessThan(10)`
- Closeness: `expect(float).toBeCloseTo(0.857)` for floating-point math
- Collections: `expect(array).toHaveLength(3)`, `expect(set).toContainEqual(item)`
- Object shape: `expect(object).toMatchObject({ x: 1, y: 2 })`

**Type Guards in Tests:**
```typescript
// server/test/analysis.test.ts
const result = await client.runChunk(chunk, "claude-opus-5");
expect(result.kind).toBe("ok");
if (result.kind !== "ok") throw new Error("unreachable");
// Now TypeScript knows result.data exists
expect(result.data.pearls[0].t).toBeGreaterThanOrEqual(chunk.startSec);
```

## Testing Best Practices Observed

**1. Deterministic Fake Implementations**
- `FakeAnalysisClient` uses input hashing to produce deterministic output
- Enables reliable assertions on generated content without mocking external services

**2. Helper Functions Over Test Utilities**
- Factories for test data (`unit()`, `segment()`) defined inline in test files
- Keeps test setup clear and colocated with assertions

**3. Explicit Error Paths**
- Every error case tested separately: non-positive window, overlap >= window, etc.
- Route handlers tested with invalid inputs: `.safeParse()` failures

**4. Round-Trip Testing**
- Format/parse pairs tested together: `expect(parseTimestamp(formatTimestamp(1870))).toBe(1870)`
- Ensures codec symmetry

**5. Edge Cases**
- Empty inputs: `expect(chunkTranscript([])).toEqual([])`
- Boundary conditions: "exactly one chunk for transcript shorter than one window"
- Out-of-range values: "returns -1 when t is before the first item"

**6. Comments Explaining Test Logic**
```typescript
// 3 windows' worth at the default stride (480-60=420s stride), so
// windowStart should land at 0, 420, 840 before the transcript ends.
const totalEnd = 1000;
const segments: TranscriptSegment[] = [];
for (let t = 0; t < totalEnd; t += 5) segments.push(segment(t, t + 5));
const chunks = chunkTranscript(segments, 480, 60);
```

## E2E Test Patterns

**Selectors:**
- Uses stable attributes from source: `aria-label`, `role`, `data-pane`, `title`
- No `data-testid` added to source code for these tests
- Avoids brittle CSS selector chains

**Interaction Helpers:**
```typescript
// e2e/console-smoke.spec.ts
async function dragBy(page: Page, locator: Locator, dx: number, dy: number) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("dragBy: locator has no box");
  // ... drag logic with safe edge offsets
}
```

**Assertions on Effects:**
- Tests concrete state changes caused by actions, not just "no exception"
- Example: "mode toggle should change the pane's class (bare<->glassy)"
- Uses `.poll()` for async state changes: `await expect.poll(() => video.paused).toBe(true)`

## Test Counts

**Server:** 30+ test files (`server/test/*.test.ts`)
- Core logic modules: analysis, concepts, continuity, review, transcripts, etc.
- Routes: implicitly tested via lib modules

**Web:** 32+ test files (`web/src/lib/*.test.ts` + `web/src/state/*.test.ts`)
- Utility functions: time, mining, layout, selection logic
- State interactions

**E2E:** 1 smoke test (`e2e/console-smoke.spec.ts`)
- Multi-pane console interaction on real fixture data

---

*Testing analysis: 2026-08-09*
