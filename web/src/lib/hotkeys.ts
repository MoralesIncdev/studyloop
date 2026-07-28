// F3 ergonomics: the full hotkey set from SPEC, disabled while the user is typing
// in an input/textarea/contenteditable. Reads/writes the store directly (via
// getState()) rather than through selectors, since this is an imperative side
// effect hook, not something that should re-render on every keystroke.
import { useEffect } from "react";
import { clampRate, useStudyLoopStore } from "../state/store";

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
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        controller.seek(Math.max(0, controller.getCurrentTime() - 5));
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        controller.seek(controller.getCurrentTime() + 5);
        return;
      }

      switch (e.key.toLowerCase()) {
        case "j":
          controller.seek(Math.max(0, controller.getCurrentTime() - 10));
          break;
        case "l":
          controller.seek(controller.getCurrentTime() + 10);
          break;
        case "k":
          controller.pause();
          break;
        case ",": {
          const next = clampRate(store.playbackRate - 0.25);
          controller.setRate(next);
          store.setPlaybackRate(next);
          break;
        }
        case ".": {
          const next = clampRate(store.playbackRate + 0.25);
          controller.setRate(next);
          store.setPlaybackRate(next);
          break;
        }
        case "a":
          if (e.shiftKey) store.clearLoop();
          else store.setLoopA(controller.getCurrentTime());
          break;
        case "b":
          store.setLoopB(controller.getCurrentTime());
          break;
        case "n":
          store.pushToast("Notation capture arrives in a later build", "info");
          break;
        case "s":
          store.pushToast("Screenshot capture arrives in a later build", "info");
          break;
        default:
          break;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
