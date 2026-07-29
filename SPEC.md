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
  "dataDir": "~/StudyLoopData",
  "libraryRoots": [],
  "transcriptRoots": [],
  "conceptDocs": [],
  "anthropicApiKey": null
}
```
- Default `dataDir` is `~/StudyLoopData`, not `~/StudyLoop` — on macOS's default
  case-insensitive APFS volume, `~/StudyLoop` resolves to the same directory as a repo
  cloned to `~/studyloop`, so the old default silently wrote project data into a git
  working tree. This only affects fresh installs: an existing `config.json`'s `dataDir`
  is never rewritten by this default — see README "Migrating from `~/StudyLoop`" if you
  were on the old default.
- Missing/unmounted roots are skipped with a warning in the library response, never a crash.
- `GET /api/config` and `PUT /api/config` let the web app edit this (Settings screen).
  **`anthropicApiKey` is write-only from the browser's point of view:** `GET
  /api/config` never returns it — the response substitutes `anthropicApiKeySet:
  boolean` for the `anthropicApiKey` field. `PUT /api/config` still accepts
  `anthropicApiKey` (string to set it, `null` to clear it) but its response is
  redacted the same way, so the plaintext key never round-trips back to the client.
- `~` in `dataDir` **and** every entry of `libraryRoots` / `transcriptRoots` /
  `conceptDocs` is expanded to the user's home directory before use. Every
  incoming path-bearing request param that gets compared against those roots
  (`source.path`/`transcriptPath`/`conceptDocPath` at project creation,
  `conceptDoc.path`/`transcript.path` on PATCH, the `?path=` query params on
  `/api/transcript` and `/api/video/stream`) is also `~`-expanded server-side
  before validation and storage — otherwise a `~/...` entry from the
  configured `conceptDocs` list (which `GET /api/config` still returns
  unexpanded, verbatim) would never match once compared against the already-
  expanded root, and clicking it in the UI (ConceptsDock's attach buttons)
  would 403.
- Server port is controlled by the `STUDYLOOP_PORT` env var, default `4600`; the
  Vite dev proxy reads the same variable. The generic `PORT` env var is
  **deliberately ignored** by both — a dev harness or process manager commonly
  exports a generic `PORT` for whatever it's launching, and since this repo runs
  two servers (API + web) under one `npm run dev`, a single ambient `PORT` can't
  unambiguously address either one; using a namespaced variable avoids one
  leaking into the other. `HOST` controls the bind interface, default
  `127.0.0.1` (loopback-only — no auth exists, so anything broader is an
  explicit opt-in). CORS only allows `localhost`/`127.0.0.1`/`[::1]` origins (any port).

## Data model — project folder `<dataDir>/projects/<id>/`
```
project.json   { id, title, source: {type:"local"|"youtube", path?|videoId?, url?},
                 transcript: {type:"file"|"none", path?}, conceptDoc: {path?, profile?},
                 createdAt, updatedAt, lastPosition, watchedUpTo }
notes.md       long-running notes (markdown; ^t:123.4 tokens rendered as timestamp links)
bubbles.json   [{ id, t, text, shot?: "shots/<file>.jpg", createdAt }]
captions.json  YouTube auto-captions, if resolve returned any: {segments:[{start,end,text}]}
               (whisper-style JSON — the existing generic loader reads it, no new parser).
               Written once at project creation; project.transcript points at it as
               {type:"file", path:"captions.json"}.
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
- Every route that takes a project id (`:id` path param, or `projectId` on
  `/api/transcript` and `/api/media/:projectId/...`) constrains it to the UUID
  shape project ids are generated in (see `newId()`) — a malformed or
  path-traversal-shaped id (including a URL-encoded `..%2F` sequence, once the
  router decodes it) is rejected with 400 before it ever reaches a filesystem
  path. `store.ts`'s `projectDir()` and `readProject()` independently re-guard
  against traversal and id/content mismatch too (defense in depth), so this
  isn't the only thing standing between a crafted id and the filesystem.
