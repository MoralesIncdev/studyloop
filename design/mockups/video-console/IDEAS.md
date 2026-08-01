# Video Console — Idea Backlog (pre-wiring)

Captured 2026-07-31 from the v4 mockup sessions, before the build brief.
Mockup: `design/mockups/video-console/index.html` (v4 holo).
Wire-first picks are marked **[W]**.

## Timeline as the universal dock

1. **[W] Everything parks** — notes, frame captures, test cards, map snapshots all dock
   to their timestamp tick, not just concepts. The seek bar is the session's taskbar;
   nothing closes, it parks at its moment.
2. **Tick hover-peek** — hovering a parked tick ghosts a micro-label (title + kind);
   click restores the pane.
3. **[W] Timeline zoom** — pinch/scroll zooms the seek bar. Required for the 7-hour
   corpus: at full width a 7h video is ~4 s/pixel and parked ticks pile into mud.
4. **Concept-aware scrubbing** — scrub snaps softly to concept boundaries; hover shows
   a thumbnail strip.
5. **Heatmap layers** — tap the heat band to cycle: attention / capture density /
   concept decay (review mode inverts its meaning to "what is fading").

## Pane engine capabilities (new pane type = new feature, zero new chrome)

6. **[W] Pane types as a registry** — concept, note, test, map are the first four;
   every future modality is a plugin pane type.
7. **Drill pane** — PROCEDURE units already carry drill pairing + failure modes;
   surface "drill this: trigger → movement → failure check". Free data.
8. **Echo pane** — SAME_AS edge to a concept attested in another video whispers
   "you knew this as X in Vol 2" with a jump link.
9. **[W] Suggested-notes pane (F8)** — the 1,012 lesson JSONs carry timecoded
   `study_cues`; they arrive as bare floating suggestions to accept or ignore.
10. **Telestrator pane** — capture a frame into a pane and draw on it (circles,
    arrows, angle lines). The sports-coaching killer feature for physical skills.
11. **Voice note** — hold-to-record, pinned to timestamp. Council verdict: mat-side
    is audio-first; this is its console entry point.
12. **Smart placement** — new panes materialize into the least-busy quadrant of the
    footage (cheap luminance/motion heuristic), never over the instructor.

## Playback intelligence

13. **[W] Note-taking rewind** — typing pauses playback; resume rewinds 3 s.
14. **Per-content smart speed** — talk at 1.75×, demonstrations at 0.75×, keyed off
    transcript density or concept spans.
15. **Concept-scoped A-B loop** — one key loops the current concept's demonstration
    span.

## Modality choreography

16. **Generate transform** — footage freezes and dims, one prompt pane center-stage,
    answer sealed behind it. Same room, exam lighting.
17. **Review transform** — chapter rail becomes the test deck, heatmap flips to decay
    view, lapsed cards degrade to their source clip (pedagogy doc's graceful chain,
    made spatial).
18. **End-of-video exhale** — final second: console dims, session ledger + thread
    discovery rise into the viewport. Discovery is the closing scene, not a scroll.
19. **Attestation as spatial verb** — drag a proposal onto the concepts cabinet to
    attest-intent; drag off-screen to reject.

## Wiring realities (build-brief constraints, not features)

20. **`backdrop-filter` over live `<video>` is expensive** — the v4 address-bar-only
    glass is also the right performance call: blur small strips, keep bodies
    transparent, cap simultaneous blurred surfaces.
21. **Fractional position persistence**, per-project and per-modality; console layout
    rides along in `.studyloop.json` share bundles.
22. **[W] Contrast floor for bare text** — dynamic scrim behind bare text when footage
    goes bright (white gi kills unshadowed text). Plus reduced-motion variant and
    focus rings.

## Interaction model (settled in v3/v4, keep as invariants)

- Content panes arrive **bare** (frameless text); tools arrive glass.
- Hover ghosts the frame in; the **address bar carries the surface**, the body stays
  near-transparent.
- Proposals linger until the next concept reaches the playhead; any touch cancels
  auto-park.
- Drag-to-park: carrying a tick-anchored pane into the transport zone arms it (pane
  shrinks, tick flares); release docks it.
- Parked = pulsing amber tick at its timestamp. Attested = jade. Real counts only,
  never scores; answers stay sealed until attempted.
