# StudyLoop

StudyLoop is a local-first web app for deep study of long-form video (local files or
YouTube): a player synced to a transcript, concept cards anchored to timestamps,
time-anchored notes with screenshots, long-running session notes, and a one-click
compiled study document. No database — everything lives as plain files in a study
project folder. Domain-agnostic by design; a BJJ instructional corpus is the first
concept-doc profile.

## Quickstart

```bash
npm install
npm run dev
```

This starts the Fastify API on `http://127.0.0.1:4600` and the Vite dev server on
`http://127.0.0.1:4601` (proxying `/api` to the server). Open `http://127.0.0.1:4601`.
On first run, edit `~/.studyloop/config.json` (or use the Settings screen) to point
`libraryRoots` / `transcriptRoots` at your video and transcript folders. Optional
`ffmpeg` and `yt-dlp` binaries enable screenshots and YouTube caption resolution
respectively — everything else works without them.

### Configuration via environment variables

- `PORT` (or `STUDYLOOP_PORT`) — server port, default `4600`. The Vite dev proxy reads
  the same variable, so `PORT=5000 npm run dev` moves both sides together.
- `WEB_PORT` — Vite dev server port, default `4601`.
- `HOST` — interface the server binds to, default `127.0.0.1` (loopback-only). The app
  has no authentication, so only change this if you understand the exposure — e.g. to
  reach it from another device on your LAN.

### Security notes

- The server only accepts requests whose `Origin` is `localhost`/`127.0.0.1`/`[::1]`
  (any port) — nothing else is allowed by CORS.
- `GET /api/config` never returns your Anthropic API key; it reports
  `anthropicApiKeySet: true/false` instead. `PUT /api/config` is still how you set it.
- Every file-path request (video streaming, transcripts, concept docs, project
  creation) is checked against your configured roots using resolved (symlink-aware)
  paths, not just string prefixes.
