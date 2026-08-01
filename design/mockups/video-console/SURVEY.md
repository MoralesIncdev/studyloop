# Video Console — Market Survey Synthesis

2026-07-31. Six parallel research agents (5 niches + gap critic), web-grounded.
Raw structured findings: `survey-raw.json`. Companion docs: `IDEAS.md`, mockup `index.html` (v4).

Niches: pro video review (Frame.io, Vimeo, Wipster, Filestage) · sports coaching (Hudl,
OnForm, Dartfish, Kinovea, Coach's Eye) · language-learning overlays (Language Reactor,
asbplayer, Migaku, LingQ, Voracious) · learning platforms (YouTube, Coursera, edX,
Brilliant, Skillshare) · HUD editors (WoW Edit Mode, ElvUI, FFXIV, RaceLab, visionOS).
Gap sweep: Scrimba, danmaku (Bilibili), Descript, Prime X-Ray, mpv, Chessable,
Apple Music Sing, Twitch Extensions, CapCut, YouTube Ambient Mode.

---

## Part 1 — The laws (independent convergence across niches)

1. **The seek bar is the index.** Frame.io parks every comment as a playbar bubble;
   Skillshare pins notes as bar markers with hover-preview; Coursera *measurably lacks*
   tick affordances and learners scrub-hunt to approximate them (they seek backward from
   quizzes at 55× baseline). Our park-to-tick design is settled prior art, not a bet.
2. **Chrome breathes with intent.** YouTube's heatmap/chapters/thumbnail stack exists
   only on hover; visionOS summons window handles by attention; Twitch requires overlay
   extensions to fade with player chrome; language tools infer "studying now" from
   cursor-over-overlay and pause automatically. Nothing persistent, everything summoned.
3. **Annotations have temporal envelopes and lifetimes, not just birth timestamps.**
   Kinovea drawings fade-in → hold → fade-out around their key frame; CapCut gives every
   text element a draggable lifetime strip; Hudl comments carry drag-handle ranges and
   surface as playback crosses them.
4. **Pause is a semantic event.** Prime X-Ray slides in scene-scoped context on pause;
   Scrimba makes pause literally BE attempt-mode (frozen frame becomes a workspace);
   Coursera's pause-overlay quizzes (Submit/Skip, no timer, ungraded) get 74% voluntary
   attempt rates and *reduce* dropout (Stanford, 96k learners).
5. **Edit mode and play mode are different worlds; a layout is one object.** WoW/RaceLab:
   play = click-through + chrome-free, edit = everything outlined and draggable, including
   normally-hidden elements (ElvUI movers, FFXIV purple ghosts). Layouts are named slots,
   duplicated-then-diverged, serialized to share strings, auto-switched by context.
6. **Typing choreography is solved.** Frame.io/Wipster: focusing a comment box pauses the
   player and stamps the frame; sending returns keyboard focus to the player. A yellow
   provisional range appears on the bar while composing; commit solidifies it.
7. **Annotations must stay live data.** Coach's Eye died and a decade of annotations died
   with it (rendered video only). OnForm/Dartfish ship dead exports. Everything anchored
   must remain queryable, exportable, re-anchorable — replay is a view, never a format.

## Part 2 — Deltas to apply to the v4 console (ranked)

1. **Range ticks with tails + tick-scoped playback.** Concepts get an optional span, drawn
   as a tick with a tail along the bar (Frame.io). Clicking a parked tick makes its range
   the playback window with loop available — exactly the drill-a-sequence mechanic.
2. **Temporal opacity envelope on parked concepts** (Kinovea): the concept's bare text
   fades in as the playhead approaches its tick, holds through its range, dissolves after.
   Replaces binary show/hide; the tick glows while its content is faded so nothing
   "mysteriously disappears."
3. **Hover-pause with auto-resume** (Language Reactor/asbplayer): cursor entering any
   overlay soft-pauses the video; leaving resumes. Hitbox tight to the text, not the
   region. Reading and watching become states the player manages.
4. **Sealed answers become blur-to-reveal + a scaffold slider.** Blur the AI layer until
   attempt (LR ships this today); add Apple Music Sing's continuous attenuation as a
   per-video "scaffold" dial the learner turns down as recall improves.
