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

This starts the Fastify API on `http://localhost:4600` and the Vite dev server on
`http://localhost:4601` (proxying `/api` to the server). Open `http://localhost:4601`.
On first run, edit `~/.studyloop/config.json` (or use the Settings screen) to point
`libraryRoots` / `transcriptRoots` at your video and transcript folders. Optional
`ffmpeg` and `yt-dlp` binaries enable screenshots and YouTube caption resolution
respectively — everything else works without them.
