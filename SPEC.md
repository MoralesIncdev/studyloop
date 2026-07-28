# StudyLoop — Technical Spec (v1)
*The build contract. Agents implement against this; deviations require updating this file.*

## Product summary
Local-first web app for deep study of long-form video (local files or YouTube).
Player + synced transcript + concept cards + time-anchored notes with screenshots +
long-running notes + compiled study document. Domain-agnostic; BJJ corpus is the
first profile. Ships on GitHub: `npm install && npm run dev` must be all it takes.

## Repo layout (npm workspaces)
```
studyloop/
├─ package.json            workspaces: ["server", "web"]; scripts: dev, build, start
├─ server/                 Fastify 4, TypeScript, ESM. Port 4600.
│  └─ src/
│     ├─ index.ts          bootstrap; serves API + built web in prod
│     ├─ config.ts         loads ~/.studyloop/config.json (see Config)
│     ├─ routes/
│     │  ├─ library.ts     GET /api/library, POST /api/library/rescan
│     │  ├─ video.ts       GET /api/video/stream?path=… (range requests)
│     │  ├─ transcript.ts  GET /api/transcript?path=…
│     │  ├─ projects.ts    CRUD under /api/projects
│     │  ├─ capture.ts     POST /api/projects/:id/shots  (ffmpeg frame grab)
│     │  ├─ concepts.ts    GET /api/projects/:id/concepts
│     │  ├─ compile.ts     POST /api/projects/:id/compile
│     │  └─ youtube.ts     POST /api/youtube/resolve  (metadata + captions via yt-dlp)
│     └─ lib/
│        ├─ scan.ts        library scanner (videos + transcript matching)
│        ├─ transcripts.ts loaders: studyloop JSON, whisper JSON, .srt/.vtt
│        ├─ concepts.ts    concept-doc parsers (profiles: "bjj-curriculum", "headings")
│        ├─ frames.ts      ffmpeg frame extraction
│        └─ store.ts       project folder persistence
└─ web/                    Vite + React 18 + TypeScript. Dev port 4601 (proxy /api→4600).
   └─ src/
      ├─ App.tsx           router: Library | Study
      ├─ state/store.ts    zustand store (single source of truth, incl. currentTime)
      ├─ player/           VideoPlayer (local <video> | YouTube iframe, one interface)
      ├─ transcript/       TranscriptPane
      ├─ concepts/         ConceptTicker + ConceptCard
      ├─ notes/            NotesPane (long notes), BubbleRail, NotationModal
      ├─ library/          LibraryView
      └─ lib/              time utils, api client, hotkeys
```

## Config — `~/.studyloop/config.json` (auto-created on first run)
```json
{
  "dataDir": "~/StudyLoop",
  "libraryRoots": [],
  "transcriptRoots": [],
  "conceptDocs": [],
  "anthropicApiKey": null
}
```
- Missing/unmounted roots are skipped with a warning in the library response, never a crash.
- `GET /api/config` and `PUT /api/config` let the web app edit this (Settings screen).

## Data model — project folder `<dataDir>/projects/<id>/`
```
project.json   { id, title, source: {type:"local"|"youtube", path?|videoId?, url?},
                 transcript: {type:"file"|"none", path?}, conceptDoc: {path?, profile?},
                 createdAt, updatedAt, lastPosition }
notes.md       long-running notes (markdown; ^t:123.4 tokens rendered as timestamp links)
bubbles.json   [{ id, t, text, shot?: "shots/<file>.jpg", createdAt }]
shots/         extracted JPEG frames, named shot-<t-in-ms>.jpg
exports/       compiled documents
```
Server persists atomically (write temp + rename). No database anywhere.

## Server API (all JSON unless noted)
- `GET /api/library` → `{ items: [{videoPath, title, durationSeconds?, transcriptPath?,
  instructor?, series?, hasLesson?}], warnings: [] }` — scans libraryRoots for video
  files AND transcriptRoots for transcript JSONs whose `source_video` exists; merges.
- `GET /api/video/stream?path=<abs>` — HTTP 206 range streaming. **Security:** path must
  be inside a configured root; otherwise 403.
- `GET /api/transcript?path=<abs>` → normalized `{ segments: [{start, end, text}] }`.
  Loaders: (a) BJJ-corpus JSON `{timestamps:[{start,end,text}]}`, (b) .srt, (c) .vtt.
- `POST /api/projects` `{source, transcriptPath?, conceptDocPath?}` → creates project.
- `GET /api/projects` / `GET /api/projects/:id` / `PATCH /api/projects/:id` (lastPosition etc.)
- `GET/PUT /api/projects/:id/notes` — raw markdown body.
- `GET/POST/PATCH/DELETE /api/projects/:id/bubbles`
- `POST /api/projects/:id/shots` `{t}` → grabs frame via ffmpeg from local file
  (`ffmpeg -ss t -i file -frames:v 1 -q:v 3`), saves to shots/, returns `{shot}`.
  For YouTube sources: resolve stream URL via `yt-dlp -g -f "best[height<=720]"` then
  same ffmpeg call against the URL; on failure return `{shot: null, error}` — UI still
  creates the bubble without an image.