- `GET /api/library` → `{ items: [{videoPath, title, durationSeconds?, transcriptPath?,
  instructor?, series?, hasLesson?}], warnings: [] }` — scans libraryRoots for video
  files AND transcriptRoots for transcript JSONs whose `source_video` exists; merges.
  **Cached:** the scan result is served instantly on every `GET` as long as the
  resolved root config (`libraryRoots`/`transcriptRoots`) hasn't changed since
  the last successful scan — a `GET` never re-walks the filesystem or
  re-parses every transcript file after the first success. Concurrent callers
  (e.g. two GETs fired close together on first load) share a single in-flight
  scan instead of each starting their own walk. `POST /api/library/rescan`
  always forces a fresh scan (still deduped against any other in-flight
  scan). Within a scan, each transcript JSON is only re-read when its
  `(path, mtime, size)` has actually changed since the last time it was read
  — the dominant cost on a real library is re-parsing multi-MB transcript
  files, not the directory walk itself.
- `GET /api/video/stream?path=<abs>` — HTTP 206 range streaming. **Security:** path must
  resolve (via `fs.realpath` of the path or its nearest existing ancestor, not just a
  string prefix check) inside a configured root; otherwise 403. Supports standard
  `bytes=start-end` and suffix (`bytes=-N`, last N bytes) ranges; malformed ranges get
  416, multi-range requests fall back to a full 200 response (both per RFC 7233).
