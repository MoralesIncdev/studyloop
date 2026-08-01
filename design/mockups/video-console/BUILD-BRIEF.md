# Video Console — Build Brief (mock → web/src)

2026-07-31. Spec package: `index.html` (v6 mock, frozen), `SURVEY.md` (evidence),
`IDEAS.md` (backlog). This brief maps the console onto the real codebase.

## Ground truth about the real app (recon 2026-07-31)

The player stack is more mature than the mock assumed. Already shipped:
- `player/SeekBar.tsx`: concept ticks (point, tooltip), bubble pins w/ hover previews,
  pearl markers, overlay markers, loop A/B range + markers, attention heatmap strip
  with click-to-inspect popover (`HeatmapStrip`, `AttentionPopover`).
- `player/PlayerChrome.tsx`: YouTube-style hover chrome (3s idle fade) — law #2
  ("chrome breathes") is already the architecture.
- `state/store.ts`: `loopA/loopB/setLoopA/setLoopB/clearLoop`; both players enforce
  the loop during playback.
- Data model: `ConceptAnchor { t }` and `UnitAnchor { t, quote }` are POINTS — no
  spans anywhere. Spans must be derived (see slice 1) or added to analysis output.

## Slices (each lands green on `npm test` + typecheck, committable alone)

### ✅ Slice 1 — Concept-scoped looping (branch `console/slice-1-concept-loop`)
Click a concept tick → its span becomes the playback window via the existing loop
machinery; click again releases; active tick renders amber. Span derived client-side
(`lib/conceptLoop.ts`: until next tick, min 10s, cap 60s). Files: `conceptLoop.ts`
(+7 tests), `SeekBar.tsx` (+`onConceptTick`/`activeConceptTickId`), `SeekBar.module.css`,
`PlayerChrome.tsx`.

### Slice 2 — Hover-pause with auto-resume
Pointer enters any study surface (concept card in rail, bubble tooltip, transcript
pane) → soft-pause; leave → resume iff auto-paused. One store flag `autoPaused`;
players read it. Tight hitboxes (the element, not its region). ~1 day.

### Slice 3 — Note choreography + note-rewind
Focusing any note input pauses + stamps `t`; commit returns focus to the player and
rewinds 3s on resume. Provisional tick on the seek bar while composing (yellow),
solidifies on save, reverts on abandon. Files: notes/ components + store + SeekBar
(one new marker kind). ~1 day.

### Slice 4 — One-key mining (`M`)
Global key: package current moment (span from conceptLoopSpan, frame grab via
existing ffmpeg shot pipeline, transcript slice) into a bubble-like "mined" capture,
zero dialog. Server already has shot + transcript endpoints. ~1-2 days.

### Slice 5 — Heatmap polish to the YouTube template
`HeatmapStrip` → spline silhouette, hover/scrub-only visibility (chrome already
fades; bind strip to the same visibility), suppress below data threshold, labeled
clickable peak. CSS + one component. ~1 day.

### Slice 6 — Condensed playback
Toggle: playhead skips spans with no concepts/marks (derive skip-list from ticks +
heatmap buckets). Store-level playback program; players consume. ~1 day.

### Slice 7 — Timeline zoom
View-window state in SeekBar (mock's `view.s/view.e` pattern, wheel + dblclick
reset); all marker layers already render from `pct()` — swap to `pctView()`.
Prerequisite for 7h videos. ~1-2 days.

### Slice 8 — The pane engine (the big one)
New `console/` module: pane registry (concept/note/test/map as plugins), bare/glass
modes, address-bar chrome, drag/resize with magnetism, fractional persistence
per-project, edit mode (materialize hidden panes, click-through play mode),
park/undock to ticks with the Kinovea opacity envelope. This is the v6 mock's
engine ported to React over the real `<video>`. Performance constraint: blur only
the address-bar strips (SURVEY trap list; backdrop-filter over video is expensive).
~1-2 weeks, gate behind a setting (`consoleMode`).

### Slice 9 — Modality choreography + exhale
Generate/Review transforms + end-of-video exhale (ledger + thread rise). Depends
on slice 8. Review-mode heatmap flips to decay coloring.

## Order rationale
1-7 are independent of the pane engine and each ships user value alone; 8 is the
architectural bet and goes behind a flag; 9 rides on 8. Anchor-span data upgrade
(analysis emitting `end` per anchor) can land server-side any time and slices 1/4/6
automatically improve.

## Invariants (from PEDAGOGY.md + SURVEY traps — enforced in review)
- No streaks/XP/guilt; real counts only.
- Generate-first: answers sealed until attempted; reveals explorable.
- Everything anchored stays live data, exportable, in `.studyloop.json` bundles.
- Capture is never gated, never paywalled, never modal.
- Degrade visibly, never silently strip features.