- `GET /api/projects/:id/concepts` → `[{id, title, body, anchors:[{t}], raw}]`
  parsed from the attached concept doc (see Concept profiles).
- `POST /api/projects/:id/compile` → writes `exports/study-<date>.md`, returns
  `{path, markdown}`. Contents: title/source header → long notes (timestamp tokens
  become `[mm:ss]` links) → chronological bubbles with inline `![shot]` images
  (relative paths) → concepts list (covered = playback passed an anchor). ONLY user
  captures + covered concepts; never dump full transcript or all cards.
- `POST /api/youtube/resolve` `{url}` → `{videoId, title, captions?: segments}` using
  `yt-dlp --skip-download --write-auto-subs` (vtt → normalized segments). yt-dlp absent →
  clear error; playback still works without captions.
- `GET /api/media/:projectId/shots/<file>` — serves shot images.

## Concept-doc profiles (`server/src/lib/concepts.ts`)
1. `bjj-curriculum`: split on `##`/`###` headings; extract time anchors from citation
   lines matching `/(Seated|Supine)\s+V(?:ol)?\.?\s*(\d+).*?@\s*(\d+:)?\d+:\d{2}/g` plus
   any bare `@ mm:ss` / `@ h:mm:ss`. An anchor applies to the project only if the volume
   reference matches the project's video (match via filename containing volume number
   AND seated/supine keyword); unmatched anchors are kept with `t:null` (shown in the
   "all concepts" list, never auto-surfaced).
2. `headings`: any markdown; each `##` section is a card; anchors = any `@ mm:ss` or
   `[mm:ss]` tokens found in the section body.
Profile auto-detect: try bjj-curriculum; if <2 anchored cards, fall back to headings.

## Frontend behavior contracts
- **Sync engine:** rAF-throttled (~4Hz) read of player currentTime into zustand.
  Derived selectors (binary search over sorted arrays): activeSegment, activeConcepts
  (t within [anchor, anchor+90s] window), passedConcepts. All panes subscribe.
- **TranscriptPane:** virtualized list (react-window or simple windowing); active
  segment highlighted + kept in view (unless user scrolled recently — 5s hold-off);
  click seeks; search box filters + Enter jumps.
- **Player interface:** `{play, pause, seek(t), getCurrentTime(), getDuration(),
  setRate(r), on(event)}` implemented by LocalVideoPlayer (<video>) and
  YouTubePlayer (IFrame API). Seek bar shows bubble pins + concept ticks.
- **Hotkeys** (disabled while typing in inputs/textareas):
  space play/pause · J/L −/+10s · ←/→ −/+5s · K pause · ,/. speed −/+0.25 (0.5–2.5)
  · A/B set loop points, Shift+A clear · N notation · S screenshot-only.
- **Notation flow (N):** pause → POST shot (async, don't block modal) → modal with
  frame thumbnail (spinner till ready), timestamp, prefilled quote of active transcript
  segment (removable) → Save creates bubble → resume playback. Esc cancels + resumes.
- **Screenshot-only (S):** POST shot → toast "captured 12:34" → bubble with empty text.
  No pause, no modal.
- **NotesPane:** textarea (monospace) autosaving (debounce 800ms) to notes.md;
  `@` hotkey button inserts `^t:<current>` token; rendered preview toggle where tokens
  become clickable seek links; drag bubble → appends `^t` + text + shot ref.
- **BubbleRail:** right-side chronological list; click seeks to t−5s; edit/delete;
  uncaptioned shots show a subtle "no caption" badge.
- **Compile button:** calls compile, shows the markdown in a modal with "Reveal in
  Finder" (opens exports/) and Copy buttons.
- **Resume:** lastPosition PATCHed every 10s; reopening a project offers resume.

## Out-of-box requirements (non-negotiable)
- `npm install && npm run dev` from repo root starts both server and web (concurrently),
  prints one URL. No global installs required except optional ffmpeg/yt-dlp.
- First run with empty config: Library screen shows a friendly setup card → Settings
  to add roots, or paste a YouTube URL to start immediately.
- ffmpeg missing → screenshots disabled with visible hint, everything else works.
- All errors surface as toasts, never blank screens. Server 4600 conflict → clear message.

## Quality bar
- TypeScript strict; no `any` in exported signatures.
- Server: input validation on every route (zod); path-traversal guard on file params.
- Vitest: unit tests for transcript loaders, concept parsers, time utils, compile
  renderer (golden file). No E2E suite in v1.
- UI: dark theme default, clean/minimal, keyboard-first. No component library; plain
  CSS modules. Layout: header (title/source) · main = video (left 60%) + transcript
  (right 40%) · bottom dock = tabs [Notes | Bubbles | Concepts] resizable.