- `GET /api/transcript?path=<...>&projectId=<id>` → normalized `{ segments: [{start, end,
  text}] }`. Loaders: (a) BJJ-corpus JSON `{timestamps:[{start,end,text}]}`, (b) generic
  whisper-style JSON `{segments:[{start,end,text}]}`, (c) .srt, (d) .vtt. `projectId` is
  optional; when present *and* `path` is not absolute, `path` is resolved inside that
  project's own folder — but **only when it exactly matches that project's own declared
  `transcript.path`** (realpath-canonical, can't escape it either way). This is how a
  YouTube project's `captions.json` (project-relative, server-managed data) gets read
  without needing to live under a `transcriptRoot` — it is *not* a general "serve any
  file under this project's folder" escape hatch: a relative `path` for anything else
  next to `project.json` (`bubbles.json`, `project.json` itself, etc.) is rejected with
  403, even though it would otherwise resolve inside the project directory just fine. An
  absolute `path` always goes through the standard root-allowlist guard regardless of
  whether `projectId` was also passed, so local-project transcripts (always absolute) are
  unaffected.
- `POST /api/projects` `{source, transcriptPath?, conceptDocPath?, captions?}` → creates
  project. Same realpath-canonical guard on `source.path`/`transcriptPath`/
  `conceptDocPath`; `source.type: "youtube"` URLs are validated (https, allowlisted
  YouTube hosts) the same way `/api/youtube/resolve` does. `captions` (segments from a
  prior `/api/youtube/resolve` call) is only used for `source.type: "youtube"`; when
  present and non-empty it's written to `captions.json` (see Data model) and
  `transcript` is set to `{type:"file", path:"captions.json"}`, overriding
  `transcriptPath` for that call.
- `GET /api/projects` / `GET /api/projects/:id` / `PATCH /api/projects/:id`
  (`lastPosition`, `watchedUpTo`, etc.) — PATCH revalidates any path-bearing fields
  (`conceptDoc.path`, `transcript.path`) against the configured roots exactly like
  project creation does, not just at creation time.
- `GET/PUT /api/projects/:id/notes` — raw markdown body.
- `GET/POST/PATCH/DELETE /api/projects/:id/bubbles`
- `POST /api/projects/:id/shots` `{t}` → grabs frame via ffmpeg from local file
  (`ffmpeg -ss t -i file -frames:v 1 -q:v 3`), saves to shots/, returns `{shot}`.
  For YouTube sources: resolve stream URL via `yt-dlp -g -f "best[height<=720]"` then
  same ffmpeg call against the URL; on failure (including a 60s spawn timeout, which
  kills the process — a stream-URL capture can otherwise hang indefinitely on a stalled
  network read) return `{shot: null, error}` — UI still creates the bubble without an
  image. ffmpeg's stderr is capped (bounded memory even if the process misbehaves), and
  ffmpeg-availability checks (`GET /api/health`, and the pre-capture gate on the N/S
  hotkeys and the Shot button) require the version check to exit 0, not merely spawn.
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
  `videoId` is extracted locally from the URL's `?v=`, `youtu.be/`, `/shorts/`, `/live/`,
  or `/embed/` form. yt-dlp absent → **does not block project creation**: `videoId` is
  still extracted locally, `title`/`captions` are `null`, `ytdlpMissing: true`; the web
  app creates the project anyway with `title = url`. If the URL's form isn't one of the
  recognized ones (e.g. a playlist or channel link) *and* local extraction can't find an
  id, the request rejects with a clear error instead of ever using the raw URL string as
  a videoId — if yt-dlp is present, its own resolved id is used as a fallback before
  giving up.
- `GET /api/media/:projectId/shots/<file>` — serves shot images.
- `POST /api/projects/:id/reveal` `{path?}` → `{ok, message?}`. macOS-only: runs `open -R
  <path>` to reveal a file (or the whole `exports/` folder, if `path` omitted) in Finder.
  `path`, if given, must resolve (realpath-canonical) inside that project's `exports/`
  directory — otherwise 403. On non-macOS platforms, returns `{ok: false, message}`
  rather than attempting anything (no-op, not an error).
- `GET /api/health` → `{ok: true, ffmpeg: boolean, ytdlp: boolean}`. Each tool's
  availability is cached for up to 5 minutes (a cold check — especially yt-dlp's
  Python interpreter startup — can take several seconds; this endpoint is polled by the
  web app on every load, so a warm request must be fast). Installing either binary
  mid-session and reloading picks it up within that window, without a server restart.
  The web app calls this once on load and disables ffmpeg-dependent controls
  (screenshots, and the notation modal's frame capture) with a tooltip/toast when
  `ffmpeg` is false.

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
  passedConcepts. All panes subscribe. ConceptsDock's "covered" checkmarks and count
  compute passedConcepts against `max(watchedUpTo, currentTime)`, not raw `currentTime`
  alone — matching compile's semantics, so scrubbing backward to rewatch a section
  doesn't visually un-cover a concept you've already passed.
- **TranscriptPane:** virtualized list (react-window or simple windowing) — search
  results are windowed the same way as the full list, not rendered in full; active
  segment highlighted + kept in view (unless user scrolled recently — 5s hold-off);
  click seeks; search box filters + Enter jumps.
- **Player interface:** `{play, pause, seek(t), getCurrentTime(), getDuration(),
  setRate(r), getAvailableRates?(), on(event)}` implemented by LocalVideoPlayer
  (<video>) and YouTubePlayer (IFrame API). Seek bar shows bubble pins + concept ticks.
  `setRate` is responsible for syncing the store's `playbackRate` itself (not the
  caller) with whatever rate actually ends up in effect — YouTube's IFrame API can snap
  a requested rate to its own nearest supported value, so the store must reflect the
  real applied rate, not merely the requested one. The speed control (PlayerControls)
  intersects its default option list with `getAvailableRates()` when the active player
  exposes it (YouTube only — a plain `<video>` has no such constraint and omits the
  method, so the full default list is used). LocalVideoPlayer applies the store's
  current `playbackRate` on mount and again on `loadedmetadata`, so a rate change made
  on one video carries over to the next.
  The YouTube IFrame API script load is bounded (15s timeout, plus `onerror`) — on
  failure the shared load promise rejects and resets itself (so a retry is a real fresh
  attempt, not the same doomed promise), and YouTubePlayer shows a toast *and* a visible
  "Retry" button over the player area instead of staying silently blank.
- **Loading a project session:** each `loadProjectSession(id)` call is tagged with a
  request id; if a newer call (or a return to the library) supersedes it before its
  fetches resolve, the stale response is discarded rather than applied — otherwise a
  slow response for a project you've since navigated away from could leave the view
  stuck on "Loading project…" or show the wrong project's data. Leaving the Study view
  (unmount, or switching to a different project) synchronously flushes, in order, before
  clearing the session: (1) any pending debounced notes save, (2) a final
  `{lastPosition, watchedUpTo}` PATCH if `currentTime > 0`. Both reads happen before any
  state is cleared, so the flush always sees the project/notes/time it's about to leave
  behind, not whatever they get reset to.
- **Hotkeys** (disabled while typing in inputs/textareas):
  space play/pause · J/L −/+10s · ←/→ −/+5s · K pause · ,/. speed −/+0.25 (0.5–2.5)
  · A/B set loop points, Shift+A clear · N notation · S screenshot-only. Both N and S
  respect the ffmpeg-missing health gate exactly like the disabled Shot button — a
  capture is never attempted when `ffmpeg` is known false; a toast explains why instead
  (N still opens the modal, straight into its "no frame" state, since note-taking itself
  doesn't require ffmpeg).
- **Notation flow (N):** pause → POST shot (async, don't block modal) → modal with
  frame thumbnail (spinner till ready), timestamp, prefilled quote of active transcript
  segment (removable) → Save creates bubble → resume playback. Esc cancels + resumes.
  While the shot capture is still in flight, Save waits on it (button shows
  "Capturing…", disabled) instead of immediately creating a bubble that races ahead of
  the capture — after 15s of waiting it instead offers a "Save without frame" button
  that proceeds immediately with no image, rather than blocking indefinitely.
- **Screenshot-only (S):** POST shot → toast "captured 12:34" → bubble with empty text.
  No pause, no modal.
- **NotesPane:** textarea (monospace) autosaving (debounce 800ms) to notes.md. The debounce
  timer and the notes buffer both live in the zustand store (not component-local state),
  so a `flushNotes()` call — from the Compile button (always flushed before compiling,
  see below) or from leaving the Study view — always sees and persists the very latest
  edit rather than dropping whatever hasn't autosaved yet. `@` hotkey button inserts
  `^t:<current>` token; rendered preview toggle where tokens become clickable seek
  links; drag bubble → appends `^t` + text + shot ref.
- **BubbleRail:** right-side chronological list; click seeks to t−5s; edit/delete;
  uncaptioned shots show a subtle "no caption" badge.
- **Compile button:** before compiling, flushes any pending debounced notes save and
  PATCHes current progress (`{lastPosition, watchedUpTo}`, if `currentTime > 0`) — so the
  compiled doc reflects the very latest edit and position even if Compile is hit before
  the 800ms notes debounce or the 10s progress PATCH would otherwise have fired. If any
  bubble has a shot but empty text, first shows a skippable "caption these?" pass
  (uncaptioned shots + inline text inputs) before compiling. Then calls compile and shows
  the rendered markdown in a preview modal (a small markdown-lite renderer, not the raw
  text) with "Reveal in Finder" (opens the compiled file's location, or the whole
  exports/ folder — no-op toast with a message on non-macOS) and "Copy markdown" buttons.
- **Resume:** `{lastPosition, watchedUpTo}` PATCHed every 10s (serialized — skipped if
  a previous PATCH is still in flight); reopening a project offers resume from
  `lastPosition`. The final PATCH on leaving the project is handled once, deterministically,
  by the session-loading effect's own cleanup (see "Loading a project session" above) —
  not by this periodic timer, which only owns the steady-state tick.

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
  inside an allowed root can't be used to escape it). Project ids are additionally
  constrained to the UUID shape they're generated in at every route boundary, with
  store.ts independently re-guarding `projectDir()`/`readProject()` against traversal
  and id/content mismatch as defense in depth.
- Vitest: unit tests for transcript loaders, concept parsers, time utils, compile
  renderer (golden file), the library scan cache (cache hit/miss + in-flight dedupe),
  and the transcript-ref mtime/size cache. No E2E suite in v1.
- UI: dark theme default, clean/minimal, keyboard-first. No component library; plain
  CSS modules. Layout: header (title/source) · main = video (left 60%) + transcript
  (right 40%) · bottom dock = tabs [Notes | Bubbles | Concepts] resizable.

---

# V2 — YouTube-Native UI + Analysis Layer (2026-07-28)
*Supersedes the v1 "Quality bar → UI/Layout" paragraph. Reference: `design/reference-youtube.png`
(standard YouTube watch page). Design intent: deliberately hug YouTube's native watch UI so
the broad user base (mostly studying YouTube content) feels zero learning curve. Local
videos are first-class: every feature except YouTube search / related-videos works
identically for local files.*

## V2 layout (YouTube watch-page mapping)
```
┌──────────────────────────────────────────────────────────────────────────┐
│ TopBar: [logo StudyLoop]   [centered search + 🔍]            [⚙ avatar] │
├──────────────────────────────────────────────┬───────────────────────────┤
│ Player (16:9, fills left column)             │ RightRail (~402px)        │
│  • CC subtitle overlay (transcript segments) │  ┌ Transcript panel      │
│  • hover chrome (see Player chrome)          │  │  (collapsed header →  │
│  • red progress bar + heatmap strip          │  │  expands, virtualized,│
│                                              │  │  search, click-seek)  │
│ Title (YT h1 style)                          │  ├ Concepts list         │
│ Channel row: [instructor avatar] name        │  │  (card per concept,   │
│   [Analyze ✨ primary pill]                  │  │  active highlighted,  │
│ Action pills: 🔖 Compile · ↗ Share ·        │  │  covered ✓, click-seek│
│   ⤓ Import analysis · 👁 Overlays           │  ├ Up-next cabinet       │
│ Description box (YT-style, tabs):            │  │  (related videos —    │
│   [Notes | Bubbles]                          │  │  YouTube only, hover/ │
│                                              │  │  click drawer)        │
└──────────────────────────────────────────────┴───────────────────────────┘
```
- Look: replicate YouTube dark theme metrics closely — Roboto font stack, 12px card
  radii, #0f0f0f bg / #272727 chips / #f1f1f1 text / #aaa secondary, pill buttons
  (18px radius), 10px gap grid in right rail, thumbnail 168×94 rounded 8px.
- Old Library view becomes the "home grid" (YT home style: thumbnail cards w/ title,
  instructor, duration badge, transcript badge). Settings via avatar menu.

## Player chrome (hover, YouTube-style)
- Bottom gradient scrim; controls fade in on hover/pause: ▶/⏸, volume, time
  `current / duration`, spacer, then the right cluster: **✎ Note · 📷 Shot ·
  ✨ Analyze · CC · ⚙(speed/loop) · ⛶ fullscreen**. (Notes+screenshot live exactly
  where YouTube floats CC/settings — per design directive.)
- CC button toggles subtitle overlay: active transcript segment rendered as YouTube
  CC (bottom-center, black 75% bg, white text, max 2 lines). Persist per project.
- Progress bar: red played-portion, chapter-tick support, bubble pins (dots) and
  pearl markers (diamonds) above; **heatmap strip** (see Heatmap) rendered as a
  translucent area curve directly above the bar, YouTube "most replayed" style.
- Keyboard map unchanged from v1 (space/J/K/L/arrows/,/./N/S/A/B) + `C` toggles CC.

## Fast YouTube layer (youtubei.js — replaces yt-dlp for metadata/captions)
- Server lib `innertube.ts` using `youtubei.js` (npm, no API key): metadata + captions
  + related + search. yt-dlp remains ONLY for frame-grab stream URLs (screenshots).
- `POST /api/youtube/resolve` now answers from Innertube (target < 2s warm): title,
  author, durationSeconds, captions (normalized segments incl. auto-generated),
  related: [{videoId, title, author, durationSeconds, viewCountText, thumbnailUrl}].
  Captions persisted to `captions.json` as before. Related list cached in project.json
  (`related` field) and refreshable via `POST /api/youtube/related {videoId, projectId}`
  — `projectId` (deviation from the originally-scoped `{videoId}`-only body) identifies
  which project's cached `related` to overwrite; `videoId` alone doesn't uniquely name a
  project since nothing currently dedupes youtube-source projects by videoId at creation.
- `GET /api/search?q=` → `{library: LibraryItem[], youtube: RelatedVideo[]}` — fuzzy
  match over library titles/instructors + Innertube search (youtube section omitted
  for empty/failed Innertube). TopBar search dropdown shows both sections; picking a
  YouTube result creates/opens a project for it ("search acts as the pointer toward a
  video").
- Up-next cabinet: right-rail section listing `related`; hover expands full cards
  (thumbnail, title, author, duration); click → create/open project for that video.
  Graceful empty state for local videos (cabinet hidden).

## Analysis engine ("pearls & concept breakdown")
- Trigger: ✨ Analyze button (player cluster + channel-row pill). Requires transcript
  + `anthropicApiKey` in config (else pill opens Settings with a hint).
- `POST /api/projects/:id/analyze` → server chunks the transcript (~8-min windows,
  1-min overlap), calls Claude (model from config
  `analysisModel`, default `claude-opus-5`, via @anthropic-ai/sdk; structured outputs
  via `client.messages.parse` + `zodOutputFormat`; omit `thinking` (adaptive by
  default); handle `stop_reason: "refusal"` per chunk gracefully), then a final merge pass produces:
  ```
  analysis.json {
    generatedAt, model, version: 2,
    pearls: [{ t, label (≤60c), insight (1-3 sentences), importance: 1|2|3 }],
    concepts: [{ id, title, summary, anchors: [{t}], body (markdown) }],
    themes: [{ title, body }]        // overarching, unanchored
  }
  ```
- Progress: SSE or polling endpoint `GET /api/projects/:id/analyze/status`
  (states: idle|running {pct}|done|error). UI shows YT-style thin progress under the
  Analyze pill; toast on completion. Analysis is idempotent-cached: re-run only on
  explicit "Re-analyze" (confirm dialog).
- Rendering: pearls → diamond markers on timeline + "Pearls" group at top of the
  right-rail Concepts panel (importance-sorted, click-seek); concepts/themes fill the
  Concepts panel alongside (analysis concepts and attached concept-doc cards coexist,
  analysis section labeled "AI breakdown", doc section labeled by filename).
- Compile v2: study doc gains "Pearls" (timestamped, importance-starred) and
  "Concept breakdown" sections after the user-notes sections. Never blocks without
  analysis — sections simply absent.

## Heatmap + shareable analysis (the data layer)
- `GET /api/projects/:id/heatmap` → 200-bucket density array over video duration.
  Sources: bubbles (weight 1), pearls (weight = importance), imported overlay
  analyses (their bubbles/pearls, weight ×0.5). Gaussian-smoothed server-side.
- Share: `POST /api/projects/:id/export-analysis` → `exports/<title>.studyloop.json`
  — self-contained bundle: source ref (videoId/url or filename+duration hash — never
  the video bytes), author handle (config `shareHandle`, default "anonymous"), notes
  md, bubbles (shots embedded as base64 thumbnails ≤ 480px wide), pearls, concepts,
  themes, createdAt. Share pill → writes bundle + Reveal in Finder + Copy path.
- Import: Import-analysis pill (file picker or drop) → validated (zod, version
  gate, source match warning if videoId/duration mismatch) → stored under
  `<project>/overlays/<handle>-<hash>.studyloop.json`.
- Overlays toggle (👁 pill): renders imported analyses as a second pin/marker layer
  (distinct color per handle, legend chip row), merges into heatmap, and adds an
  "Others' analysis" right-rail section grouped by handle. This is the local
  foundation for the future community aggregation service (out of scope in v2) —
  the bundle format IS the wire format, so keep it versioned and stable.

## V2 out-of-box requirements
- Everything in v1 holds. youtubei.js failures (network-blocked, API drift) degrade:
  resolve falls back to yt-dlp path, search shows library-only, cabinet hides.
- No Anthropic key → app fully usable; only Analyze is gated (with a clear one-line
  "add key in Settings" hint).
- Local-video projects: identical UI minus YouTube-only sections (no dead space —
  rail sections collapse).

---

# F11 — Review Mode (spaced resurfacing) (2026-07-28)
*Council mandate: active recall + spaced repetition are the strongest-evidence
features; SRS mechanics must be HIDDEN (no decks, ease factors, or scheduling UI —
Anki-style exposed mechanics kill adoption). Frame as a memory aid.*

## Cards
A review card is derived (never duplicated) from study artifacts across ALL projects:
- **Bubble card** (bubble with text): front = shot image (or timestamp chip + project
  title when no shot) + prompt "What was your note here?"; back = the note text +
  transcript quote if the note carries one.
- **Pearl card** (analysis pearls): front = pearl label + project title; back = the
  insight. Only from `source: "model"` analyses (stubs excluded outside dev).
Cards are identified by stable ids: `bubble:<projectId>:<bubbleId>`,
`pearl:<projectId>:<t>`. Deleted artifacts drop their cards silently.

## Scheduling (hidden SM-2-lite)
`<dataDir>/review.json` — `{version:1, cards:{[cardId]:{due, interval, lapses,
reps, lastGrade, introducedAt}}}` via the existing atomic-write + a global mutex.
- New cards: due immediately, capped at 20 new/day (introducedAt stamps).
- Grades: **Again** → interval 0 (repeat this session, +lapse), **Got it** →
  next interval in ladder [1, 3, 7, 14, 30, 60] days (advance one step; Again
  resets to step 0). No other knobs, nothing exposed in UI.
- `GET /api/review/queue` → {due: Card[], counts:{due,new,total}} — server joins
  scheduling state with live artifacts (drops orphans, hydrates card content).
- `POST /api/review/grade` {cardId, grade:"again"|"good"} → updates state,
  returns next queue slice. Zod everywhere; review.json corruption → rebuild empty.

**Implementation notes (deviations from the literal wording above):**
- review.json's top-level shape gained an optional `streak: {count, lastDay}`
  field beyond `{version, cards}` — needed to back the UI's "streak line"
  (below) with something durable. It's bumped once per calendar day the first
  time a grade is recorded that day; never exposed as a stats page (still
  respects the non-goal below), just the one summary-line read.
- Both `GET /api/review/queue` and `POST /api/review/grade` responses add a
  third field, `streak: {count, lastDay} | null`, alongside `due`/`counts`,
  for the same reason.
- `counts.new` = the subset of `due` that have never been graded (`reps === 0
  && lastGrade === null`) — i.e. cards introduced for the first time this
  call, as opposed to a previously-graded card that's simply come back due.

## UI (YouTube-native)
- **Entry points:** TopBar gains a Review icon-button with a due-count badge
  (YouTube notification-bell placement/look); home page shows a slim "Review —
  N cards due" banner card when N>0 (hidden at 0).
- **Review view** (`#/review`): centered single card on `--surface-bg`, card on
  `--surface-raised` with `--shadow-2`, max-width 720px. Front → "Show answer"
  (Space) → back reveals with a fast flip/fade (`--duration-standard`), then two
  pills: "Again" (danger-outline) / "Got it" (filled accent) — hotkeys 1/2 or
  A/G. Progress: thin top bar (cards done / session total). Session ends →
  summary state ("All caught up" + streak line) with "Back to StudyLoop".
- **Clip loop:** bubble cards with a local-video source get a "Play 10s clip"
  button on the BACK: inline muted-by-default mini player (existing /api/video/stream
  + range) looping [t−5, t+5] with the existing A-B loop logic; YouTube-source
  cards fall back to a "Open at timestamp" link into the watch view ("Open at
  timestamp" is implemented as a PATCH of the target project's `lastPosition`
  to the card's `t`, then navigating into `#/study/:id` — it reuses the
  existing resume-prompt flow rather than adding a new seek-via-URL
  mechanism). Clip is lazy — no video element until pressed.

  Deviation: the loop itself is a small standalone `<video>` element
  (`ReviewClipPlayer`) with its own `timeupdate`-driven [start, end] loop —
  not literally LocalVideoPlayer's A-B loop (that's wired into the global
  zustand store's `controller`/sync-engine, which review mode intentionally
  never touches, since a review session isn't a study session). Same loop
  *behavior*, independent implementation.
- Reduced-motion honored; skeleton while queue loads; empty state when no cards
  exist yet ("Take notes while studying — they come back here for review").
- Keyboard-first: Space reveal, 1/A again, 2/G got-it, Esc exit.

## Non-goals (this build)
No per-project decks, no stats page, no configurable ladder, no import of
overlay/others' cards (own artifacts only).
