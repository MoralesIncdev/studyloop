# Codebase Structure

**Analysis Date:** 2026-08-09

## Directory Layout

```
studyloop/                    # Monorepo root (npm workspaces)
├── package.json             # Workspace definition, dev scripts (dev, build, start, test, e2e)
├── README.md                # User-facing quickstart + configuration guide
├── SPEC.md                  # Technical specification (build contract)
├── PLAN.md                  # Phase-based roadmap + feature descriptions
├── playwright.config.ts     # E2E test configuration (Playwright)
│
├── web/                     # Frontend (React + Vite, port 4601 dev / served by server prod)
│   ├── package.json         # Dev deps: @vitejs/plugin-react, vite, TypeScript, vitest
│   ├── vite.config.ts       # Vite dev server proxy (/api → localhost:4600), build config
│   ├── tsconfig.json        # TypeScript config for web
│   ├── vitest.config.ts     # Vitest test runner config
│   ├── dist/                # Build output (generated, git-ignored)
│   └── src/
│       ├── main.tsx         # Entry point: React.createRoot + mount App
│       ├── App.tsx          # Router: Library | Settings | Study | Review views
│       ├── index.css        # Global styles
│       ├── vite-env.d.ts    # Vite type definitions
│       │
│       ├── state/
│       │   ├── store.ts     # Zustand store (118KB): single source of truth for all app state
│       │   └── store.test.ts # Store unit tests (57KB)
│       │
│       ├── components/      # Global UI components
│       │   ├── TopBar.tsx   # Navigation bar (Library/Settings/Review badges)
│       │   ├── ModalShell.tsx # Modal wrapper (Z-index, click-outside)
│       │   ├── ToastHost.tsx # Toast notifications renderer
│       │   ├── Tooltip.tsx  # Tooltip component
│       │   └── icons.tsx    # Icon components (SVG)
│       │
│       ├── library/         # Library view (project list + settings)
│       │   ├── LibraryView.tsx # Project list, add project, rescan
│       │   ├── SettingsView.tsx # Configuration UI (roots, API keys)
│       │   └── *.module.css  # Scoped styles
│       │
│       ├── study/           # Study view (full-screen video player interface)
│       │   ├── StudyView.tsx # Main layout: player + right rail + bottom dock
│       │   ├── AnalyzeButton.tsx # "Analyze" button to trigger concept extraction
│       │   ├── CompileFlow.tsx # "Compile" modal + markdown preview
│       │   ├── DocumentView.tsx # Document mode (transcript + notes merged)
│       │   ├── DomainRow.tsx # Domain filter row (e.g., "all" / "techniques")
│       │   ├── RightRail.tsx # Accordion: Transcript | Concepts | Path sections
│       │   ├── BottomDock.tsx # Tabs: Notes | Bubbles (time-anchored captures)
│       │   └── *.module.css
│       │
│       ├── review/          # Review view (spaced-repetition flashcards)
│       │   ├── ReviewView.tsx # Flashcard loop (show/reveal/grade)
│       │   ├── ReviewBanner.tsx # Session progress bar + stats
│       │   ├── ReviewClipPlayer.tsx # Inline video clip for "Again" cards
│       │   └── *.module.css
│       │
│       ├── player/          # Video player (local or YouTube)
│       │   ├── VideoPlayer.tsx # <video> or <iframe>; playback controls, AB-loop
│       │   ├── AttentionPopover.tsx # Heatmap-derived attention visualization
│       │   ├── CCOverlay.tsx # Closed captions rendering
│       │   ├── ChaptersRail.tsx # Video chapters sidebar
│       │   ├── HeatmapStrip.tsx # Seek bar heatmap (red=attention peaks)
│       │   ├── KeymapOverlay.tsx # Keyboard shortcuts help modal
│       │   ├── PlayerHandle.tsx # Video ref + methods interface
│       │   └── types.ts     # PlayerHandle type definition
│       │
│       ├── concepts/        # Concept cards + merge queue
│       │   ├── ConceptTicker.tsx # Concepts slide in at their timestamp
│       │   ├── ConceptCard.tsx # Single concept card (title, metadata, actions)
│       │   ├── ConceptOverlay.tsx # Modal showing full concept + usage
│       │   ├── ConceptChipStrip.tsx # Inline concept chip selector
│       │   ├── ConceptsDock.tsx # Fullscreen concepts browser
│       │   ├── AnalysisSections.tsx # Analysis results breakdown (pearls, metadata)
│       │   ├── MergeQueuePanel.tsx # Merge candidates UI (V3-D concept consolidation)
│       │   └── *.module.css
│       │
│       ├── notes/           # Notes + time-anchored bubbles
│       │   ├── NotesPane.tsx # Long-running markdown notebook (autosave)
│       │   ├── NotationModal.tsx # Bubble creation modal (timestamp, text, screenshot)
│       │   ├── BubbleRail.tsx # Chronological list of captured bubbles
│       │   └── *.module.css
│       │
│       ├── transcript/      # Transcript sync + search
│       │   ├── TranscriptPane.tsx # Segment list (active highlight, auto-scroll)
│       │   ├── TranscriptSearch.tsx # Search in transcript
│       │   └── *.module.css
│       │
│       ├── console/         # Console mode (alternative UI layout)
│       │   ├── ConsoleView.tsx # Watch / Generate / Review modality toggle
│       │   └── *.module.css
│       │
│       └── lib/             # Utilities (60+ modules, 3500+ lines)
│           ├── types.ts     # Type definitions (Project, Bubble, ConceptCard, etc.)
│           ├── api.ts       # Typed fetch client (all /api/* calls)
│           ├── router.ts    # Hash-based routing (#/library, #/study/{id}, etc.)
│           ├── selectors.ts # Store selectors (activeSegment, activeConcepts, etc.)
│           │
│           ├── time.ts      # Timestamp formatting + parsing
│           ├── hotkeys.ts   # Keyboard binding helpers
│           ├── playbackRate.ts # Playback speed clamping (0.5x–2.5x)
│           │
│           ├── mining.ts    # Extract quoted text from transcript
│           ├── markdownLite.ts # Lightweight markdown rendering
│           ├── conceptFormat.ts # Format concept cards for display
│           ├── analysisFormat.ts # Format analysis results
│           ├── notesFormat.ts # Format notes + bubbles
│           │
│           ├── abLoop.ts    # A/B loop state machine + logic
│           ├── activeConcept.ts # Which concept is "active" at current time
│           ├── activeUnit.ts # Which study unit is active (domain filter)
│           ├── reviewClip.ts # Clip extraction for review card playback
│           ├── lapseTier.ts # How to tier card difficulty based on lapses
│           ├── suggestedCues.ts # Suggest timestamp cues in compose fields
│           │
│           ├── attentionHeatmap.ts # Parse heatmap marks, render visual
│           ├── heatmap.ts   # Heatmap generation from bubbles + concepts
│           ├── magnetism.ts # Snap playhead to nearby segment starts
│           ├── constellation.ts # Spatial layout of concept cards
│           │
│           ├── conceptLoop.ts # Concept queue state machine
│           ├── conceptChips.ts # Chip selection state for concepts
│           ├── conceptCabinet.ts # Collapsed/expanded state for concept sections
│           ├── captureCabinet.ts # Collapsed/expanded state for captures
│           │
│           ├── compileFlow.ts # Markdown compilation logic
│           ├── documentSurface.ts # Document mode (alternative view layout)
│           ├── documentOrder.ts # Ordering of transcript/notes in document
│           ├── consoleLayout.ts # Console pane collapse state
│           │
│           ├── reviewFrontDoor.ts # Auto-redirect to review if due work exists
│           ├── envelope.ts  # Text wrapping + truncation
│           ├── studyPath.ts # Study path/learning path logic
│           ├── safetyTier.ts # Content safety tier classification
│           ├── testPrompt.ts # Test prompt generation for review
│           ├── notationPrompts.ts # Elaboration prompt pool for notation
│           │
│           ├── *.test.ts    # Unit tests for above utilities
│           └── test/        # Shared test fixtures
│
├── server/                  # Backend (Fastify + Node.js, port 4600)
│   ├── package.json         # Deps: fastify, @fastify/{cors,multipart,static}, Anthropic SDK, zod
│   ├── tsconfig.json        # TypeScript config
│   ├── tsconfig.build.json  # Build-specific config (exclude tests)
│   ├── vitest.config.ts     # Vitest test runner
│   ├── lenses/              # Static lens definitions (JSON)
│   │   ├── bjj.json         # BJJ-specific lens (domain grouping)
│   │   └── …
│   ├── dist/                # Build output (generated, git-ignored)
│   │   └── lib/glossary/    # Copied static glossary data (build step)
│   └── src/
│       ├── index.ts         # Entry point: Bootstrap Fastify, register plugins + routes, listen
│       ├── config.ts        # Load/validate ~/.studyloop/config.json
│       │
│       ├── routes/          # API endpoint handlers (26+ modules)
│       │   ├── library.ts   # GET /api/library (project list), POST /api/library/rescan
│       │   ├── projects.ts  # CRUD: GET /id, POST, PATCH, DELETE + bubbles/notes CRUD
│       │   ├── video.ts     # GET /api/video/stream?path=… (range requests for local files)
│       │   ├── transcript.ts # GET /api/transcript?projectId=… (resolve via chain)
│       │   ├── concepts.ts  # GET /api/projects/:id/concepts (concept extraction)
│       │   ├── capture.ts   # POST /api/projects/:id/shots (ffmpeg frame grab)
│       │   ├── compile.ts   # POST /api/projects/:id/compile (markdown generation)
│       │   ├── youtube.ts   # POST /api/youtube/resolve (yt-dlp metadata + captions)
│       │   ├── analyze.ts   # POST/GET /api/projects/:id/analyze (concept analysis)
│       │   ├── heatmap.ts   # GET /api/projects/:id/heatmap (attention visualization)
│       │   ├── reveal.ts    # POST /api/projects/:id/reveal (open in Finder)
│       │   ├── search.ts    # GET /api/search?q=… (across projects)
│       │   ├── config.ts    # GET/PUT /api/config (read/save settings)
│       │   ├── media.ts     # Stream media files (audio, video)
│       │   ├── thumb.ts     # Generate video thumbnails
│       │   ├── review.ts    # GET /api/review/queue, POST /api/review/grade
│       │   ├── reviewExport.ts # Export review session
│       │   ├── attestation.ts # Attestation + verification
│       │   ├── continuity.ts # Continuity + session state
│       │   ├── pearlReview.ts # Pearl (concept) review
│       │   ├── registry.ts  # Concept registry operations
│       │   ├── terms.ts     # Custom flashcard terms
│       │   ├── slides.ts    # PDF slide extraction + management
│       │   ├── lenses.ts    # Lens (UI mode) data
│       │   └── transcribe.ts # Bring-your-own ASR adapter
│       │
│       └── lib/             # Business logic (50+ modules, 10,000+ lines)
│           ├── store.ts     # Project file I/O + locking (core persistence layer)
│           ├── models.ts    # Zod schemas + TypeScript types
│           ├── paths.ts     # Path validation + canonicalization
│           │
│           ├── scan.ts      # Directory scanner (find video + transcript files)
│           ├── transcripts.ts # Load .json/.srt/.vtt transcripts + normalize
│           ├── concepts.ts  # Parse concept documents (profiles: bjj, headings, etc.)
│           ├── frames.ts    # ffmpeg frame extraction at timestamp
│           │
│           ├── analysis.ts  # Concept analysis + extraction
│           ├── analysisAccess.ts # Access control for analysis data
│           ├── analysisJobs.ts # Async analysis job queue
│           ├── heatmap.ts   # Attention heatmap generation
│           ├── overlayDiff.ts # Detect concept overlay changes
│           │
│           ├── review.ts    # Spaced-repetition scheduling (SM-2)
│           ├── reviewStore.ts # Review data persistence
│           ├── reviewExport.ts # Export review session to JSON
│           ├── cardTransform.ts # Transform bubbles/concepts to review cards
│           │
│           ├── compileRenderer.ts # Markdown compilation (notes + bubbles + concepts)
│           ├── reveal.ts    # Open project folder in Finder
│           ├── search.ts    # Full-text search across projects
│           │
│           ├── asr.ts       # ASR integration (Anthropic, external)
│           ├── asrCommand.ts # Run external ASR command
│           ├── asrJobs.ts   # ASR job queue + state
│           ├── transcribeRoutes.ts # Bring-your-own ASR handler (Phase 11)
│           │
│           ├── ytdlp.ts     # yt-dlp wrapper (YouTube metadata, captions, streams)
│           ├── innertube.ts # YouTube API via innertube
│           ├── thumbnails.ts # YouTube thumbnail extraction
│           │
│           ├── conceptRegistry.ts # Concept registry interface
│           ├── conceptRegistryStore.ts # Concept registry persistence
│           ├── concepts.ts  # Concept parsing + merging
│           ├── mergeConceptRationales.ts # Concept merge logic
│           │
│           ├── slides.ts    # PDF slide extraction + rendering
│           ├── pdf-parse-lib.d.ts # Type definitions for pdf-parse
│           │
│           ├── terms.ts     # Custom flashcard terms
│           ├── attestation.ts # Attestation generation
│           ├── attestationStore.ts # Attestation data persistence
│           │
│           ├── continuity.ts # Session continuity + state
│           ├── continuityService.ts # Continuity service implementation
│           │
│           ├── pearlReviewStore.ts # Pearl review data
│           │
│           ├── lenses.ts    # Lens definitions + validation
│           ├── shareBundle.ts # Share/export bundle creation
│           │
│           ├── ffprobe.ts   # Video metadata extraction
│           ├── health.ts    # System health check (ffmpeg, yt-dlp availability)
│           ├── time.ts      # Timestamp utilities
│           ├── titleHumanize.ts # Humanize title from path
│           ├── glossary/    # Domain-specific glossaries (JSON)
│           │
│           ├── sidecar.ts   # Sidecar file handling
│           ├── transcriptChain.ts # Multi-source transcript resolution
│           ├── transcriptResolve.ts # Transcript chain orchestration
│           ├── libraryScanCache.ts # Cache library scan results
│           │
│           ├── providers.ts # Provider integration (APIs, SDKs)
│           ├── models.ts    # AI model configuration
│           │
│           ├── *.test.ts    # Unit tests
│           └── test/fixtures/ # Test fixtures
│
├── e2e/                     # End-to-end tests (Playwright)
│   ├── console-smoke.spec.ts # Smoke test for study view
│   └── fixtures/            # Test data
│
├── docs/                    # Documentation
│   ├── API.md              # API endpoint reference
│   ├── PHASES.md           # Phase-based feature timeline
│   └── …
│
├── design/                  # Design assets + mockups
│   └── * (not code)
│
├── graphify-out/           # Codebase dependency graph (generated)
│   └── * (git-ignored during active development)
│
├── projects/               # Example/test projects (git-ignored)
│   └── * (test data)
│
├── .github/                # GitHub workflows + actions
│   └── workflows/          # CI/CD pipelines
│
├── test-results/           # Test output (git-ignored)
│   └── *
│
├── node_modules/           # Dependencies (git-ignored)
│   └── *
│
└── .planning/              # Planning directory (for gsd-* agents)
    └── codebase/           # This directory (ARCHITECTURE.md, STRUCTURE.md, etc.)
```

