# Video Study App — Build Plan
*Working name: **StudyLoop** (rename freely). Drafted 2026-07-28. Owner: Ryan Morales.*

A local-first web app for deep study of long-form video. First corpus: BJJ
instructionals. Domain-agnostic by design: any local video or YouTube URL can be
studied. Eventual open-source GitHub release.

---

## What already exists (do not rebuild)

| Asset | Location | Shape |
|---|---|---|
| ASR transcripts | `/Volumes/E6/BJJ Study/01_transcripts/<instructor>/<set>/<vol>.json` | `{text, timestamps:[{start,end,text}], source_video, duration_seconds, asr_engine}` |
| Videos | `/Volumes/SSD2025/Library/BJJ/...` (path recorded in each transcript's `source_video`; verified present) | mp4 |
| Concept curriculum | `/Volumes/E6/BJJ Study/OPEN GUARD — Concept Curriculum.md` | Concept cards cited as `Seated Vol N @ mm:ss` / `Supine VN [file NN]` |
| Extracted lesson cards | `/Volumes/E6/BJJ Study/05_knowledge_base/` | per-lesson JSON: `technique_cards` (preconditions, trigger, mechanism, failure_points, visual_checkpoints), `study_cues` (**timecoded** `{start,end,cue}`), keyed to `source_video` + `transcript` |
| Transcription pipeline | `/Volumes/E6/BJJ Study/00_admin/` (parakeet-mlx via sweep_transcribe.sh) | for new local videos |
| Tooling | ffmpeg, yt-dlp, Node 22 — all installed | |

## Architecture

**Stack: Vite + React + TypeScript frontend, Fastify (Node) backend, no database.**
All study data lives as plain files in a *study project folder* — portable, git-able,
human-readable, and trivially exportable. This is the right shape for a GitHub
release: `npm install && npm start`, point it at a folder.

```
studyloop/
├─ server/            Fastify: video streaming (range requests), library scan,
│                     transcript access, screenshot capture, export, AI proxy
├─ web/               Vite + React SPA
└─ (user data, configurable root, default ~/StudyLoop)
   └─ projects/<slug>/
      ├─ project.json         source (local path or YT id), transcript ref, concept-doc ref
      ├─ notes.md             the long-running session notes (plain markdown)
      ├─ bubbles.json         time-anchored notes [{t, text, screenshot, createdAt}]
      ├─ shots/*.jpg          screenshots (frame grabs)
      └─ exports/             compiled study documents
```

**Video sources — two adapters behind one player interface:**
- **Local:** `<video>` served by the backend with HTTP range support. Screenshots =
  server-side `ffmpeg -ss <t> -i <file> -frames:v 1` (exact frame, full quality, no
  canvas/CORS issues, works even when tab isn't visible).
- **YouTube:** IFrame Player API (compliant — no downloading required to play).
  Screenshots can't come from the iframe, so the server grabs the frame via
  `yt-dlp -g` stream URL + ffmpeg seek. Transcript via YouTube captions (yt-dlp
  `--write-auto-sub`) or local ASR fallback.

**Sync engine (the heart):** one `currentTime` observable drives three consumers —
transcript pane (scroll + highlight active segment), concept ticker (surface cards
whose timestamp window contains t), suggested-notes engine. All are pure functions
of (t, sorted arrays) via binary search — cheap at 10Hz.

**Concept docs — generic contract:** any markdown file + a *timestamp mapping*.
Parser v1 handles the Open Guard curriculum format (`Seated Vol N @ mm:ss` cites,
six-part card frame). The generic path: an in-app "attach concepts" flow that
accepts any markdown split by headings, with timestamps assigned manually or
AI-matched against the transcript. BJJ is just the first parser profile.

---

## Feature plan (phased, each independently shippable)

### Phase 1 — The Player Core (build first, everything hangs off it)
**F1. Library + project open** — scan configured roots for videos and transcripts;
match transcript JSONs to videos via `source_video`; open-by-YouTube-URL box.
*Done when:* Open Guard Seated Vol 1 opens with its transcript in one click.

**F2. Player + transcript sync pane** — video left, transcript right; active segment
highlighted and auto-scrolled; click a segment → seek; transcript search box → jump.
Progress bar shows % through transcript, chapter tick marks if headings exist.
*Done when:* clicking any line seeks; playback highlights follow within 300ms.

**F3. Playback ergonomics** — J/K/L shuttle, speed control with pitch-corrected
audio, A-B loop (mark two points, loop between — *the* drilling-study primitive),
5s/15s jump keys. Keyboard-first: every core action has a key.

### Phase 2 — Capture (the note-taking loop)
**F4. Notation button (bubble notes)** — button + hotkey (`N`): pause → modal opens
with frame screenshot already captured + timestamp + optional transcript quote of
the current segment → type note → save → video resumes. Bubbles render as pins on
the seek bar and as a chronological rail; click to revisit (seeks to t−5s).

**F5. Screenshot-only button** — hotkey (`S`): grab frame at current t, toast
confirmation, *no pause, no modal*. Lands in the bubble rail as an image-only pin;
note can be attached later.

**F6. Long-running notes pane** — persistent markdown editor (bottom or side dock);
autosaved to `notes.md`; typing `@` inserts current timestamp as a clickable link;
drag a screenshot from the rail into the notes.

### Phase 3 — Intelligence (transcript + concepts working for you)
**F7. Concept ticker** — parse attached concept doc; as playback enters a cited
timestamp window, the concept card slides in (title + OBJECTIVE line, expandable to
full card); "concepts covered" checklist for the session; click a concept → jump to
its citation. BJJ curriculum parser is profile #1; generic heading-based parser is
profile #2.

**F8. Suggested notes** — two tiers:
- *Tier 1 (no LLM, whole BJJ corpus, instant):* the lesson JSONs in
  `05_knowledge_base/` already carry timecoded `study_cues` (`{start, end, cue}`).
  When the playing video has a matching lesson JSON, cues surface as ghosted
  suggestions in the notes pane exactly when their window arrives; `Tab` accepts,
  ignored ones expire. Technique-card `failure_points` / `visual_checkpoints`
  surface the same way at their card's window.
- *Tier 2 (LLM, any new video):* rolling AI pass over the transcript window just
  watched (~3min) proposes 1-line candidate notes. Claude API via server proxy;
  fully optional (app works without a key).

**F9. Auto-chapters + segment summaries** — LLM pass over full transcript produces
a chapter outline with timestamps (cached in project). Gives structure to videos
with no concept doc — this is what makes the app good for *any* YouTube lecture.

### Phase 4 — Output (compounding value)
**F10. Compile study document** — one button: merges long-notes + bubbles (with
screenshots inline at their timestamps) + concepts covered + chapter outline into a
single markdown doc (+ optional PDF via existing make-pdf path). Deterministic,
template-driven; optional AI "clean up my notes" pass, clearly labeled.
*Export target for BJJ:* drop into `/Volumes/E6/BJJ Study/02_study_notes/`.

**F11. Review mode / spaced resurfacing** — a "review deck" built from bubbles and
accepted suggestions: each card = screenshot + your note + 10s clip loop. Simple
SM-2-ish scheduling. This is where study becomes retention.

### Phase 5 — Release
**F12. Packaging** — config file for roots/API keys, first-run onboarding, demo
mode with a CC-licensed YouTube video, README + screenshots, MIT license, GitHub
Actions CI. Strip all Antemo-specific paths into config.

---

## Council verdict (advisory council session `council-20260728-130740-fc8e7c`)
*Full transcript: `~/.openclaw/council/sessions/council-20260728-130740-fc8e7c.json`.
Gemini-backed advisor errored (dead auth — known). Key voices below.*

**ProductStrategist** — the failure mode of every video-notes tool is *capture
without retention* ("digital filing cabinets users never open again"). Top novel
features: (1) **Mat-Side Drill Deck** — compile produces a mobile, audio-first
review deck (screenshot + one Failure→Cause→Fix block + TTS "play audio" button)
usable with sweaty hands between rounds; (2) **Reverse Lookup** — one search bar
across every transcript + concept card ("where does anyone talk about defending
the backstep?") that returns clips, not documents; (3) auto-surfaced checkpoint
quizzing. Flags: live AI-suggested notes and bare screenshots optimize capture,
not learning.

**ScientificEditor** (evidence grades for learning efficacy) — active recall:
**STRONG**; spaced repetition: **STRONG** (for retention; moderate for motor
transfer — frame the app as a *memory* aid, not a skill guarantee); drill
logging: MODERATE; AI-suggested notes as passively accepted text: **WEAK** (risk
of passive processing); screenshots without captions: WEAK as retrieval cues.
Recommendation: hide SRS mechanics entirely (no decks/ease factors — Anki-style
exposed mechanics kill adoption).

**RedTeam** — four failure modes: (1) phone-on-the-mat drill deck is a
distraction/breakage hazard — audio-first or print mitigates; (2) **kill shot:**
reverse lookup over raw ASR returns garbage ("berimbolo" → "berry bowl-o");
one bad search result destroys trust in the whole graph — gate search on
terminology cleanup; (3) auto-pause quizzing breaks 2-hour immersion viewing —
must be opt-in, off by default; (4) compile that dumps the substrate is a
500-page unread PDF — export only what the *user* captured.

**CEO synthesis** — v1 is a desktop-first study canvas hardened on the substrate
(player + synced transcript + concept cards + user-verified compile). Defer
drill deck, cross-video search, and quizzing until the data layer and
interruption tolerance are proven. **Open-source the engine, not the BJJ app**:
ship a domain-agnostic curriculum engine (transcript + markdown schema +
timestamped cards) where the BJJ corpus is just the demo profile.

### How the council verdict changed this plan
- **F8 suggested notes stay, but grounded and opt-in** (council wanted them
  killed; Ryan locked them). Mitigation already in the design: Tier 1 serves
  *pre-extracted* study cues (no hallucination surface), nothing enters notes
  without an explicit `Tab` accept, and the whole panel has an off switch.
- **F5 screenshot-only stays** (locked), with a lightweight fix for the
  weak-retrieval-cue problem: uncaptioned shots get flagged in the bubble rail
  and the compile step offers a 5-second "caption these" pass.
- **F10 compile exports only user captures** + concepts actually covered — never
  the raw substrate. Red team's 500-page failure mode is designed out.
- **F11 review mode promoted** — strongest-evidence feature in the whole plan
  (active recall + spaced repetition both STRONG). Mechanics hidden: one
  "Review" button, swipe-through cards, no scheduling UI.
- **New Phase 6 (later):** Reverse Lookup search — explicitly gated on a BJJ
  terminology normalization pass over the ASR (ties into the existing N7
  "Rosetta Stone" idea in BJJ_ENGINE_IDEAS.md). Mat-Side Drill Deck — audio-first
  variant of the compile output, printed one-pager as fallback.
- **Quiz mode: opt-in toggle only**, never default — added to F11 backlog, not v1.

## Decisions needed from Ryan
1. **App name** — "StudyLoop" is a placeholder; pick before the GitHub repo is created.
2. **v1 cut line** — recommendation: Phases 1–2 + F7 (concept ticker) + F10
   (compile) = the complete loop you described. F8/F9/F11 next. Confirm or adjust.
3. **AI suggested notes** — council says kill, plan keeps them grounded + opt-in
   per your spec. Confirm you want them in v1 or moved to Phase 3.
4. **Stack** — Vite/React/TS + Fastify, file-based storage (no DB). Objections?
