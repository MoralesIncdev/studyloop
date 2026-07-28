// F7 concept ticker: the compact card that slides in over the video's bottom-left
// when a concept becomes active. Auto-dismisses itself after 12s (per SPEC);
// clicking the body (not the close button) expands the full card in a side overlay.
import { useEffect } from "react";
import { firstBodyLine } from "../lib/conceptFormat";
import { Icon } from "../components/icons";
import type { ConceptCard as ConceptCardType } from "../lib/types";
import styles from "./ConceptCard.module.css";

const AUTO_DISMISS_MS = 12_000;

interface Props {
  card: ConceptCardType;
  onDismiss: () => void;
  onExpand: () => void;
}

export function ConceptCard({ card, onDismiss, onExpand }: Props): JSX.Element {
  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
    // Intentionally a one-shot timer for the lifetime of this card instance
    // (a fresh ConceptCard is mounted per ticker entry — see ConceptTicker's
    // `key={entry.key}`), not something that should reset on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const preview = firstBodyLine(card.body);

  return (
    <div className={styles.card}>
      <button type="button" className={styles.dismiss} onClick={onDismiss} aria-label={`Dismiss ${card.title}`} title="Dismiss">
        <Icon name="close" size={20} />
      </button>
      <button type="button" className={styles.body} onClick={onExpand}>
        <span className={styles.metaRow}>
          <span className={styles.dot} aria-hidden="true" />
          <span className={styles.metaLabel}>Concept</span>
        </span>
        <span className={styles.title}>{card.title}</span>
        {preview && <span className={styles.preview}>{preview}</span>}
      </button>
    </div>
  );
}
