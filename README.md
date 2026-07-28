# StudyLoop

StudyLoop is a local-first web app for deep study of long-form video — local files or
YouTube. It syncs a player to a transcript, surfaces concept cards at the moment
they're cited, lets you drop time-anchored notes with screenshots as you watch, keeps a
long-running session notebook, and compiles everything you captured into one markdown
study document. There's no database and no cloud account: every project is a plain
folder of files (JSON, markdown, JPEGs) that you can read, back up, or `git commit`
yourself. It's domain-agnostic by design — a BJJ instructional corpus was the first
concept-doc profile, but any lecture, talk, or tutorial works out of the box.

- **Player + synced transcript** — active segment highlighted and auto-scrolled;
  click a line to seek; search box to jump.
- **Playback ergonomics** — J/K/L shuttle, speed control, A/B loop for drilling a
  section, keyboard-first.
- **Time-anchored notes ("bubbles")** — pause-and-annotate with an auto-captured
  frame, or a silent screenshot-only capture; both show up as pins on the seek bar
  and a chronological rail.
- **Long-running notes** — a persistent markdown notebook per project, autosaved,
  with one-key timestamp links back into the video.
- **Concept ticker** — cards from an attached concept document slide in exactly when
  their cited timestamp arrives; a "concepts covered" list tracks your furthest
  progress.
- **Compile** — one button merges your notes + captures + covered concepts into a
  single markdown document, with a rendered preview, Copy, and Reveal in Finder.
- **Local video or YouTube** — same player interface either way; YouTube captions,
  when available, are pulled in automatically as the project's transcript.

## Quickstart

```bash
npm install
npm run dev
```

This starts the Fastify API on `http://127.0.0.1:4600` and the Vite dev server on
`http://127.0.0.1:4601` (proxying `/api` to the server). Open `http://127.0.0.1:4601`.

On first run, StudyLoop creates `~/.studyloop/config.json` with no library folders
configured — the Library screen shows a setup card pointing you at Settings. From
there:

- Add **library folders** (scanned for video files) and, optionally, **transcript
  folders** (scanned for matching transcript JSONs) and a **concept document**.
- Or skip setup entirely and paste a YouTube URL into the box on the Library screen —
  no configuration needed to start studying a YouTube video immediately.

Optional `ffmpeg` and `yt-dlp` binaries unlock screenshots and YouTube caption/stream
resolution respectively. Neither is required to install StudyLoop or browse your
library; if `ffmpeg` is missing, the screenshot controls disable themselves with a
tooltip explaining why instead of failing silently.

### Running the built app (`npm start`)

```bash
npm start
```

Builds both the server and the web app, then starts the server in production mode —
it serves the built web app statically and answers `/api/*` on the same port
(`4600` by default). Use this for a persistent local install instead of `npm run dev`.

## Configuration reference

Config lives at `~/.studyloop/config.json`, auto-created on first run:

```json
{
  "dataDir": "~/StudyLoopData",
  "libraryRoots": [],
  "transcriptRoots": [],
  "conceptDocs": [],
  "anthropicApiKey": null
}
```

| Field | Meaning |
|---|---|
| `dataDir` | Where project folders (notes, bubbles, screenshots, exports) are written. `~` is expanded. |
| `libraryRoots` | Folders scanned for video files (`.mp4`, `.mov`, `.mkv`, …). |
| `transcriptRoots` | Folders scanned for transcript JSON files, matched to videos by their `source_video` field. |
| `conceptDocs` | Markdown files available to attach as a project's concept document. |
| `anthropicApiKey` | Optional, reserved for a future AI-assist feature. Not required for anything in this release; write-only from the browser (`GET /api/config` never echoes it back). |

