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
  **`anthropicApiKey` is write-only from the browser's point of view:** `GET
  /api/config` never returns it — the response substitutes `anthropicApiKeySet:
  boolean` for the `anthropicApiKey` field. `PUT /api/config` still accepts
  `anthropicApiKey` (string to set it, `null` to clear it) but its response is
  redacted the same way, so the plaintext key never round-trips back to the client.
- `~` in `dataDir` **and** every entry of `libraryRoots` / `transcriptRoots` /
  `conceptDocs` is expanded to the user's home directory before use.
- Server port is controlled by `PORT` (or `STUDYLOOP_PORT`) env var, default `4600`;
  the Vite dev proxy reads the same variable. `HOST` controls the bind interface,
  default `127.0.0.1` (loopback-only — no auth exists, so anything broader is an
  explicit opt-in). CORS only allows `localhost`/`127.0.0.1`/`[::1]` origins (any port).

## Data model — project folder `<dataDir>/projects/<id>/`
```
project.json   { id, title, source: {type:"local"|"youtube", path?|videoId?, url?},
                 transcript: {type:"file"|"none", path?}, conceptDoc: {path?, profile?},
                 createdAt, updatedAt, lastPosition, watchedUpTo }
notes.md       long-running notes (markdown; ^t:123.4 tokens rendered as timestamp links)
bubbles.json   [{ id, t, text, shot?: "shots/<file>.jpg", createdAt }]
shots/         extracted JPEG frames, named shot-<t-in-ms>.jpg
exports/       compiled documents
```
Server persists atomically (write temp + rename). No database anywhere.
All read-modify-write operations against a project's files (bubbles CRUD, project
PATCH, notes PUT) go through a per-project in-process mutex (promise chain keyed by
project id) so two concurrent requests against the same project can't race each
other's read-then-write.

`lastPosition` is "where playback currently is" (drives resume). `watchedUpTo` is the
**furthest** position ever reached — monotonically non-decreasing, used by compile to
decide which concepts are "covered" (so scrubbing backward to rewatch a section
doesn't un-cover concepts you've already passed). On a project.json predating this
field, it's migrated on read by defaulting to the existing `lastPosition`. The client
PATCHes `{lastPosition, watchedUpTo: max(prevWatchedUpTo, currentPosition)}` every 10s;
the server also enforces the max server-side against the stored value as a backstop.
The periodic PATCH is serialized client-side (skipped if one is already in flight).

## Server API (all JSON unless noted)
- `GET /api/library` → `{ items: [{videoPath, title, durationSeconds?, transcriptPath?,
  instructor?, series?, hasLesson?}], warnings: [] }` — scans libraryRoots for video
  files AND transcriptRoots for transcript JSONs whose `source_video` exists; merges.
- `GET /api/video/stream?path=<abs>` — HTTP 206 range streaming. **Security:** path must
  resolve (via `fs.realpath` of the path or its nearest existing ancestor, not just a
  string prefix check) inside a configured root; otherwise 403. Supports standard
  `bytes=start-end` and suffix (`bytes=-N`, last N bytes) ranges; malformed ranges get
  416, multi-range requests fall back to a full 200 response (both per RFC 7233).
- `GET /api/transcript?path=<abs>` → normalized `{ segments: [{start, end, text}] }`.
  Loaders: (a) BJJ-corpus JSON `{timestamps:[{start,end,text}]}`, (b) .srt, (c) .vtt.
  Same realpath-canonical root guard as video streaming.
- `POST /api/projects` `{source, transcriptPath?, conceptDocPath?}` → creates project.
  Same realpath-canonical guard on `source.path`/`transcriptPath`/`conceptDocPath`;
  `source.type: "youtube"` URLs are validated (https, allowlisted YouTube hosts) the
  same way `/api/youtube/resolve` does.
- `GET /api/projects` / `GET /api/projects/:id` / `PATCH /api/projects/:id`
  (`lastPosition`, `watchedUpTo`, etc.) — PATCH revalidates any path-bearing fields
  (`conceptDoc.path`, `transcript.path`) against the configured roots exactly like
  project creation does, not just at creation time.
- `GET/PUT /api/projects/:id/notes` — raw markdown body.
- `GET/POST/PATCH/DELETE /api/projects/:id/bubbles`
- `POST /api/projects/:id/shots` `{t}` → grabs frame via ffmpeg from local file
  (`ffmpeg -ss t -i file -frames:v 1 -q:v 3`), saves to shots/, returns `{shot}`.
  For YouTube sources: resolve stream URL via `yt-dlp -g -f "best[height<=720]"` then
  same ffmpeg call against the URL; on failure return `{shot: null, error}` — UI still
  creates the bubble without an image.
- `GET /api/projects/:id/concepts` → `[{id, title, body, anchors:[{t}], raw}]`
  parsed from the attached concept doc (see Concept profiles), re-parsed fresh on every
  request. A GET never persists (no auto-detected profile write-back — parsing is cheap
  enough to redo, and persisting from a GET risked racing a concurrent writer).
- `POST /api/projects/:id/compile` → writes `exports/study-<date>.md`, returns
  `{path, markdown}`. Contents: title/source header → long notes (timestamp tokens
  become `[mm:ss]` links) → chronological bubbles with inline `![shot]` images
  (relative paths) → concepts list (covered = `watchedUpTo` passed an anchor, falling
  back to `lastPosition` for pre-migration projects). ONLY user captures + covered
  concepts; never dump full transcript or all cards.
- `POST /api/youtube/resolve` `{url}` → `{videoId, title, captions?: segments,
  ytdlpMissing?}` using `yt-dlp --skip-download --write-auto-subs` (vtt → normalized
  segments). URL must be `https://` and match an allowlisted YouTube host
  (youtube.com, www.youtube.com, m.youtube.com, youtu.be, music.youtube.com) — anything
  else is a 400. Every yt-dlp invocation has a 30s spawn timeout and a 10MB stdout cap.
  yt-dlp absent → **does not block project creation**: `videoId` is still extracted
  locally from the URL, `title`/`captions` are `null`, `ytdlpMissing: true`; the web
  app creates the project anyway with `title = url`.
