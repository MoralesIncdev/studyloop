// V3-C C5 "Attention heatmap" (SPEC): click-to-inspect popover — "listing
// marks within that bucket (±1 bucket): author handle, type, text snippet;
// click row → seek". Purely presentational; SeekBar owns open/close state
// and resolves which marks to show (lib/attentionHeatmap.ts).
import { Icon } from "../components/icons";
import { formatTimestamp } from "../lib/time";
import type { HeatmapMark } from "../lib/types";
import styles from "./AttentionPopover.module.css";

interface Props {
  marks: HeatmapMark[];
  /** 0..1 — horizontal anchor along the strip, so the popover tracks the clicked point. */
  anchorRatio: number;
  onSeek: (t: number) => void;
  onClose: () => void;
}

export function AttentionPopover({ marks, anchorRatio, onSeek, onClose }: Props): JSX.Element {
  return (
    <div
      className={styles.popover}
      style={{ left: `clamp(96px, ${(anchorRatio * 100).toFixed(2)}%, calc(100% - 96px))` }}
      role="dialog"
      aria-label="Marks at this point"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className={styles.header}>
        <span className={styles.title}>Marks near here</span>
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
          <Icon name="close" size={12} />
        </button>
      </div>
      {marks.length === 0 ? (
        <p className={styles.empty}>No marks near this point.</p>
      ) : (
        <ul className={styles.list}>
          {marks.map((m, i) => (
            <li key={`${m.author}-${m.kind}-${m.t}-${i}`}>
              <button
                type="button"
                className={styles.row}
                onClick={() => {
                  onSeek(Math.max(0, m.t - 5));
                  onClose();
                }}
              >
                <span className={styles.rowMeta}>
                  <span className={styles.author}>{m.author}</span>
                  <span className={styles.kind} data-kind={m.kind}>
                    {m.kind === "pearl" ? "pearl" : "note"}
                  </span>
                  <span className={styles.time}>{formatTimestamp(m.t)}</span>
                </span>
                <span className={styles.text}>{m.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