Edit via the Settings screen in the app, or the file directly (restart the server after
a manual edit — it's cached in memory).

**Migrating from `~/StudyLoop`:** if you set up StudyLoop before this release, your
`config.json` may still have `dataDir: "~/StudyLoop"`. That's left untouched — existing
configs are never silently rewritten. The default changed to `~/StudyLoopData` because
on macOS's default case-insensitive APFS volume, `~/StudyLoop` resolves to the *same
directory* as a repo cloned to `~/studyloop`, so a fresh install's project data could
land inside your git working tree. If you're on the old default and your `dataDir`
happens to collide with a clone of this repo, move your data (`mv ~/StudyLoop
~/StudyLoopData`) and update `dataDir` in Settings.

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `STUDYLOOP_PORT` | `4600` | Server port. The Vite dev proxy reads the same variable, so `STUDYLOOP_PORT=5000 npm run dev` moves both sides together. The generic `PORT` env var is **deliberately ignored** — a dev harness or process manager commonly exports a generic `PORT` for whatever it's launching, and since this repo runs two servers under one `npm run dev`, an ambient `PORT` meant for something else could otherwise silently steal the API server's port. |
| `WEB_PORT` | `4601` | Vite dev server port. |
| `HOST` | `127.0.0.1` | Interface the server binds to. Loopback-only by default — there's no authentication, so only widen this if you understand the exposure (e.g. reaching it from another device on your LAN). |
| `STUDYLOOP_FFMPEG_BIN` | `ffmpeg` | Override the ffmpeg binary path/name. |
| `STUDYLOOP_YTDLP_BIN` | `yt-dlp` | Override the yt-dlp binary path/name. |
| `STUDYLOOP_FFPROBE_BIN` | `ffprobe` | Override the ffprobe binary path/name (used for local-video duration lookups). |
| `STUDYLOOP_FAKE_ANALYSIS` | unset | Set to `1` to make the ✨ Analyze pipeline use a deterministic, offline fake generator instead of calling the real Anthropic API — no `anthropicApiKey` required. Same code path as production (chunking, merge, analysis.json), just a fake LLM client underneath. Useful for demos, screenshots, and trying the full analyze → pearls → heatmap → compile flow without an API key. |

## Hotkeys

Disabled while typing in an input, textarea, select, or contenteditable element.

| Key | Action |
|---|---|
| `Space` | Play / pause |
| `J` / `L` | Seek −10s / +10s |
| `←` / `→` | Seek −5s / +5s |
| `K` | Pause |
| `,` / `.` | Speed −0.25 / +0.25 (clamped 0.5×–2.5×) |
| `A` | Set loop point A at the current time |
| `Shift+A` | Clear the A/B loop |
| `B` | Set loop point B at the current time (must be after A) |
| `N` | Open the notation modal (pauses, captures a frame, prefills the active transcript line) |
| `S` | Screenshot-only capture (no pause, no modal — toasts a confirmation) |

## Transcript formats

`GET /api/transcript` dispatches by file extension. Supported shapes:

- **`.json`, BJJ-corpus style:** `{ "timestamps": [{ "start": 0, "end": 2.1, "text": "…" }], "source_video": "…" }`
- **`.json`, generic whisper-style:** `{ "segments": [{ "start": 0, "end": 2.1, "text": "…" }] }` — this is also
  what YouTube auto-captions get normalized into and persisted as `captions.json`
  inside a YouTube project's folder.
- **`.srt`** — standard SubRip.
- **`.vtt`** — standard WebVTT (including YouTube's auto-generated captions).

## Concept-doc profiles

A concept document is any markdown file, attached to a project (or configured globally
under `conceptDocs`), that gets parsed into timestamp-anchored cards surfaced by the
concept ticker as playback reaches their citation.

**`headings`** — the generic profile, works with any markdown: each `##` section
becomes a card; any `@ mm:ss`, `@ h:mm:ss`, or `[mm:ss]` token found in the section
body becomes an anchor.

```markdown
## Concave Shoulders

The default posture from open guard. Round the upper back and drive the far
shoulder down. Covered at @ 31:10 and revisited @ 1:12:45.

## The Frame

Keep the elbow inside the knee line — see [8:45] for the setup and [22:00] for
the failure case.
```

**`bjj-curriculum`** — a stricter profile for the BJJ corpus this app was built
against: sections cite a specific video via `Seated Vol N @ mm:ss` / `Supine Vol N @
mm:ss`, and a card only lights up for a project whose video filename matches that
citation's type + volume number. A bare `@ mm:ss` with no volume citation applies to
every project. Auto-detected when the document contains at least one genuine
`Seated/Supine Vol N` citation; falls back to `headings` otherwise (or if fewer than 2
cards would end up anchored).

## Troubleshooting

**Port already in use.** The server logs a clear message and exits rather than
silently binding somewhere unexpected — set `STUDYLOOP_PORT=<other-port>` (and restart)
to move it, or stop whatever else is using `4600`. Note the generic `PORT` env var has
no effect here (see Environment variables above) — a dev harness's ambient `PORT` won't
be the cause of a conflict.

**Screenshots are disabled / greyed out.** `ffmpeg` isn't on `PATH` — the app checks
via `GET /api/health` on load and disables screenshot controls (and the notation
modal's frame capture) with a tooltip/toast explaining why, instead of letting captures
fail one at a time. `GET /api/health` caches each tool's availability for up to 5
minutes, so installing ffmpeg mid-session and reloading may take a moment to be
picked up — restarting the server picks it up immediately. Install ffmpeg (`brew
install ffmpeg` on macOS) and reload.

**YouTube project has no title or captions.** `yt-dlp` isn't on `PATH`. The project is
still created (title falls back to the URL) — playback and manual note-taking work
fully; only auto-title and auto-captions need `yt-dlp`. Install it (`brew install
yt-dlp` or `pip install yt-dlp`) and create the project again for the metadata to
resolve.

**A library folder shows a warning, or videos are missing.** The configured root is
probably an unmounted external drive — StudyLoop skips missing roots with a warning in
the library response rather than crashing. Reconnect the drive and hit "Rescan
library".

**"Reveal in Finder" did nothing.** It's macOS-only (`open -R` under the hood); on
other platforms it responds with a message instead of erroring, and the compiled
file's path is still shown in the preview modal so you can navigate to it manually.

## Security notes

- The server only accepts requests whose `Origin` is `localhost`/`127.0.0.1`/`[::1]`
  (any port) — nothing else is allowed by CORS.
- `GET /api/config` never returns your Anthropic API key; it reports
  `anthropicApiKeySet: true/false` instead. `PUT /api/config` is still how you set it.
- Every file-path request (video streaming, transcripts, concept docs, project
  creation, Reveal in Finder) is checked against your configured roots (or, for
  server-managed files like a YouTube project's `captions.json`, that project's own
  folder) using resolved, symlink-aware paths — not just string prefixes. A
  project-relative transcript read only ever serves that project's own declared
  `transcript.path`, never an arbitrary file that merely happens to live next to it.
- Every project id (`:id`/`projectId` route params) is constrained to the UUID shape
  ids are generated in — a crafted or path-traversal-shaped id (including a
  URL-encoded `..%2F` sequence) is rejected before it reaches a filesystem path.

## License

MIT — see [LICENSE](./LICENSE).