## Directory Purposes

**`web/src/`** — Frontend application code (React components, Zustand store, utilities)
- Contains all user-facing UI
- Entry point: `main.tsx` mounts App.tsx
- State management: `state/store.ts` (118KB Zustand store)
- Utilities: `lib/` folder with 60+ helper modules

**`server/src/`** — Backend API server (Fastify routes, business logic)
- Entry point: `index.ts` bootstraps Fastify and registers routes
- Routes: `routes/` folder with 26+ endpoint handlers
- Logic: `lib/` folder with persistence, parsing, algorithms

**`server/src/lib/store.ts`** — Core persistence layer
- All project file I/O (read/write project.json, notes.md, bubbles.json)
- Handles file locking to prevent concurrent write corruption
- Used by all route handlers when mutating project state

**`web/src/state/store.ts`** — Zustand store (client state)
- Single source of truth for all UI state: route, playback, projects, review queue, etc.
- All async operations dispatch through store (call API, update state, emit toasts)
- 118KB; organized in sections (routing, library, config, projects, study, review, etc.)

**`e2e/`** — End-to-end tests (Playwright)
- Smoke test of study view workflow
- Test fixtures for reference projects

## Key File Locations

**Entry Points:**
- `web/src/main.tsx`: Web app bootstrap (React mount)
- `web/src/App.tsx`: Router + view selection
- `server/src/index.ts`: Fastify bootstrap + route registration

