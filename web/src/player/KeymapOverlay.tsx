// Console slice B (design/mockups/video-console/index.html lines 350-360,
// 730-744): the centered shortcuts overlay. `?` toggles it, Esc closes it
// (see lib/hotkeys.ts's Escape cascade — keymap takes priority over edit
// mode). Content mirrors hotkeys.ts's own header comment 1:1; keep both in
// sync when the grammar changes.
import styles from "./KeymapOverlay.module.css";

interface Row {
  label: string;
  keys: string;
}

const ROWS: Row[] = [
  { label: "Play / pause", keys: "space" },
  { label: "A-B loop: set A → set B → clear", keys: "L" },
  { label: "Mine this moment (frame + transcript)", keys: "M" },
  { label: "Condensed: play concepts only", keys: "C" },
  { label: "Toggle captions", keys: "B" },
  { label: "Zoom the timeline", keys: "scroll on seek bar" },
  { label: "Previous / next concept tick", keys: "← →" },
  { label: "Step 1s back / forward", keys: ", ." },
  { label: "Edit layout mode", keys: "E" },
  { label: "Focus mode", keys: "F" },
  { label: "Overlay layer", keys: "O" },
  { label: "Close everything", keys: "esc" },
  { label: "This overlay", keys: "?" },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function KeymapOverlay({ open, onClose }: Props): JSX.Element | null {
  if (!open) return null;
  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Console shortcuts">
        <h3 className={styles.heading}>Console shortcuts</h3>
        {ROWS.map((row) => (
          <div key={row.label} className={styles.row}>
            <span>{row.label}</span>
            <kbd className={styles.kbd}>{row.keys}</kbd>
          </div>
        ))}
      </div>
    </div>
  );
}
