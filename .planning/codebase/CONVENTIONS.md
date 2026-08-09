# Coding Conventions

**Analysis Date:** 2026-08-09

## Naming Patterns

**Files:**
- Feature routes: `[feature]Routes` function name, e.g., `conceptsRoutes()` in `src/routes/concepts.ts`
- Test files: `[module].test.ts` or `[module].test.tsx` for unit tests, `[feature].spec.ts` for E2E
- Library modules: lowercase, descriptive names like `analysis.ts`, `conceptRegistry.ts`, `transcripts.ts`
- React components: PascalCase, e.g., `StudyView.tsx`, `TopBar.tsx`

**Functions:**
- camelCase for all functions (both sync and async)
- Descriptive, action-oriented names: `chunkTranscript()`, `evaluateNewUnit()`, `findActiveIndex()`
- Custom hooks prefixed with `use`: `useStudyLoopStore()`, `useEffect()`
- Helper functions at file scope (not exported if only used internally)
- Route handlers named clearly: `app.get("/api/path", async (request, reply) => { ... })`

**Variables:**
- camelCase for all local variables, state properties
- UPPERCASE for module-level constants: `CHUNK_WINDOW_SECONDS`, `TOAST_LIFETIME_MS`, `NOTES_AUTOSAVE_DEBOUNCE_MS`
- Booleans prefixed with `is`, `has`, `should`, `can`: `isUnitFeedable()`, `hasSeenAttentionLegend()`
- Descriptive names that explain intent: `reviewCounts`, `activeSegmentIndex`, `playbackFocus` rather than `counts`, `idx`, `focus`

**Types:**
- PascalCase for all types, interfaces, and schemas: `Pearl`, `AnalysisConcept`, `ReviewCard`
- Zod schemas with "Schema" suffix: `PearlSchema`, `AnalysisConceptSchema`, `ProjectIdParamSchema`
- Type imports using `import type { ... }` syntax
- Inferred types from Zod: `export type Pearl = z.infer<typeof PearlSchema>`

## Code Style

**Formatting:**
- No automatic formatter detected (no .prettierrc, .eslintrc config files)
- TypeScript configured with `strict: true` (implicit strict mode)
- All code uses ES2020+ syntax (web) and ES2022+ (server)
- Comments preferred over complex one-liners

**Linting:**
- React ESLint rules enforced inline via `// eslint-disable-next-line [rule] -- explanation`
- ESLint disable comments always accompanied by a detailed explanation of why
- Example: `// eslint-disable-next-line no-await-in-loop -- intentionally sequential: a failure must never race a concurrent success`

**Semicolons:**
- Semicolons consistently used throughout

**Spacing:**
- Two-space indentation observed throughout (typical Prettier default)
- Single blank lines between logical sections within functions
- Double blank lines separating top-level function/class definitions

## Import Organization

**Order:**
1. Node.js built-in modules: `import fs from "node:fs"`, `import path from "node:path"`
2. Third-party dependencies: `import { create } from "zustand"`, `import { z } from "zod"`
3. Local imports (relative): `import { api } from "../lib/api"`
4. Type imports (grouped or separated): `import type { Route } from "../lib/router"`

**Path Aliases:**
- No path aliases configured (no `tsconfig.json` `baseUrl` or `paths` observed)
- Relative imports used throughout: `../lib/`, `./`

**Module resolution:**
- `.js` extensions included in all ES module imports: `from "../lib/analysis.js"`
- TypeScript configured with `allowImportingTsExtensions: true` and `moduleResolution: "Bundler"`

## Error Handling

**Patterns:**
- Custom error classes extend `Error`: `class NoApiKeyError extends Error {}`, `class AnalysisRunError extends Error {}`
- Early returns in route handlers: `if (!params.success) return reply.status(400).send({ error: "..." })`
- Type guards with type casting: `const nodeErr = err as NodeJS.ErrnoException`
- Server main errors caught with explicit code checks: `if (nodeErr.code === "EADDRINUSE")`
- Web API errors wrapped in custom `ApiError` class (`lib/api.ts`)
- Errors in async functions thrown directly: `if (!auth) throw new NoApiKeyError()`
- Route validation via Zod `.safeParse()` with explicit error responses
- Network errors in effects handled with toast notifications

**Schema Validation:**
- All incoming request data validated with Zod schemas before use
- Example: `const params = IdParamSchema.safeParse(request.params)`
- Success path checked explicitly: `if (!params.success) return reply.status(400)`
- Parsed data accessed via `params.data`

## Logging

**Framework:** Fastify's built-in logger (available as `app.log`)

