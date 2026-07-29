// Shared modal/panel exit lifecycle (codex P0-3 "modal exit lifecycle" +
// P1-6 "duplicated modal shells"). Every dialog in the app (Notation,
// Compile's two overlays, Import, Share, ConceptOverlay) used to unmount the
// instant its `open` boolean flipped false, cutting the CSS "-out" animation
// off before a single frame played. `usePresence` keeps the subtree mounted
// (with `data-state="closing"`) for `exitDurationMs`, matching the CSS
// animation duration each caller already declares, then unmounts for real.
// `ModalShell` wraps that hook with the overlay/backdrop + Escape key +
// backdrop-click-to-close + focus trap + focus restore logic every one of
// those five dialogs re-implemented slightly differently — callers still own
// their own card/panel markup and styling (widths, layout, content differ a
// lot between a centered 640px form and a 420px slide-in side panel), but the
// open/close *behavior* now lives in exactly one place.
import {
  useEffect,
  useRef,
  useState,
  type FormEventHandler,
  type ReactNode,
  type RefObject,
} from "react";

export type PresenceState = "open" | "closing";

export interface UsePresenceResult {
  /** Whether the subtree should still be in the DOM at all (true through the full exit animation). */
  mounted: boolean;
  /** Drives `data-state` on the overlay/card so CSS can select the "-out" keyframes. */
  state: PresenceState;
}

export function usePresence(open: boolean, exitDurationMs: number): UsePresenceResult {
  const [mounted, setMounted] = useState(open);
  const [state, setState] = useState<PresenceState>(open ? "open" : "closing");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setMounted(true);
      setState("open");
      return undefined;
    }
    setState("closing");
    // Use a functional check via a ref-free re-read: only start the unmount
    // timer if we were actually showing something (avoids scheduling a timer
    // on first mount when a dialog starts out closed).
    timerRef.current = setTimeout(() => setMounted(false), exitDurationMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- exitDurationMs is expected to stay constant per call site
  }, [open]);

  return { mounted, state };
}

interface ModalShellProps {
  open: boolean;
  onClose: () => void;
  /** Guards Escape/backdrop-click while a save/import/etc. is in flight (each caller's existing "busy" concept). */
  closeDisabled?: boolean;
  /** Must match the card's CSS exit-animation duration (e.g. `var(--duration-modal)` == 280). */
  exitDurationMs: number;
  ariaLabel: string;
  overlayClassName: string;
  cardClassName: string;
  /** NotationModal's card is a `<form>` (Save submits it); everything else is a plain `<div>`. */
  cardAs?: "div" | "form";
  onSubmit?: FormEventHandler<HTMLFormElement>;
  /** Focused on open instead of the card itself (e.g. NotationModal's textarea). */
  initialFocusRef?: RefObject<HTMLElement>;
  children: ReactNode;
}

/** Renders `null` once fully closed — same call shape as the conditional-render pattern every dialog used before, just with a delayed unmount. */
export function ModalShell({
  open,
  onClose,
  closeDisabled = false,
  exitDurationMs,
  ariaLabel,
  overlayClassName,
  cardClassName,
  cardAs = "div",
  onSubmit,
  initialFocusRef,
  children,
}: ModalShellProps): JSX.Element | null {
  const { mounted, state } = usePresence(open, exitDurationMs);
  const cardRef = useRef<HTMLElement>(null);
  const invokerRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      invokerRef.current = document.activeElement as HTMLElement | null;
      wasOpenRef.current = true;
      const raf = requestAnimationFrame(() => (initialFocusRef?.current ?? cardRef.current)?.focus());
      return () => cancelAnimationFrame(raf);
    }
    if (!open && wasOpenRef.current) {
      wasOpenRef.current = false;
      invokerRef.current?.focus?.();
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!mounted) return undefined;
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        if (closeDisabled) return;
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab" && cardRef.current) {
        const focusable = cardRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mounted, closeDisabled, onClose]);

  if (!mounted) return null;

  const handleBackdropMouseDown = (): void => {
    if (closeDisabled) return;
    onClose();
  };

  const cardCommon = {
    className: cardClassName,
    "data-state": state,
    role: "dialog" as const,
    "aria-modal": true,
    "aria-label": ariaLabel,
    onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
  };

  return (
    <div className={overlayClassName} data-state={state} role="presentation" onMouseDown={handleBackdropMouseDown}>
      {cardAs === "form" ? (
        <form ref={cardRef as RefObject<HTMLFormElement>} {...cardCommon} onSubmit={onSubmit}>
          {children}
        </form>
      ) : (
        <div ref={cardRef as RefObject<HTMLDivElement>} {...cardCommon}>
          {children}
        </div>
      )}
    </div>
  );
}