**Configuration:**
- `server/src/config.ts`: Load ~/.studyloop/config.json, validate, expand paths
- `web/vite.config.ts`: Dev server proxy, build config
- `server/src/index.ts`: HTTP server configuration (CORS, port, host)

**Core Logic:**
- `web/src/state/store.ts`: All app state + actions
- `server/src/lib/store.ts`: Project persistence + locking
- `server/src/lib/transcripts.ts`: Transcript resolution chain
- `server/src/lib/concepts.ts`: Concept document parsing
- `server/src/lib/analysis.ts`: Concept analysis + extraction
- `server/src/lib/review.ts`: Spaced-repetition scheduling
- `server/src/lib/compileRenderer.ts`: Markdown compilation

**Testing:**
- `web/src/state/store.test.ts`: Store unit tests (57KB)
- `server/src/lib/*.test.ts`: Business logic unit tests
- `e2e/console-smoke.spec.ts`: E2E smoke test

**Type Definitions:**
- `web/src/lib/types.ts`: All TypeScript interfaces (Project, Bubble, ConceptCard, etc.)
- `server/src/lib/models.ts`: Zod schemas + TypeScript types

## Naming Conventions

**Files:**
- Components: PascalCase + `.tsx` (e.g., `StudyView.tsx`, `VideoPlayer.tsx`)
- Utilities: camelCase + `.ts` (e.g., `time.ts`, `router.ts`)
- Styles: `FileName.module.css` (CSS modules, scoped to component)
- Tests: `fileName.test.ts` or `fileName.spec.ts`
- Routes: kebab-case domain names + `.ts` (e.g., `projects.ts`, `youtube.ts`)

