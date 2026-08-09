<!-- refreshed: 2026-08-09 -->
# Architecture

**Analysis Date:** 2026-08-09

## System Overview

StudyLoop is a two-tier web application for deep study of long-form video (local files or YouTube):

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                    Web Frontend (React + Vite)                           │
│  Router → LibraryView | SettingsView | StudyView | ReviewView           │
│  `web/src/App.tsx`                                                      │
├────────────────────────────────────────┬────────────────────────────────┤
│  Zustand Store (state/store.ts)        │  Components & Features          │
│  - Route                               │  - player/      (VideoPlayer)   │
│  - Projects & Sessions                 │  - concepts/    (ConceptCards)  │
│  - Playback (time, rate, position)     │  - notes/       (Bubbles, MD)   │
│  - Review queue & metrics              │  - transcript/  (Sync to video) │
│  - Library state                       │  - review/      (Flashcards)   │
│  - Analysis & compile status           │  - library/     (Project list)  │
└────────────────────────────────────────┴────────────────────────────────┘
                    ↓ fetch("/api/*") ↑
                    (JSON over HTTP)
┌─────────────────────────────────────────────────────────────────────────┐
│              Fastify Server (Node.js + TypeScript)                       │
│  Routes: /api/{projects,video,transcript,concepts,capture,…}            │
│  `server/src/index.ts`                                                  │
├──────────────────────────────────────────────────────────────────────────┤
│  Request Handlers (routes/*.ts)                                          │
│  - CRUD: projects, bubbles, notes                                        │
│  - Streaming: video, audio                                               │
│  - Transcripts: file lookup, YouTube caption pull, ASR                   │
│  - Analysis: concept extraction, concept merge, heatmap                  │
│  - Export: compile markdown, review export, attestation                  │
│  - Auxiliary: search, health, config, terms, slides, lenses              │
└──────────────────────────────────────────────────────────────────────────┘
                    ↓ read/write ↑
                 (Filesystem)
┌─────────────────────────────────────────────────────────────────────────┐
│  Data Storage (Local-first, file-based)                                  │
│                                                                           │
│  ~/.studyloop/                                                           │
│  ├─ config.json          (library roots, transcript roots, API keys)     │
│  └─ projects/            (project folders)                               │
│     └─ {projectId}/                                                      │
│        ├─ project.json   (metadata: title, source, transcript, concepts) │
│        ├─ notes.md       (long-running markdown notebook)                │
│        ├─ bubbles.json   ([{ id, t, text, shot?, createdAt }])          │
│        ├─ captions.json  (YouTube captions if available)                 │
│        ├─ shots/         (JPEG frames from bubble captures)              │
│        ├─ analysis.json  (concept extraction results)                    │
│        └─ …              (other generated data)                          │
│                                                                           │
│  /projects                (project data scanned on startup, refreshed)   │
│  └─ {projectId}/          (local media files, external transcripts)      │
└─────────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Router | Parse hash-based route, navigate between views | `web/src/lib/router.ts` |
| LibraryView | Project list, scan results, settings link | `web/src/library/LibraryView.tsx` |
| StudyView | Full-screen study layout (player + rails) | `web/src/study/StudyView.tsx` |
| ReviewView | Spaced-repetition flashcard interface | `web/src/review/ReviewView.tsx` |
| SettingsView | Configuration UI (library roots, API keys) | `web/src/library/SettingsView.tsx` |
| VideoPlayer | Local video or YouTube iframe, playback controls | `web/src/player/VideoPlayer.tsx` |
| TranscriptPane | Synced transcript, segment highlight, search | `web/src/transcript/TranscriptPane.tsx` |
| ConceptTicker | Concept cards slide in at cited timestamps | `web/src/concepts/ConceptTicker.tsx` |
| BubbleRail | Time-anchored notes with optional screenshots | `web/src/notes/BubbleRail.tsx` |
| NotesPane | Long-running markdown notebook | `web/src/notes/NotesPane.tsx` |
| Store | Zustand single source of truth | `web/src/state/store.ts` |
| API Client | Typed fetch wrapper, error handling | `web/src/lib/api.ts` |
| Fastify Server | HTTP handler, CORS, static file serving | `server/src/index.ts` |
| Route Handlers | API endpoint logic per domain | `server/src/routes/*.ts` |
| Project Store | Read/write project files with locking | `server/src/lib/store.ts` |
| Transcript Loader | Parse .json/.srt/.vtt, resolve via YouTube | `server/src/lib/transcripts.ts` |
| Concept Parser | Extract concepts from attached document | `server/src/lib/concepts.ts` |
| Frame Extraction | Capture video frame at timestamp via ffmpeg | `server/src/lib/frames.ts` |

## Pattern Overview

**Overall:** Two-tier local-first web app with file-based persistence and no authentication.

**Key Characteristics:**
- **Stateless server** — no sessions, memory, or database; every API call reads/writes project files
- **Single store** — Zustand manages all client state; components read selectors, dispatch actions that call API
- **Project-scoped sessions** — each project folder is independent; watch progress/notes/analysis kept in separate JSON files
- **Hash-based routing** — SPA with `#/library`, `#/study/{id}`, `#/review`, no server-side routing
- **Keyboard-first UI** — hotkeys for playback (J/K/L shuttle), AB-loop, capture, notation
- **Graceful degradation** — optional dependencies (ffmpeg, yt-dlp) disable features with tooltips rather than crashing

## Layers

**Web Layer (React + Vite):**
- Purpose: Render UI, handle user input, display data from API
- Location: `web/src/`
- Contains: Components, hooks, Zustand store, utility library, API client
- Depends on: Fastify server (localhost:4600)
- Used by: End user via browser

**API Layer (Fastify + routes):**
- Purpose: HTTP endpoint logic; validate requests, call business logic, serialize responses
- Location: `server/src/routes/`
- Contains: 26+ route modules (one per feature domain)
- Depends on: Server lib, file system
- Used by: Web frontend via fetch()

**Business Logic Layer (server/lib):**
- Purpose: Core algorithms — concept extraction, heatmap generation, transcript resolution, analysis compilation
- Location: `server/src/lib/`
- Contains: Algorithms, parsers, validators, analysis jobs, ASR integration, Anthropic SDK wrapper
- Depends on: File system, external tools (ffmpeg, yt-dlp)
- Used by: Route handlers

**Persistence Layer (file system):**
- Purpose: Durable storage — projects, notes, bubbles, screenshots, analysis
- Location: `~/.studyloop/config.json` + `~/.studyloop/projects/{id}/`
- Contains: JSON, markdown, JPEG
- Depends on: OS file system
- Used by: Server lib (via store.ts)

**Client Utilities (web/src/lib):**
- Purpose: Type definitions, API client, formatting, selection logic, UI helpers
- Location: `web/src/lib/`
- Contains: Types, API client, timestamp formatting, concept selectors, analysis formatting, hotkey bindings
- Used by: Components and store

## Data Flow

### Primary Request Path: Watch a Video

1. User clicks a project in library (`LibraryView`) → calls `store.loadProjectSession(projectId)` 
2. Store dispatches GET `/api/projects/{id}` → Fastify route `routes/projects.ts` reads `project.json`
3. Fastify returns Project; store hydrates all session state (playback position, notes, bubbles)
4. Store calls GET `/api/transcript?projectId={id}` → `routes/transcript.ts` resolves transcript (file, sidecar, or YouTube)
5. Store calls GET `/api/projects/{id}/concepts` → `routes/concepts.ts` reads attached concept document
6. Store calls GET `/api/projects/{id}/analysis` → `routes/analyze.ts` returns latest analysis (if exists)
7. `StudyView` mounts with player + transcript + concepts + notes
8. As video plays, store updates `currentTime` via player ref
9. Components subscribe to `activeSegment`, `activeConcepts`, `visibleBubbles` selectors
10. User pauses, captures screenshot → POST `/api/projects/{id}/shots` → `routes/capture.ts` calls `frames.ts` → ffmpeg extracts frame → writes `shots/shot-{t}.jpg` → returns URL
11. User clicks notation modal Save → store calls POST `/api/projects/{id}/bubbles` → `routes/projects.ts` writes to `bubbles.json`
12. User navigates away → store calls `flushNotes()` → POST `/api/projects/{id}/notes` → `routes/projects.ts` writes `notes.md`

### Secondary Flow: Compile Study Document

1. User clicks Compile button in `StudyView` → store calls POST `/api/projects/{id}/compile`
2. `routes/compile.ts` calls `lib/compileRenderer.ts` → reads project.json, notes.md, bubbles.json, concepts, analysis
3. Merges all data into single markdown file with timestamp links, inline concept cards, screenshot embeds
4. Returns markdown + preview HTML
5. User clicks Copy or Reveal → `CompileFlow.tsx` handles clipboard/file opening

### Tertiary Flow: Review Flashcards

1. User navigates to ReviewView → store calls GET `/api/review/queue`
2. `routes/review.ts` checks spaced-repetition schedule, loads due cards
3. User grades "Got it" or "Again" → POST `/api/review/grade` → updates metrics, schedules next interval
4. Store refreshes review queue periodically, updates badge counts
5. At any time, user can navigate back to library or study a project directly

**State Management:**
- Zustand store is single source of truth; all async operations (`loadProjectSession`, `gradeReviewCard`, etc.) dispatch through store
- Component state (NotationModal, CompileFlow preview) kept local when not needed globally
- localStorage persists user preferences (CC toggle per project, rail section collapse state)
- sessionStorage guards "redirect to review if due work exists" so it only triggers once per browser session

## Key Abstractions

**Project:**
- Metadata (`project.json`) containing id, title, source (local file path or YouTube video ID), transcript type, concept doc reference
- Session data (playback position, watch progress, notes, bubbles)
- Persisted in `~/.studyloop/projects/{id}/` as separate JSON files
- Pattern: Fetch on demand, mutation writes back immediately via `withProjectLock()` to avoid concurrent writes

**Bubble (Time-Anchored Note):**
- `{ id, t (seconds), text, shot?: "shots/{filename}.jpg", createdAt }`
- Rendered as pins on heatmap, chronological rail, mentioned in compile output
- Created via NotationModal after optional screenshot capture
- Pattern: Append-only in `bubbles.json` (no update/delete in core; merge-concept mechanism handles removal)

**Concept:**
- Extracted from attached document (concept-doc) using profile-specific parser
- Contains `{ title, t (start timestamp), durationMs, level, parentId?, ...metadata }`
- Displayed as cards at active time; cached in `analysis.json` after extraction
- Pattern: Lazy extraction via POST `/api/projects/{id}/analyze` → runs async job, returns status/result

**Analysis (Concept + Heatmap + Metadata):**
- `{ pearls: ConceptCard[], heatmapMarks: HeatmapMark[], metadata, ... }`
- Generated by Anthropic API (optional) or profile parser
- Cached in `analysis.json` per project
- Pattern: Idempotent POST — re-running analyze on same project returns cached result unless forced refresh

**Transcript:**
- `{ segments: [{ start, end, text }] }`
- Loaded from 1) same-dir JSON sidecar, 2) YouTube captions (auto-pulled), 3) configured transcript root, or 4) ASR job
- Format: studyloop JSON, Whisper JSON, .srt, .vtt (all normalize to segments)
- Pattern: "Transcript chain" (Phase 10) tries multiple sources; first match wins

**Review Card:**
- Spaced-repetition item with prompt, answer, due date, ease factor, interval
- Sourced from bubbles, concepts, or custom terms
- Graded "Got it" (success) or "Again" (lapse); schedule adjusted per SM-2 algorithm
- Pattern: Server-owned schedule hidden from client; client maintains per-session queue/lapse counts

**Lens:**
- UI presentation mode for study surface (watch, generate, review)
- Each project can apply a lens to customize player/transcript/concept layout
- Pattern: Attached as `lensId` in project.json; loaded from `server/lenses/` static data

## Entry Points

**Web Entry:**
- Location: `web/src/main.tsx`
- Triggers: Page load, user opens `http://localhost:4601` (dev) or `http://localhost:4600` (prod)
- Responsibilities: Bootstrap React, mount App, hydrate store from localStorage + API calls

**Server Entry:**
- Location: `server/src/index.ts`
- Triggers: `npm run dev -w server` or `npm start` (production)
- Responsibilities: Load config, ensure data dirs, register Fastify plugins (CORS, multipart, routes), bind HTTP server

**Route Entry Points:**
- `GET /api/library` — list available projects
- `GET /api/config` — read configuration
- `POST /api/projects` — create new project
- `GET /api/projects/{id}` — read project metadata + session state
- `PATCH /api/projects/{id}` — update project metadata
- `GET /api/video/stream?path=…` — range request for local video file
- `GET /api/transcript?projectId=…` — resolve transcript via chain
- `POST /api/projects/{id}/analyze` — trigger/retrieve concept analysis
- `POST /api/projects/{id}/compile` — generate markdown study document
- `POST /api/projects/{id}/shots` — capture video frame
- `POST /api/review/grade` — submit spaced-rep grade

## Architectural Constraints

- **Concurrency:** Project mutations protected by `withProjectLock()` to serialize concurrent writes (avoids clobbering when user edits notes + bubble simultaneously)
- **No sessions:** Every request is stateless; auth is implicit (localhost only by default)
- **No database:** All data persisted as JSON/markdown files; complexity budget goes to algorithms (analysis, heatmap, spaced-rep)
- **Single-store pattern:** Zustand store is the only source of truth on client; components never maintain separate "dirty" state
- **Hash routing:** SPA with hash-based routes; no server-side routing needed (Fastify only serves `/api/*` and `index.html`)
- **External tool fallback:** ffmpeg/yt-dlp missing → features gracefully disable (screenshot button shows tooltip explaining why)

## Anti-Patterns

### Separate UI State and Store State

**What happens:** Component maintains local state (e.g., editing field) alongside store state (e.g., saved note text), leading to stale renders or accidental reverts when both update.
**Why it's wrong:** Store is source of truth; component state diverging from store causes sync bugs, especially when navigating away and back.
**Do this instead:** All persistent state lives in store; component state is UI-only (e.g., modal open/close, hover state). See `NotationModal.tsx` — `t`, `quote`, `text` are in state interface, but form input is local React state until Save is clicked, at which point it dispatches store action to POST and update store.

### Forgetting `withProjectLock()` on Project Writes

**What happens:** Two simultaneous requests (e.g., saving notes + creating bubble) both read `project.json`, modify it, and write it back; second write clobbers first write's changes.
**Why it's wrong:** No atomicity; concurrent writes corrupt project state.
**Do this instead:** All mutations within `routes/projects.ts` (and anywhere else mutating project files) wrap in `withProjectLock(projectId, async () => { … })`. See `server/src/lib/store.ts` for implementation.

### Calling API Functions Without Wrapping in Try-Catch

**What happens:** Component calls `store.gradeReviewCard()` but doesn't await or catch; error silently swallows or causes unhandled rejection.
**Why it's wrong:** API errors (network, 403, malformed) go unhandled; user doesn't know if action succeeded.
**Do this instead:** All API-calling actions in store throw ApiError; every call site either catches (and dispatches toast) or lets it bubble to a top-level handler. See `store.ts` error pattern — all catch blocks call `addToast(… "error")`.

### Storing Sensitive Config in localStorage

**What happens:** Developer stores API key in localStorage, thinks it's secure because "it's local."
**Why it's wrong:** localStorage is world-readable by any script on the page; XSS compromises it immediately.
**Do this instead:** Sensitive config (Anthropic API key) never sent to browser; stored server-side in `config.json` only. GET `/api/config` response redacts `anthropicApiKey` and returns `anthropicApiKeySet: boolean` instead. See `routes/config.ts`.

## Error Handling

**Strategy:** Errors surface as toasts; API errors thrown and caught in store; route errors caught by Fastify and returned as JSON.

**Patterns:**
- API errors: `request()` helper throws ApiError on non-2xx; callers catch and call `addToast(… "error")`
- Route errors: Each route wraps try-catch; returns `{ error: "message" }` on error
- File system errors: `store.ts` functions throw; callers in routes catch and return error response
- Validation errors: Zod parses request bodies; invalid → 400 with error details
- Path traversal defense: `isPathAllowedCanonical()` checks all paths against configured roots before opening; 403 if outside

## Cross-Cutting Concerns

**Logging:** Fastify built-in logger logs requests, errors, and lifecycle events. Client console logs for debugging; no structured logging to server yet.

**Validation:** Zod schemas for all request bodies and URL params; invalid → 400 with details. Type system enforces response shapes.

**Authentication:** None by design. CORS allows `localhost` origins only; LAN access requires `HOST=0.0.0.0` env var (explicit opt-in).

**Timestamp Handling:** All timestamps in seconds (floating-point) for video scrubbing precision. JSON serialization preserves decimals. UI formats for readability via `formatTimestamp()`.

**Throttling:** No built-in rate limiting; local-first app assumes single user. Long-running jobs (analyze, transcribe, ASR) poll in background; UI shows status.

---

*Architecture analysis: 2026-08-09*