5. **Heatmap goes hover-only, YouTube-template:** 100 normalized buckets, spline-smoothed
   silhouette above the bar, visible only on hover/scrub, suppressed below a data
   threshold, top peak labeled and clickable. (Change from v4's always-faint band.)
6. **Real edit mode:** play mode = panes click-through (clicks reach video/seek);
   one lock toggle flips all panes editable; edit mode materializes hidden panes as
   labeled ghosts; magnetism + optional grid + 1px nudge box; stepped S/M/L sizes with
   fine-adjust escape; three named layout slots (Watch / Drill / Review) auto-switched
   by modality, serialized into `.studyloop.json`.
7. **Pause = attempt + context.** On pause (after ~500 ms so frame-inspection pauses stay
   clean), surface the concepts whose ranges cover the playhead, prior notes, due review
   items — every item actionable, dismissible per session. The attempt pane opens pre-
   seeded with the moment's context (Scrimba grammar).
8. **Transport grammar:** single-key cycling A-B loop (mpv: A → B → clear) with persisted
   bracket marks promotable to ticks; prev/next-tick seek keys; hold-to-crawl frame step;
   discrete speed presets; `?` keycap overlay; transient first-use key hints.
9. **Note choreography:** focusing any input pauses + stamps; a yellow provisional tick
   appears immediately, draggable into a range; Esc reverts to point; commit returns
   focus to player and resumes. Typing `@@drill`-style tokens in a note parks a typed
   tick as a side-effect (Descript marker pattern).
10. **Cabinet ↔ video bidirectional sync** (Chessable): the concepts cabinet auto-
    highlights what is being taught now; every entry carries jump-to-video; during pause
    the learner can "take over" a concept (edit/attempt) then resync.
11. **Transcript as transport peer** (Descript/edX): click-word-to-seek, select-text →
    park concept (tick at first word's cue), explicit following vs browsing scroll states.
12. **Rewatch resurfacing** (danmaku, tamed): on rewatching, the learner's own past notes
    fade in-place at their anchors — free review impressions. Governed by one "overlay
    pressure" slider + hard no-annotation reserves (caption zone, seek strip).
13. **Hologram tint from footage** (Ambient Mode): sample frame colors at 1–2 Hz, tint
    pane borders/glow so panes read as emitted by the footage. Borders only — never
    behind body text without a contrast guard.

## Part 3 — Per-niche pattern cards (condensed; full detail in survey-raw.json)

### Pro review tools
| Product | Steal | Note |
|---|---|---|
| Frame.io | Playbar bubbles w/ range tails; click = range becomes loopable playback window; I/O range keys + yellow provisional selector; auto-pause-on-type + focus-return; annotations hidden until their card is selected; J-K-L/frame-step/`?` grammar | The complete interaction skeleton for our tick system |
| Vimeo Review | Click-the-frame = anchor gesture; hide-notes "lights off" toggle; notes travel with video version | Feed-only structure fails on 90-min content |
| Wipster | Click = pause + anchor + input in one gesture; checkoff with dated audit trail (SRS-shaped data) | Click-to-comment steals the play/pause click — disambiguate |
| Filestage | Timeline markers as pre-play signal (embryonic heatmap); forced end-of-pass self-verdict ("got it / another pass") feeding the scheduler | Approval ceremony = guilt machinery, skip |

### Sports coaching
| Product | Steal | Note |
|---|---|---|
| Hudl | Range comments w/ drag handles surfacing as playhead crosses; annotate-in-place (they publicly reversed clip-first ceremony); one-key preset annotation types | Tick IS the artifact — never gate annotation behind clip creation |
| OnForm | Recorded walkthrough replay (scrub+draw+voice as choreography, not pixels); two-tap side-by-side/overlay compare; discrete speed presets | Keep replays as live state playback, not rendered video |
| Dartfish | Named key positions as phase-sync anchors (pick from list, never typed strings); one shared clock for multi-clip; ghost blend w/ flip/zoom/offset; StroMotion composite as concept summary-frame | |
| Kinovea | **Key images as annotation containers + fade-in/opaque/fade-out envelopes** (the single most StudyLoop-shaped mechanism found); time-origin sync model; per-tool semantic style profiles | Cascade deletes need undo; envelopes need visible cause |
| Coach's Eye † | Geared flywheel/jog for micro time (seek bar stays macro); on-video timers (outsized retention); recorded reviews | Died with annotations-as-video — the data-death cautionary tale |

### Language learning
| Product | Steal | Note |
|---|---|---|
| Language Reactor | **Hover-pause/auto-resume**; subtitle-unit A/S/D transport; **blur-to-reveal**; synced collapsible transcript panel | Density ceiling: max one always-on text layer over footage |
| asbplayer | **Zero-dialog one-key mining** (span+frame+transcript auto-packaged); append-to-last-capture; boundary-pause at start OR end of segment; **condensed playback driven by annotation density**; global anchor-offset nudge | 5-key core, not 35 hotkeys; SRS must work out of the box |
| Migaku | SRS state re-paints the overlay (concepts visibly "cool" as you master them); hover+modifier for expensive popups; per-video opt-in gating | Cap visible state palette at ~3; every auto-state needs one-click override |
| LingQ | Capture-without-pausing (click silently parks + queues); global cross-video word/concept identity; segment-stepped sentence mode | Never bulk-mutate learning state on navigation ("Complete Lesson" trap) |
| Voracious | Quiz viewing mode: stop → attempt → staged reveal → advance (generate-first as player mode, pre-AI); replay-current-segment as most-used single key | |

### Learning platforms
| Product | Steal | Note |
|---|---|---|
| YouTube | **Heatmap template**: 100 buckets, normalized, spline, hover-only, cold-start suppressed, labeled clickable peak; chapters as physical bar gaps; one hover x-position lights 4 synced readouts | Autoplay countdown + end-screen occlusion = the anti-patterns |
| Coursera | Pause-overlay attempt pattern (Submit/Skip, no timer, ungraded → 74% attempt rate); learners use questions as landmarks (55× back-seek) → make them clickable ticks + one-tap "rewind to concept start"; Save Note dual path (frame-grab / transcript-highlight) with video never stopping | Don't place prompts at video tails — learners bail before recaps |
| edX | Word-level click-to-seek transcript; timemap data shape (time → component) | Their overlay quiz bolted onto a foreign player is "brittle" by their own admission — our unified pane layer is the fix |
| Brilliant | Answer-specific feedback (respond to what was attempted); explorable reveals; asymmetric emotional budget (warmth on hits, quiet dignity on misses, never gates) | Streaks/XP/leagues = loss-aversion, banned already |
| Skillshare | The full pushpin lifecycle: capture-at-playhead → marker-on-bar → hover-preview (free glance) → click-to-seek (deliberate); tick + cabinet entry as two views of one record | Private-first layers; capture must never be paywalled; export from day one |

### HUD editors
| Product | Steal | Note |
|---|---|---|
| WoW Edit Mode | Hard edit/play gate; grid snap OR element magnetism from the same drag; clipboard layout share strings; per-context auto-layouts | Editable must be universal: if it draws over video, it moves |
| ElvUI | Materialize ALL panes (incl. hidden/conditional) as labeled ghosts in edit mode; 1px nudge box w/ numeric coords; right-click pane → its settings directly | Simulate conditional states inside edit mode |
| FFXIV | Stepped size presets encode importance hierarchy; purple-ghost disabled panes; 4 copyable layout slots | Name the slots; allow fine-adjust escape hatch |
| RaceLab | **Lock toggle = whole edit/play boundary; locked = click-through**; layout as one persisted object; context selectors auto-switch layouts | Keep one discoverable re-entry affordance when chrome is invisible |
| visionOS | Attention-summoned single-purpose handles (one move bar, one resize corner); time-anchored vs screen-anchored as first-class choice; global density setting over per-pane fiddling | Gaze-chrome without snapping/persistence collapses — combine lineages |

### Gap sweep
| Product | Steal |
|---|---|
| Scrimba | Pause IS attempt-mode; learner artifacts as diffs at timeline positions ("what I tried at 12:40" is addressable) |
| Danmaku | Own-notes fly/fade at anchors on rewatch; overlay-pressure slider + display-area limiter |
| Descript | Transcript as full transport peer; inline `@@token` → typed tick as typing side-effect |
| Prime X-Ray | Pause surfaces timestamp-scoped context automatically (~500 ms delay; every item actionable) |
| mpv | Single-key cycling A-B loop; tick-seek as primary navigation; hold-to-crawl frame step |
| Chessable | Bidirectional video ↔ knowledge-object sync with diverge/resync states |
| Apple Music Sing | Progressive text-fill as fine-grained playhead; continuous scaffold-attenuation slider |
| Twitch Ext | Overlay/component slot taxonomy; click-through by default; HUD fades with player chrome as one organism |
| CapCut | Per-element lifetime strips under the scrub bar; unified corner scale-rotate |
| Ambient Mode | Footage-sampled glow on pane borders (1–2 Hz, cross-faded, off during scrub) |

## Part 4 — Trap registry (never do)

- Marker confetti: per-item bar markers with no clustering/zoom die on long video (every review tool).
- Click-anywhere-to-comment stealing the play/pause click (Wipster).
- Hard-modal overlays with one exit that fight the dominant rewind-before-answering behavior (edX).
- Bolting interactions onto a player you don't own — share one state machine (edX's own postmortem).
- Annotations as rendered video = data death (Coach's Eye); frozen artifacts (OnForm).
- Bulk state mutation on navigation (LingQ "Complete Lesson"); auto-states without in-place override (Migaku).
- Streaks/XP/guilt reminders (Brilliant leagues, Filestage nagging) — already banned by PEDAGOGY.md.
- Prompts at video tails (learners quit before recaps — Coursera logs); autoplay countdowns hijacking the reflective moment.
- Configure-before-first-value gates (asbplayer/Anki setup, Voracious dictionaries).
- Public/community layers on by default (Skillshare clutter); non-exportable or paywalled capture.
- Unbounded overlay density (danmaku occlusion); attention-bait text styling (TikTok).
- Silent feature-stripping in degraded modes (Coursera offline losing quizzes) — degrade visibly.
- Five simultaneous state colors over footage — cap at ~3, encode the rest in weight/opacity.

## Part 5 — Evidence worth citing in the build brief

- Stanford/Coursera (96k learners): 74% voluntary attempt rate on ungraded pause-overlay
  quizzes; in-video dropout LOWER with quizzes present; 55× baseline backward-seek from
  questions; 4× forward-seek to them; learners almost never scrub past a quiz.
- Hudl publicly reversed its clip-first annotation flow → annotate-in-place.
- edX maintainers call their own overlay-quiz architecture "brittle."
- Coach's Eye users kept a dead app installed for its on-video timers.