**Directories:**
- Feature domains: lowercase plural (e.g., `notes/`, `concepts/`, `routes/`)
- Utilities: `lib/` (general logic), `lib/glossary/` (data)
- Types: inline in modules or in `lib/types.ts`
- Tests: `test/` subdirectory or adjacent `*.test.ts` files

**Functions & Variables:**
- camelCase for functions, variables, properties
- CONSTANT_CASE for constants
- PascalCase for types, interfaces, React components

**Types:**
- Request bodies: `CreateProjectBody`, `PatchProjectBodySchema` (Zod schema prefix)
- Responses: `LibraryResponse`, `TranscriptResponse`
- Store slices: `StudyLoopStore` (main), then sub-interfaces (`ReviewSessionState`, etc.)

## Where to Add New Code

**New Feature Endpoint (e.g., "/api/new-thing"):**
1. Create `server/src/routes/newThing.ts` with route handler (export async function)
2. Import and register in `server/src/index.ts` → `await app.register(newThingRoutes)`
3. Add request/response schemas to `server/src/lib/models.ts` (Zod)
4. Add API client function to `web/src/lib/api.ts`
5. Add TypeScript type to `web/src/lib/types.ts` (if not in models)
6. Call from store actions in `web/src/state/store.ts`

**New React Component:**
1. Create `web/src/{feature}/{ComponentName}.tsx` (feature-scoped)
2. Create `web/src/{feature}/{ComponentName}.module.css` (if styling needed)
3. Import and use in parent component
4. Subscribe to store selectors for state
5. Dispatch store actions for mutations
6. Add unit tests in `ComponentName.test.ts` if testable in isolation

