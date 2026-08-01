// F3 ergonomics: the full hotkey set, disabled while the user is typing in an
// input/textarea/contenteditable. Reads/writes the store directly (via
// getState()) rather than through selectors, since this is an imperative side
// effect hook, not something that should re-render on every keystroke.
//
// Console slice B (design/mockups/video-console/index.html lines 1243-1266,
// 730-744 "Console shortcuts" overlay): the hotkey grammar was rebuilt to
// match the mock's, moving off the old YouTube-editor bindings (j/l ±10s,
// a/b set loop points, plain c=captions) that never appeared in the mock's
// own keymap:
//
//   space         play / pause
//   L             A-B loop: set A → set B → clear (mpv grammar, replaces the
//                 old j/l ±10s seek — j is now unbound, freed up by it; ← →
//                 already cover ±5s/prev-next-concept seeking)
//   M             mine this moment (frame + transcript slice, no dialog)
//   C             condensed playback: play concepts only (was X; X still
//                 works too, as a legacy alias — SURVEY.md slice 6 shipped
//                 with X first and existing muscle memory shouldn't break)
//   B             toggle captions (freed up from C, which condensed now owns)
//   ← / →         previous/next concept tick when the video has any; falls
//                 back to ±5s seek when it doesn't
//   , / .         step 1s back / forward (was rate ±0.25 — rate now lives on
//                 the transport's inline speed control, click-cycles)
//   E             edit layout mode (materialize + arrange overlay panes)
//   F             focus mode (distraction-free framing around the stage)
//   O             toggle the pane-engine overlay layer
//   ?             toggle the shortcuts overlay
//   esc           close the topmost thing open: keymap overlay, then edit
//                 mode, then (a later slice) an open cabinet
//
// Kept from before, unchanged: N (notation), S (screenshot).
import { useEffect } from "react";
import { useStudyLoopStore } from "../state/store";
import { adjacentConceptTick } from "./conceptLoop";
import { conceptTickTimes } from "./analysisFormat";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function useHotkeys(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return undefined;

    function onKeyDown(e: KeyboardEvent): void {
      if (isTypingTarget(e.target)) return;

      const store = useStudyLoopStore.getState();
      const controller = store.controller;
      if (!controller) return;

      if (e.key === " ") {
        e.preventDefault();
        if (store.isPlaying) controller.pause();
        else controller.play();
        return;
      }

      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const direction = e.key === "ArrowRight" ? "next" : "prev";
        const times = conceptTickTimes(store.concepts, store.analysis?.concepts);
        const t = controller.getCurrentTime();
        const tick = times.length > 0 ? adjacentConceptTick(times, t, direction) : null;
        if (tick != null) controller.seek(tick);
        else controller.seek(Math.max(0, t + (direction === "next" ? 5 : -5)));
        return;
      }

      if (e.key === "?") {
        store.toggleKeymap();
        return;
      }

      switch (e.key.toLowerCase()) {
        case ",":
          controller.seek(Math.max(0, controller.getCurrentTime() - 1));
          break;
        case ".":
          controller.seek(controller.getCurrentTime() + 1);
          break;
        case "l":
          store.cycleAbLoop();
          break;
        case "n":
          store.openNotation();
          break;
        case "s":
          void store.captureScreenshotOnly();
          break;
        case "m":
          // Console slice 4: mine the current moment — frame + transcript
          // slice into a capture, no dialog, playback never stops.
          void store.mineMoment();
          break;
        case "x":
        case "c":
          // Console slice 6: condensed playback — skip the stretches with no
          // concepts (the heatmap/tick layer becomes a playback program).
          store.toggleCondensedPlayback();
          break;
        case "b":
          store.toggleCcEnabled();
          break;
        case "o":
          // Console slice 8: toggle the pane-engine overlay scaffold.
          store.toggleConsoleMode();
          break;
        case "e":
          // Console edit mode: materialize + arrange the overlay panes.
          store.toggleConsoleEditMode();
          break;
        case "f":
          store.toggleFocusMode();
          break;
        case "escape":
          if (store.keymapOpen) store.closeKeymap();
          else if (store.consoleEditMode) store.toggleConsoleEditMode();
          break;
        default:
          break;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