- `GET /api/media/:projectId/shots/<file>` — serves shot images.

## Concept-doc profiles (`server/src/lib/concepts.ts`)
1. `bjj-curriculum`: split on `##`/`###` headings; extract time anchors from citation
   lines matching `/(Seated|Supine)\s+V(?:ol)?\.?\s*(\d+).*?@\s*(\d+:)?\d+:\d{2}/g` plus
   any bare `@ mm:ss` / `@ h:mm:ss`. An anchor whose cluster is preceded by a
   `Seated/Supine Vol N` citation on the same line applies to the project only if that
   citation's type+volume matches the project's video (match via filename containing
   volume number AND seated/supine keyword); non-matching citations are kept with
   `t:null` (shown in the "all concepts" list, never auto-surfaced). A **bare** `@
   mm:ss` cluster with no volume citation on its line isn't scoped to any volume, so it
   applies to every project (`t` set, never null).
2. `headings`: any markdown; each `##` section is a card; anchors = any `@ mm:ss` or
   `[mm:ss]` tokens found in the section body.
Profile auto-detect: bjj-curriculum is only attempted when the doc contains at least
one genuine `Seated/Supine Vol N` citation (a bare `@ mm:ss` alone isn't evidence of
BJJ-style formatting); of those, fall back to headings if <2 anchored cards.

## Frontend behavior contracts
- **Sync engine:** rAF-throttled (~4Hz) read of player currentTime into zustand.
  Derived selectors (binary search over sorted arrays): activeSegment (requires `t <=
  segment.end` + 0.5s grace — no active segment in a gap between segments or past the
  end of the last one), activeConcepts (t within [anchor, anchor+90s] window),
  passedConcepts. All panes subscribe.
- **TranscriptPane:** virtualized list (react-window or simple windowing) — search
  results are windowed the same way as the full list, not rendered in full; active
  segment highlighted + kept in view (unless user scrolled recently — 5s hold-off);
  click seeks; search box filters + Enter jumps.
- **Player interface:** `{play, pause, seek(t), getCurrentTime(), getDuration(),
  setRate(r), on(event)}` implemented by LocalVideoPlayer (<video>) and
  YouTubePlayer (IFrame API). Seek bar shows bubble pins + concept ticks.
  LocalVideoPlayer applies the store's current `playbackRate` on mount and again on
  `loadedmetadata`, so a rate change made on one video carries over to the next.
- **Loading a project session:** each `loadProjectSession(id)` call is tagged with a
  request id; if a newer call (or a return to the library) supersedes it before its
  fetches resolve, the stale response is discarded rather than applied — otherwise a
  slow response for a project you've since navigated away from could leave the view
  stuck on "Loading project…" or show the wrong project's data.
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
- **Resume:** `{lastPosition, watchedUpTo}` PATCHed every 10s (serialized — skipped if
  a previous PATCH is still in flight); reopening a project offers resume from
  `lastPosition`.

## Out-of-box requirements (non-negotiable)
- `npm install && npm run dev` from repo root starts both server and web (concurrently),
  prints one URL. No global installs required except optional ffmpeg/yt-dlp.
- First run with empty config: Library screen shows a friendly setup card → Settings
  to add roots, or paste a YouTube URL to start immediately.
- ffmpeg missing → screenshots disabled with visible hint, everything else works.
- All errors surface as toasts, never blank screens. Server port conflict → clear message.

## Quality bar
- TypeScript strict; no `any` in exported signatures.
- Server: input validation on every route (zod); path-traversal guard on file params
  using realpath-canonical root checks (not lexical prefix checks alone — a symlink
  inside an allowed root can't be used to escape it).
- Vitest: unit tests for transcript loaders, concept parsers, time utils, compile
  renderer (golden file). No E2E suite in v1.
- UI: dark theme default, clean/minimal, keyboard-first. No component library; plain
  CSS modules. Layout: header (title/source) · main = video (left 60%) + transcript
  (right 40%) · bottom dock = tabs [Notes | Bubbles | Concepts] resizable.