**Patterns:**
- Server: `app.log.info()`, `app.log.error()` for critical events
- Web: Direct `console.error()` at error boundaries (not used extensively)
- Timestamps handled via `formatTimestamp()` utility function
- Environment-specific logging (e.g., E2E fixtures logged to stdout/stderr)

## Comments

**When to Comment:**
- Every module file begins with a detailed comment explaining its purpose and design
- References to SPEC sections (e.g., "V2-C Analysis engine") and phase numbers (e.g., "Phase 4 Cluster unit type")
- Architectural decisions and rationale for non-obvious code paths
- Why validation must happen (e.g., "GET must not have write side effects")
- Timing/concurrency concerns explained (e.g., "must be fully on disk before the server's getConfig() ever reads it")

**JSDoc/TSDoc:**
- Minimal use of formal JSDoc; instead, block comments in plain English above functions
- Example: "Drags `locator` by (dx, dy) using real pointer events, starting from a point inside it that's ~8px from the edges"
- Complex data structures documented with comments explaining each field's purpose
- Comments above non-obvious algorithms (e.g., window/overlap calculation in `chunkTranscript()`)

**Inline Comments:**
- Explain "why", not "what" — code should be self-explanatory for "what"
- Used to clarify non-obvious dependencies (e.g., "Checked once per app load, not per-project")
- Explain spec references and design decisions (e.g., "Console slice A: the study view is a full-bleed stage")

## Function Design

**Size:** 
- Functions kept concise (most under 50 lines)
- Long functions broken into smaller helper functions
- Route handlers typically 15-30 lines with clear error paths

**Parameters:**
- Destructured object parameters for multiple values: `{ projectId, unitId }`
- Type-annotated parameters in all TypeScript functions
- Optional parameters marked with `?`: `overrides?: Partial<AnalysisUnit>`

**Return Values:**
- Explicit return type annotations on all function declarations
- Route handlers return response objects or use `.send()` explicitly
- Async functions always return `Promise<T>` with explicit type
- Utility functions return specific types (e.g., `Pearl`, `number`, `null`)

## Module Design

**Exports:**
- Named exports for utilities and functions: `export function chunkTranscript() { ... }`
- Default exports for route functions: `export async function conceptsRoutes(app: FastifyInstance) { ... }`
- Type exports: `export type ConceptRegistry = z.infer<typeof ConceptRegistrySchema>`
- Test utilities exported explicitly for mocking: `export function __setAnalysisClientForTests() { ... }`

**Barrel Files:**
- Not consistently used; imports typically point to specific modules
- Example: `import { api, ApiError } from "../lib/api"` rather than `from "../lib/"`

**Dependency Injection:**
- Interfaces defined for replaceable dependencies: `AnalysisLLMClient`, `CardTransformLLMClient`
- Adapter pattern used for testability (e.g., `LLMAnalysisClient` implements `AnalysisLLMClient`)
- Setter functions for test injection: `export function __setAnalysisClientForTests(client: AnalysisLLMClientV3) { ... }`
- Fake implementations provided alongside real ones: `FakeAnalysisClient`, `FakeCardTransformClient`

**Side Effects:**
- Grouped at module scope, clearly documented (timers, debounce functions)
- Module-level state management for non-serializable values (timers in `state/store.ts`)
- Explained with detailed comments: "Kept outside the store (not serializable state, and re-running them shouldn't trigger a re-render)"

## Constants & Configuration

**Environment Variables:**
- App-specific names with clear prefixes: `STUDYLOOP_PORT`, `STUDYLOOP_CONFIG_DIR`, `STUDYLOOP_FAKE_ANALYSIS`
- Generic `PORT` env var deliberately ignored (to avoid ambiguity in monorepo)
- Defaults provided via `??` operator: `Number(process.env.STUDYLOOP_PORT ?? 4600)`

**Magic Numbers:**
- Extracted as named constants: `CHUNK_WINDOW_SECONDS = 480`, `MERGE_SIMILARITY_THRESHOLD = 0.85`
- Explained with comments (e.g., "default 8min window / 1min overlap constants")

## Async/Await Patterns

- `void` used explicitly for promises that aren't awaited: `void loadHealth()`
- Sequential operations intentionally using loops with `await`: commented as "intentionally sequential"
- Top-level async entry points wrapped with `.catch()`: `main().catch((err) => { ... process.exit(1) })`
- Async effects in React always await or explicitly `void` the promise

## React/Zustand Patterns

- Custom hook for store access: `useStudyLoopStore((s) => s.property)`
- Destructuring from store in components to select only needed slices
- Effect dependencies carefully managed with inline comments explaining why certain dependencies are intentionally excluded
- Event handlers are arrow functions bound to the component scope

---

*Convention analysis: 2026-08-09*
