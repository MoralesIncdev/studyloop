# External Integrations

**Analysis Date:** 2026-08-09

## APIs & External Services

**LLM Providers (Multi-Provider Support):**

All providers use a unified `StructuredLLMCaller` interface in `server/src/lib/providers.ts`. User selects one in Settings; config stored in `~/.studyloop/config.json`.

- **Anthropic (Claude)** - Primary provider
  - SDK: `@anthropic-ai/sdk` 0.115.0
  - Auth: `anthropicApiKey` (api-key mode) or ambient `ANTHROPIC_AUTH_TOKEN`/`ANTHROPIC_API_KEY` (oauth mode, requires `anthropic-beta: oauth-2025-04-20` header)
  - Endpoint: Native structured outputs via `output_config.format.type: "json_schema"`
  - Default model: `claude-opus-5` (overridable via `analysisModel` config)
  - Uses: Analysis engine (`lib/analysis.ts`), concept extraction, card transformation (`lib/cardTransform.ts`), lens generation (`lib/lenses.ts`)

- **OpenAI (GPT)**
  - SDK: OpenAI-compatible endpoint (https://api.openai.com/v1)
  - Auth: `openaiApiKey` env var
  - Endpoint: OpenAI chat/completions with JSON mode
  - Default model: `gpt-5.1`
  - JSON schema embedded in system prompt (no native structured outputs)

- **Google (Gemini)**
  - SDK: Google AI client (wire: "google")
  - Auth: `googleApiKey` env var
  - Endpoint: Gemini API
  - Default model: `gemini-2.5-pro`
  - JSON schema embedded in system prompt

- **xAI (Grok)**
  - SDK: OpenAI-compatible endpoint (https://api.x.ai/v1)
  - Auth: `xaiApiKey` env var
  - Default model: `grok-4`
  - JSON schema embedded in system prompt

- **DeepSeek**
  - SDK: OpenAI-compatible endpoint (https://api.deepseek.com/v1)
  - Auth: `deepseekApiKey` env var
  - Default model: `deepseek-chat`
  - JSON schema embedded in system prompt

- **Kimi (Kimi Code)**
  - SDK: Anthropic-compatible endpoint (https://api.kimi.com/coding)
  - Auth: `kimiApiKey` env var
  - Default model: `kimi-code` (reasoning model - max_tokens lifted to 32768)
  - JSON schema embedded in system prompt

- **Z.ai (GLM)**
  - SDK: OpenAI-compatible endpoint (https://api.z.ai/api/coding/paas/v4)
  - Auth: `zaiApiKey` env var
  - Default model: `glm-5` (reasoning model - max_tokens lifted to 32768)
  - JSON schema embedded in system prompt

**YouTube:**
- **Innertube (youtubei.js 17.2.0)**
  - Purpose: Video metadata, captions, related videos, search
  - No API key required
  - Client: `server/src/lib/innertube.ts` - lazy-initialized singleton, 10s timeout, graceful degradation to null on failure
  - Uses: `routes/youtube.ts` for video info, `routes/search.ts` for related video search, `lib/transcripts.ts` for auto-generated captions

- **yt-dlp (Binary)**
  - Purpose: Frame extraction, video URL resolution fallback
  - Client: `server/src/lib/ytdlp.ts` - spawns subprocess with 30s timeout
  - Configurable: `STUDYLOOP_YTDLP_BIN` env var (default: `yt-dlp` on PATH)
  - Uses: `lib/frames.ts` (frame-grab for capture), `routes/youtube.ts` (fallback when Innertube fails)
  - Health: `/api/health` reports if present; feature disabled with tooltip if missing

## Data Storage

**Databases:**
- Local filesystem JSON only (no SQL/NoSQL database)
- Location: `~/.studyloop/` (configurable via `STUDYLOOP_CONFIG_DIR`)

**Project Structure:**
- `~/.studyloop/config.json` - Application config (API keys, paths, continuity weights, ASR settings)
- `~/.StudyLoopData/projects/<project-id>/` (configurable via `dataDir` in config.json)
  - `project.json` - Project metadata, source, analysis status
  - `analysis.json` - Extracted concepts, pearls, units (if analyzed)
  - `bubbles.json` - Highlight/note bubbles
  - `notes.md` - Freeform markdown notes
  - Concurrent access protected by per-project Promise-chain lock (`lib/store.ts`)

**Transcripts:**
- `~/.StudyLoopData/transcripts/<source>/` (configured via `transcriptRoots`)
  - User-provided VTT/SRT files, YouTube auto-generated via Innertube

**Concept Docs:**
- User-provided glossary/curriculum files (paths in `conceptDocs` array)

**Caching:**
- Thumbnails: `~/.studyloop/thumbs/` - cached JPEG thumbnails keyed by file path+mtime hash

**File Storage:**
- No cloud storage - all data persists locally
- Atomic writes via temp file + rename pattern (prevents corruption on crash)

## Authentication & Identity

**Auth Provider:**
- None for app access (localhost-only, no user auth)

**LLM Authentication:**
- Anthropic: API key pasted in Settings OR ambient OAuth credentials (from `ant auth login`)
- Other providers: API key pasted in Settings
- All keys redacted on browser wire (`PublicConfig` type) - browser never sees plaintext

**Config Persistence:**
- `~/.studyloop/config.json` is readable plaintext (contains API keys locally)
- Accessed via authenticated env vars or user paste-in flow

## Monitoring & Observability

**Error Tracking:**
- None configured

**Logs:**
- Fastify logger to stdout/stderr (enabled in `server/src/index.ts`)
- E2E logs: traces/videos retained on failure in `.playwright/` directory

**Health Check:**
- GET `/api/health` - reports ffmpeg/yt-dlp availability (cached 5 min)
  - Used by web app to enable/disable screenshot controls with tooltip

## CI/CD & Deployment

**Hosting:**
- Standalone Node.js server (no managed hosting configured)
- Serves compiled web app from `web/dist/` if present

**CI Pipeline:**
- GitHub Actions via `.github/workflows/` (present but not detailed in exploration)

**Build:**
- `npm run build` - Compiles both server + web, copies glossary JSONs to `dist/lib/glossary/`
- `npm run start` - Production: builds then runs server (`node dist/index.js`)

**Local Development:**
- `npm run dev` - Concurrent Fastify server + Vite dev server on default ports (4600/4601)

## Environment Configuration

**Required Environment Variables (for credentials):**
- None strictly required (app starts without any, analysis features disabled)
- One of: `anthropicApiKey`, `openaiApiKey`, `googleApiKey`, `xaiApiKey`, `deepseekApiKey`, `kimiApiKey`, `zaiApiKey` to enable LLM features

**Optional Environment Variables:**
- `STUDYLOOP_PORT` - API server port (default 4600)
- `STUDYLOOP_CONFIG_DIR` - Config directory (default `~/.studyloop/`)
- `STUDYLOOP_FAKE_ANALYSIS` - Use fake analysis for demos (testing)
- `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_API_KEY` - Ambient credentials for Anthropic OAuth
- `STUDYLOOP_YTDLP_BIN` - yt-dlp binary path (default `yt-dlp`)
- `STUDYLOOP_FFPROBE_BIN` - ffprobe binary path (default `ffprobe`)

**Secrets Location:**
- In-memory: LLM API keys from `~/.studyloop/config.json` (loaded once on server start, never logged)
- Browser: Redacted via `PublicConfig` shape before serialization
- Never committed: Keys only pasted by user or loaded from env vars

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None (pure analysis pipeline, no external notifications)

**Share Bundles (Export Format):**
- `.studyloop.json` files - self-contained project exports with embedded video/transcript/analysis
  - Author handle embedded (`shareHandle` config, default "anonymous")
  - Importable via `/api/share/import` route

---

*Integration audit: 2026-08-09*
