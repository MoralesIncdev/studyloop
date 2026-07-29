// codex P1-4 "tooltip component": one shared delayed tooltip replacing every
// browser-native `title=` in the player chrome (PlayerControls buttons +
// SeekBar's concept-tick/overlay-marker/loop-marker) — 450ms hover/focus
// delay in, no delay out, edge-clamped so it never runs off-screen near the
// player's corners. Clones the single trigger child rather than wrapping it
// in an extra DOM node, so it's a transparent drop-in for elements that rely
// on their own layout (absolute-positioned SeekBar markers, flex PlayerControls
// buttons) — no wrapper span to fight with `position: absolute; left: X%`.
import {
  cloneElement,
  isValidElement,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
  type ReactElement,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import styles from "./Tooltip.module.css";

const SHOW_DELAY_MS = 450;
const EDGE_MARGIN = 8;

type Placement = "top" | "bottom";

interface Coords {
  left: number;
  top: number;
  placement: Placement;
}

function composeHandlers<E>(
  a: ((e: E) => void) | undefined,
  b: (e: E) => void
): (e: E) => void {
  return (e: E) => {
    a?.(e);
    b(e);
  };
}

function setRef<T>(ref: Ref<T> | undefined, node: T | null): void {
  if (!ref) return;
  if (typeof ref === "function") ref(node);
  else (ref as { current: T | null }).current = node;
}

interface TooltipProps {
  /** Empty/undefined label renders the trigger with no tooltip behavior at all. */
  label?: string;
  disabled?: boolean;
  children: ReactElement;
}

export function Tooltip({ label, disabled, children }: TooltipProps): JSX.Element {
  const [coords, setCoords] = useState<Coords | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const bubbleRef = useRef<HTMLSpanElement | null>(null);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearShowTimer = (): void => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  };

  const show = (): void => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const placement: Placement = rect.top > 48 ? "top" : "bottom";
    setCoords({ left: rect.left + rect.width / 2, top: placement === "top" ? rect.top - EDGE_MARGIN : rect.bottom + EDGE_MARGIN, placement });
  };

  const scheduleShow = (): void => {
    if (disabled || !label) return;
    clearShowTimer();
    showTimerRef.current = setTimeout(show, SHOW_DELAY_MS);
  };

  const hide = (): void => {
    clearShowTimer();
    setCoords(null);
  };

  // Horizontal edge clamp, run after the bubble mounts so its measured width is known.
  useLayoutEffect(() => {
    if (!coords || !bubbleRef.current) return;
    const width = bubbleRef.current.offsetWidth;
    const minLeft = width / 2 + EDGE_MARGIN;
    const maxLeft = window.innerWidth - width / 2 - EDGE_MARGIN;
    const clamped = Math.min(Math.max(coords.left, minLeft), maxLeft);
    if (clamped !== coords.left) setCoords({ ...coords, left: clamped });
    // Re-clamping a already-clamped value is a no-op (equality check above), so this can't loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords]);

  useLayoutEffect(() => () => clearShowTimer(), []);

  if (!isValidElement(children)) return children;

  const child = children as ReactElement<{
    onMouseEnter?: (e: MouseEvent) => void;
    onMouseLeave?: (e: MouseEvent) => void;
    onFocus?: (e: FocusEvent) => void;
    onBlur?: (e: FocusEvent) => void;
    ref?: Ref<HTMLElement>;
  }>;

  const trigger = cloneElement(child, {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node;
      setRef(child.props.ref, node);
    },
    onMouseEnter: composeHandlers(child.props.onMouseEnter, scheduleShow),
    onMouseLeave: composeHandlers(child.props.onMouseLeave, hide),
    onFocus: composeHandlers(child.props.onFocus, scheduleShow),
    onBlur: composeHandlers(child.props.onBlur, hide),
  });

  return (
    <>
      {trigger}
      {coords &&
        label &&
        createPortal(
          <span
            ref={bubbleRef}
            role="tooltip"
            className={styles.bubble}
            data-placement={coords.placement}
            style={{ left: coords.left, top: coords.top }}
          >
            {label}
          </span>,
          document.body
        )}
    </>
  );
}