**New Business Logic / Utility:**
1. Create `server/src/lib/newThing.ts` (backend logic) or `web/src/lib/newThing.ts` (frontend utility)
2. Export functions, types, constants
3. Add unit tests in `newThing.test.ts`
4. Import and use in routes/components/store

**New Test Fixture / Data:**
1. Create in `e2e/fixtures/` (for E2E) or `server/test/fixtures/` (for unit tests)
2. Reference in test files

## Special Directories

**`dist/` (web and server):**
- Purpose: Compiled JavaScript + CSS (generated by build)
- Generated: Yes, by `npm run build`
- Committed: No, git-ignored
- Cleanup: `npm run clean` (if that script exists) or `rm -rf dist/`

**`node_modules/`:**
- Purpose: Installed dependencies
- Generated: Yes, by `npm install`
- Committed: No, git-ignored

**`.planning/codebase/`:**
- Purpose: GSD (Get Stuff Done) agent planning documents
- Contains: ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, CONCERNS.md
- Committed: Yes (generated by `/gsd-map-codebase` agent)

**`graphify-out/`:**
- Purpose: Codebase dependency graph (generated by `/graphify` tool)
- Generated: Yes, by `npx graphify` or equivalent
- Committed: Sometimes (useful for documentation, but can be regenerated)

**`projects/` (test data):**
- Purpose: Example/test projects for development + testing
- Generated: Partially (some committed as fixtures, others created during testing)
- Committed: Only stable fixtures; test-created projects are git-ignored

**`server/lenses/` (static data):**
- Purpose: Static lens definitions (JSON) that don't change per project
- Format: `{lensId}.json` files with schema defining study surface layout
- Committed: Yes (part of app static data)
- Used by: Concept extraction + rendering to apply domain-specific formatting

---

*Structure analysis: 2026-08-09*
