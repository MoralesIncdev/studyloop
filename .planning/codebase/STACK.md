# Technology Stack

**Analysis Date:** 2026-08-09

## Languages

**Primary:**
- TypeScript 5.5.3 - All source code (server `src/`, web `src/`, tests)

**Secondary:**
- JavaScript - Build scripts, Playwright configuration
- JSON - Configuration and project data storage

## Runtime

**Environment:**
- Node.js >=18.17 (required in `package.json`)

**Package Manager:**
- npm 10+ with workspaces
- Lockfile: `package-lock.json` present

## Frameworks

**Core:**
- Fastify 4.28.1 - REST API server (`server/src/index.ts`)
- React 18.3.1 - UI framework (`web/src/`)
- Vite 5.3.4 - Frontend build tool and dev server (`web/vite.config.ts`)

**Testing:**
- Vitest 1.6.0 - Unit and integration tests (`server/vitest.config.ts`, `web/vitest.config.ts`)
- Playwright 1.62.1 - E2E tests (`playwright.config.ts`)

**Build/Dev:**
- TypeScript 5.5.3 - Compilation (`server/tsconfig.json`, `web/tsconfig.json`)
- tsx 4.16.2 - TypeScript execution for dev (`server/src/index.ts` via `npm run dev`)
- concurrently 8.2.2 - Parallel process running (`npm run dev` launches server + web)

## Key Dependencies

**Critical:**
- @anthropic-ai/sdk 0.115.0 - Claude API integration (`server/src/lib/providers.ts`, `server/src/lib/analysis.ts`)
- youtubei.js 17.2.0 - YouTube metadata/captions without API key (`server/src/lib/innertube.ts`)
- pdf-parse 1.1.1 - PDF document parsing (`server/src/routes/slides.ts` for slide extraction)
- zod 3.23.8 - Schema validation and type-safe parsing (`server/src/config.ts`, `server/src/lib/models.ts`)

**Infrastructure:**
- @fastify/cors 9.0.1 - CORS handling for localhost origins only
- @fastify/multipart 8.3.0 - File upload handling (`routes/share.ts` import-analysis, `routes/slides.ts` PDF upload)
- @fastify/static 7.0.4 - Serve built web app in production
- zustand 5.0.14 - Client-side state management (`web/src/state/`)

**Build/Tooling:**
- @vitejs/plugin-react 4.3.1 - React JSX compilation for Vite
- @types/node 20.14.10 - TypeScript definitions for Node.js
- @types/react 18.3.3, @types/react-dom 18.3.0 - React type definitions

## Configuration

**Environment Variables (Configurable):**
- `STUDYLOOP_PORT` - API server port (default: 4600)
- `WEB_PORT` - Web dev server port (default: 4601)
- `HOST` - API server bind address (default: 127.0.0.1 - localhost only)
- `STUDYLOOP_CONFIG_DIR` - Config directory override (default: `~/.studyloop/`)
- `STUDYLOOP_E2E_SERVER_PORT`, `STUDYLOOP_E2E_WEB_PORT` - E2E test ports (4610/4611)
- `STUDYLOOP_YTDLP_BIN` - yt-dlp binary path override (default: `yt-dlp`)
- `STUDYLOOP_FFPROBE_BIN` - ffprobe binary path override (default: `ffprobe`)
- `STUDYLOOP_FAKE_ANALYSIS` - Use fake analysis client for demo/no-key dev (testing only)

**Build Artifacts:**
- `web/dist/` - Built frontend (created by `npm run build`)
- `server/dist/` - Compiled server (created by `npm run build`)
- `server/dist/lib/glossary/` - Static glossary JSON files copied at build time

**Persistent Config:**
- `~/.studyloop/config.json` - User configuration (API keys, data paths, weights, ASR settings)
  - Contains: anthropic/openai/google/xai/deepseek/kimi/zai API keys, LLM provider selection, auth mode, analysis model override, continuity weights, ASR adapter config
  - Redacted on wire via `PublicConfig` type to prevent key leakage to browser

## External Binaries (Optional - Features degrade gracefully)

**Media Processing:**
- `yt-dlp` - Download video frames for capture (`server/src/lib/frames.ts`), fallback YouTube resolution (`server/src/routes/youtube.ts`)
- `ffmpeg/ffprobe` - Media duration/metadata queries (`server/src/lib/ffprobe.ts`), frame extraction feedback

**Health Check:**
- `/api/health` endpoint reports availability (cached 5min) - screenshot/frame-grab disabled if binaries missing

## Platform Requirements

**Development:**
- macOS/Linux/Windows with Node.js >=18.17
- npm 10+ for workspaces
- (Optional) yt-dlp and ffmpeg in PATH for full video/capture features
- Playwright browsers installed (managed by @playwright/test)

**Production:**
- Standalone Node.js server (no build required if dist/ pre-built)
- Listens on configurable `STUDYLOOP_PORT` (default 4600)
- Serves static web app from `web/dist/` if present
- Localhost-only by default (no auth system) unless `HOST` env var changed
- Data storage: local filesystem (no database required)

---

*Stack analysis: 2026-08-09*
